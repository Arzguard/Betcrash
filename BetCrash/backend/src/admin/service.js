// Admin — service.js
// Admin authentication: username + password → SMS 2FA → role token.
// Roles mirror the Staff-IAM hierarchy (superadmin … auditor).

const crypto = require('crypto');
const { makeAccessToken, verifyToken } = require('../auth/tokens');

const hashPw = (pw) => crypto.createHash('sha256').update('betcrash-admin:' + pw).digest('hex');

class AdminService {
  constructor(sms) {
    this.sms = sms;
    this.admins = [
      { username: 'admin', passwordHash: hashPw('betcrash2026'), role: 'superadmin', name: 'N. Kariuki', phone: '254700000000' },
    ];
    this.challenges = []; // { id, username, codeHash, salt, expiresAt, attempts, locked }
  }
  find(username){ return this.admins.find(a => a.username === username) || null; }

  async login({ username, password }) {
    const admin = this.find(String(username || '').trim());
    if (!admin || admin.passwordHash !== hashPw(String(password || ''))) return { ok: false, status: 401, error: 'Invalid credentials' };
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const salt = crypto.randomBytes(16).toString('hex');
    const ch = {
      id: crypto.randomUUID(), username: admin.username,
      codeHash: crypto.createHash('sha256').update(salt + ':' + code).digest('hex'), salt,
      expiresAt: Date.now() + 5 * 60 * 1000, attempts: 0, locked: false, used: false,
    };
    this.challenges.push(ch);
    const sent = await this.sms.deliverCode(admin.phone, code, 'admin_login');
    return { ok: true, challengeId: ch.id, ...(sent.demoCode ? { demoCode: sent.demoCode } : {}) };
  }

  verify({ challengeId, code }) {
    const ch = this.challenges.find(c => c.id === challengeId);
    if (!ch) return { ok: false, status: 401, error: 'invalid_challenge' };
    if (ch.used) return { ok: false, status: 401, error: 'used' };
    if (ch.locked) return { ok: false, status: 423, error: 'locked' };
    if (Date.now() > ch.expiresAt) return { ok: false, status: 410, error: 'expired' };
    const hash = crypto.createHash('sha256').update(ch.salt + ':' + code).digest('hex');
    if (hash !== ch.codeHash) {
      ch.attempts += 1;
      if (ch.attempts >= 5) ch.locked = true;
      return { ok: false, status: ch.locked ? 423 : 401, error: ch.locked ? 'locked' : 'invalid_code' };
    }
    ch.used = true;
    const admin = this.find(ch.username);
    const token = makeAccessToken({ sub: admin.username, kind: 'admin', role: admin.role });
    return { ok: true, token, role: admin.role, name: admin.name };
  }

  me(token) {
    const body = verifyToken(token);
    if (!body || body.kind !== 'admin') return { ok: false, status: 401, error: 'unauthorized' };
    const admin = this.find(body.sub);
    if (!admin) return { ok: false, status: 401, error: 'unauthorized' };
    return { ok: true, admin: { username: admin.username, name: admin.name, role: admin.role } };
  }
}

module.exports = { AdminService };
