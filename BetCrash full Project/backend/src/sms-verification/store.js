// SMS-IVS — store.js
// OTP Requests + SMS Audit Log storage. In-memory with JSON-file persistence
// so this runs anywhere; swap for SQLite/Postgres in production (schema below).
//
// SECURITY: codes are stored HASHED (sha256 + per-record salt) — the plaintext
// exists only in memory briefly for the SMS provider, and the API never
// returns it.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const hashCode = (code, salt) => crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex');
const newSalt = () => crypto.randomBytes(16).toString('hex');

const SCHEMA_SQL = `
-- OTP Requests
CREATE TABLE otp_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id TEXT UNIQUE NOT NULL,
  purpose TEXT NOT NULL,            -- register|login|withdraw|reset|phone_change|new_device|suspicious|recovery
  dest TEXT NOT NULL,               -- phone number
  day TEXT NOT NULL,                -- YYYY-MM-DD (daily limit)
  code_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  locked INTEGER DEFAULT 0,
  used INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  cooldown_until INTEGER NOT NULL
);
-- Trusted Devices
CREATE TABLE trusted_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  device_token TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL
);
-- SMS Audit Log
CREATE TABLE sms_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id TEXT,
  purpose TEXT,
  dest TEXT,
  event TEXT NOT NULL,              -- REQUESTED|SENT|VERIFIED|FAILED|LOCKED|EXPIRED|LIMIT
  created_at INTEGER NOT NULL
);
`;

class SmsStore {
  constructor(dir = path.join(__dirname, '..', '..', 'data')) {
    this.dir = dir;
    this.file = path.join(dir, 'sms-ivs.json');
    this.data = { otps: [], audit: [], seq: 1 };
    this.load();
  }
  load() {
    try {
      if (fs.existsSync(this.file)) this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (_) {}
  }
  persist() {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data));
    } catch (_) {}
  }

  audit(event, { challengeId, purpose, dest }) {
    this.data.audit.push({ challengeId, purpose, dest, event, createdAt: Date.now() });
    if (this.data.audit.length > 500) this.data.audit = this.data.audit.slice(-500);
    this.persist();
  }

  // Returns { challengeId, code } — code is the plaintext for the provider only.
  create(challengeId, purpose, dest, policy) {
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const salt = newSalt();
    const now = Date.now();
    const rec = {
      challengeId, purpose, dest, day: new Date(now).toISOString().slice(0, 10),
      codeHash: hashCode(code, salt), salt,
      attempts: 0, locked: false, used: false,
      createdAt: now,
      expiresAt: now + policy.expirySec * 1000,
      cooldownUntil: now + policy.cooldownSec * 1000,
    };
    this.data.otps.push(rec);
    this.persist();
    return { challengeId, code, record: rec };
  }

  find(challengeId) { return this.data.otps.find(o => o.challengeId === challengeId) || null; }

  // Most recent request for purpose+dest regardless of state (cooldown check —
  // the 60s cooldown applies even after a code was used or locked).
  latestRequest(purpose, dest) {
    return [...this.data.otps].reverse().find(o => o.purpose === purpose && o.dest === dest) || null;
  }

  latestPending(purpose, dest) {
    const list = [...this.data.otps].reverse();
    return list.find(o => o.purpose === purpose && o.dest === dest && !o.used && !o.locked && o.expiresAt > Date.now()) || null;
  }

  countToday(dest) {
    const today = new Date().toISOString().slice(0, 10);
    return this.data.otps.filter(o => o.dest === dest && o.day === today).length;
  }

  // Brute-force-safe verify: wrong codes count against the latest pending
  // challenge for that purpose. Returns 'ok' | 'wrong' | 'locked' | 'expired' | 'used'.
  verify(challengeId, code, policy) {
    const o = this.find(challengeId);
    if (!o) return 'wrong';
    if (o.used) return 'used';
    if (o.locked) return 'locked';
    if (Date.now() > o.expiresAt) { this.audit('EXPIRED', o); return 'expired'; }
    if (hashCode(String(code), o.salt) !== o.codeHash) {
      o.attempts += 1;
      if (o.attempts >= policy.maxAttempts) { o.locked = true; this.audit('LOCKED', o); }
      this.persist();
      return o.locked ? 'locked' : 'wrong';
    }
    o.used = true;
    this.persist();
    this.audit('VERIFIED', o);
    return 'ok';
  }

  // Resend: re-issues a code for a pending challenge, respecting cooldown.
  resend(challengeId, policy) {
    const o = this.find(challengeId);
    if (!o || o.used || o.locked || Date.now() > o.expiresAt) return { ok: false, error: 'no_pending_challenge' };
    if (Date.now() < o.cooldownUntil) {
      return { ok: false, error: 'cooldown', retryAfterSec: Math.ceil((o.cooldownUntil - Date.now()) / 1000) };
    }
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const salt = newSalt();
    o.codeHash = hashCode(code, salt); o.salt = salt;
    o.attempts = 0; o.locked = false; o.used = false;
    o.createdAt = Date.now();
    o.expiresAt = Date.now() + policy.expirySec * 1000;
    o.cooldownUntil = Date.now() + policy.cooldownSec * 1000;
    this.persist();
    this.audit('REQUESTED', o);
    return { ok: true, code, record: o };
  }

  status(policy) {
    const today = new Date().toISOString().slice(0, 10);
    const todays = this.data.otps.filter(o => o.day === today);
    const now = Date.now();
    return {
      provider: policy.provider,
      senderId: policy.senderId,
      policy: { expirySec: policy.expirySec, cooldownSec: policy.cooldownSec, maxAttempts: policy.maxAttempts, dailyLimit: policy.dailyLimit },
      metrics: {
        sentToday: todays.length,
        verifiedToday: todays.filter(o => o.used).length,
        failedToday: todays.filter(o => o.locked || (!o.used && o.expiresAt <= now)).length,
        blockedByLimitToday: this.data.audit.filter(a => a.event === 'LIMIT' && new Date(a.createdAt).toISOString().slice(0, 10) === today).length,
      },
      auditRecent: this.data.audit.slice(-10).reverse(),
    };
  }
}

module.exports = { SmsStore, hashCode, SCHEMA_SQL };
