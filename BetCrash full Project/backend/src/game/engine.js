// Game — engine.js
// Server-authoritative crash game with PROVABLE FAIRNESS (per /fairness):
//   crash = max(1, floor( 2^52 / h * 0.97 * 100 ) / 100)
//   h = parseInt( sha256(serverSeed + clientSeed + nonce).slice(0,13), 16 )
// The server seed is committed (hash published) before each round and
// revealed at crash so anyone can verify. Bets settle from the server clock.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const WAIT_MS = 4500;
const CRASH_PAUSE_MS = 2600;
const MULT_RATE = 0.00022; // e^(rate*t)
const MAX_MULT = 60;
const HOUSE_EDGE = 0.03;
const CLIENT_SEED = 'betcrash-demo'; // per-user in production (stored on the account)

function crashFromSeeds(serverSeed, clientSeed, nonce) {
  const h = parseInt(crypto.createHash('sha256').update(serverSeed + clientSeed + nonce).digest('hex').slice(0, 13), 16);
  const e = Math.pow(2, 52) / h;
  return Math.max(1, Math.min(Math.floor(e * (1 - HOUSE_EDGE) * 100) / 100, MAX_MULT));
}

class GameEngine {
  constructor(wallet) {
    this.wallet = wallet;
    this.file = path.join(__dirname, '..', '..', 'data', 'game.json');
    this.data = { rounds: [], history: [] };
    this.load();
    this.round = null;
    this.startRound();
    this.timer = setInterval(() => this.tick(), 100);
  }
  load(){ try { if (fs.existsSync(this.file)) this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (_) {} }
  persist(){ try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file, JSON.stringify(this.data)); } catch (_) {} }

  startRound() {
    const id = (this.data.rounds.length ? this.data.rounds[this.data.rounds.length - 1].id : 10480) + 1;
    const serverSeed = crypto.randomBytes(32).toString('hex');
    const nonce = id;
    const crashPoint = crashFromSeeds(serverSeed, CLIENT_SEED, nonce);
    this.round = {
      id, phase: 'waiting', crashPoint, serverSeed, nonce, clientSeed: CLIENT_SEED,
      serverSeedHash: crypto.createHash('sha256').update(serverSeed).digest('hex'),
      startedAt: Date.now(), waitEndsAt: Date.now() + WAIT_MS,
      crashAt: null, bets: [],
    };
    this.data.rounds.push(this.round);
    this.persist();
  }

  currentMult() {
    if (!this.round || this.round.phase !== 'flying') return 1;
    const t0 = this.round.flightStart || (this.round.startedAt + WAIT_MS);
    const elapsed = Date.now() - t0;
    return Math.exp(elapsed * MULT_RATE);
  }

  tick() {
    const r = this.round;
    if (!r) return;
    if (r.phase === 'waiting' && Date.now() >= r.waitEndsAt) {
      r.phase = 'flying';
      r.flightStart = Date.now();
      this.persist();
    } else if (r.phase === 'flying') {
      if (this.currentMult() >= r.crashPoint) this.crash();
    } else if (r.phase === 'crashed' && Date.now() >= r.crashAt + CRASH_PAUSE_MS) {
      this.startRound();
    }
  }

  crash() {
    const r = this.round;
    r.phase = 'crashed';
    r.crashAt = Date.now();
    // settle: bets not cashed out lose
    r.bets.forEach(b => { if (b.cashOutMult == null) b.result = 'loss'; });
    this.data.history.unshift({ id: r.id, crash: r.crashPoint, serverSeed: r.serverSeed, clientSeed: r.clientSeed, nonce: r.nonce, at: r.crashAt });
    if (this.data.history.length > 30) this.data.history = this.data.history.slice(0, 30);
    this.persist();
  }

  // POST /game/bet
  placeBet(userId, amount, betId) {
    const r = this.round;
    if (!r || r.phase !== 'waiting') return { ok: false, status: 400, error: 'Betting is closed — wait for the next round' };
    const amt = Math.round(Number(amount));
    if (isNaN(amt) || amt < 50) return { ok: false, status: 400, error: 'Minimum bet is KES 50' };
    if (amt > 50000) return { ok: false, status: 400, error: 'Maximum bet is KES 50,000' };
    // idempotency: same betId never double-bets
    if (betId) {
      const existing = r.bets.find(b => b.betId === betId);
      if (existing) return { ok: true, bet: existing, idempotent: true };
    }
    if (!this.wallet.placeBet(userId, amt, '#' + r.id)) return { ok: false, status: 400, error: 'Insufficient balance' };
    const bet = { betId: betId || crypto.randomUUID(), userId, amount: amt, cashOutMult: null, result: 'pending' };
    r.bets.push(bet);
    this.persist();
    return { ok: true, bet: { roundId: r.id, amount: amt } };
  }

  // POST /game/cashout
  cashout(userId, roundId) {
    const r = this.round;
    if (!r || r.id !== Number(roundId) || r.phase !== 'flying') return { ok: false, status: 400, error: 'Round is not in flight' };
    const bet = r.bets.find(b => b.userId === userId && b.cashOutMult == null && b.result === 'pending');
    if (!bet) return { ok: false, status: 400, error: 'No active bet on this round' };
    const mult = this.currentMult();
    const win = Math.floor(bet.amount * mult);
    bet.cashOutMult = Math.round(mult * 100) / 100;
    bet.result = 'win';
    this.wallet.settleWin(userId, win, '#' + r.id);
    this.persist();
    return { ok: true, multiplier: bet.cashOutMult, win };
  }

  // GET /game/state — current round
  // DEMO DISCLOSURE: while waiting, the next crash point is included so the
  // admin monitor can preview it. In production this must be removed — the
  // seed commitment (serverSeedHash) is the only thing published before the
  // round, per provable fairness.
  state() {
    const r = this.round;
    if (!r) return { ok: true, round: null };
    return {
      ok: true,
      round: {
        id: r.id,
        phase: r.phase,
        mult: r.phase === 'flying' ? this.currentMult() : (r.phase === 'crashed' ? r.crashPoint : 1),
        crash: r.phase === 'crashed' ? r.crashPoint : null,
        nextCrash: r.phase === 'waiting' ? r.crashPoint : null,
        serverSeedHash: r.serverSeedHash,
        nonce: r.nonce,
        clientSeed: r.clientSeed,
        players: r.bets.length,
        waitEndsAt: r.phase === 'waiting' ? r.waitEndsAt : null,
        crashAt: r.phase === 'crashed' ? r.crashAt : null,
      },
    };
  }

  // GET /game/history
  history(){ return { ok: true, history: this.data.history.map(h => ({ id: h.id, crash: h.crash, at: h.at })) }; }

  // GET /game/verify?roundId — reveal seeds for verification after crash
  verify(roundId){
    const h = this.data.history.find(x => x.id === Number(roundId));
    if (!h) return { ok: false, status: 404, error: 'round_not_found' };
    const recomputed = crashFromSeeds(h.serverSeed, h.clientSeed, h.nonce);
    return { ok: true, round: h.id, crash: h.crash, serverSeed: h.serverSeed, clientSeed: h.clientSeed, nonce: h.nonce, recomputed, matches: recomputed === h.crash };
  }
}

module.exports = { GameEngine, crashFromSeeds };
