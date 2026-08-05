// Auth — store.js
// Player accounts (National ID = unique identifier), OTP challenges for
// register/login/reset, refresh-token sessions.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const uuid = () => crypto.randomUUID();
const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
// Password hashing (demo): production must use argon2/bcrypt.
const hashPassword = (pw) => sha256('betcrash-pw:' + pw);
const hashCode = (code, salt) => sha256(salt + ':' + code);
const newSalt = () => crypto.randomBytes(16).toString('hex');

class AuthStore {
  constructor(dir = path.join(__dirname, '..', '..', 'data')) {
    this.file = path.join(dir, 'auth.json');
    this.data = { users: [], challenges: [], refreshSessions: [] };
    this.load();
  }
  load(){ try { if (fs.existsSync(this.file)) this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (_) {} }
  persist(){ try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file, JSON.stringify(this.data)); } catch (_) {} }

  findByIdNumber(idNumber){ return this.data.users.find(u => u.idNumber === String(idNumber)) || null; }
  findByPhone(phone){ return this.data.users.find(u => u.phone === String(phone)) || null; }
  findById(id){ return this.data.users.find(u => u.id === id) || null; }

  createUser({ idNumber, phone, password, name }) {
    if (this.findByIdNumber(idNumber) || this.findByPhone(phone)) return null;
    const user = {
      id: uuid(),
      idNumber: String(idNumber),
      phone: String(phone),
      name: name || 'Player',
      passwordHash: hashPassword(password),
      kycVerified: false,
      riskFlagged: false,
      phoneVerified: false,
      createdAt: Date.now(),
      clientSeed: crypto.randomBytes(16).toString('hex'), // provable fairness
      nonce: 0,
    };
    this.data.users.push(user);
    this.persist();
    return user;
  }
  verifyPhone(id){ const u = this.findById(id); if (u){ u.phoneVerified = true; this.persist(); } return u; }
  setPassword(id, password){ const u = this.findById(id); if (u){ u.passwordHash = hashPassword(password); this.persist(); } return u; }
  checkPassword(user, password){ return user.passwordHash === hashPassword(password); }

  // ── OTP challenges (register | login | reset) ──
  createChallenge(userId, purpose, ttlSec = 300, maxAttempts = 5) {
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const salt = newSalt();
    const ch = {
      id: uuid(), userId, purpose,
      codeHash: hashCode(code, salt), salt,
      attempts: 0, locked: false, used: false,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttlSec * 1000,
    };
    this.data.challenges.push(ch);
    this.persist();
    return { challenge: ch, code };
  }
  findChallenge(id){ return this.data.challenges.find(c => c.id === id) || null; }
  verifyChallenge(id, code, maxAttempts = 5) {
    const ch = this.findChallenge(id);
    if (!ch) return 'invalid';
    if (ch.used) return 'used';
    if (ch.locked) return 'locked';
    if (Date.now() > ch.expiresAt) return 'expired';
    if (hashCode(code, ch.salt) !== ch.codeHash) {
      ch.attempts += 1;
      if (ch.attempts >= maxAttempts) ch.locked = true;
      this.persist();
      return ch.locked ? 'locked' : 'wrong';
    }
    ch.used = true;
    this.persist();
    return 'ok';
  }

  // ── Refresh sessions ──
  saveRefresh(userId, tokenId, expiresAt) {
    this.data.refreshSessions.push({ tokenId, userId, createdAt: Date.now(), expiresAt, revoked: false });
    this.persist();
  }
  findRefresh(tokenId){ return this.data.refreshSessions.find(s => s.tokenId === tokenId && !s.revoked && s.expiresAt > Date.now()) || null; }
  revokeRefresh(tokenId){ const s = this.data.refreshSessions.find(x => x.tokenId === tokenId); if (s){ s.revoked = true; this.persist(); } }
}

module.exports = { AuthStore, hashPassword, hashCode, newSalt, uuid };
