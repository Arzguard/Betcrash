// Auth — service.js
// Player authentication: register (National ID unique), two-step login
// (password → SMS OTP), password reset, refresh rotation. All codes are
// delivered through the shared SMS-IVS service.

const crypto = require('crypto');
const { AuthStore } = require('./store');
const { makeAccessToken, makeRefreshToken, verifyToken } = require('./tokens');

const COOLDOWN_MS = 60 * 1000;
const maskPhone = (p) => {
  const local = '0' + String(p).replace(/^254/, '');
  return local.slice(0, 4) + '••••' + local.slice(-2);
};

class AuthService {
  constructor(sms) {
    this.store = new AuthStore();
    this.sms = sms; // shared SMS-IVS service
  }

  _issueTokens(user) {
    const accessToken = makeAccessToken({ sub: user.id, kind: 'player' });
    const refreshPayload = makeRefreshToken({ sub: user.id, kind: 'player' });
    const refreshToken = refreshPayload;
    const body = verifyToken(refreshToken);
    this.store.saveRefresh(user.id, body.jti, body.exp * 1000);
    return { accessToken, refreshToken };
  }

  // POST /auth/register
  async register({ idNumber, phone, password, name }) {
    idNumber = String(idNumber || '').trim();
    phone = String(phone || '').replace(/[^\d]/g, '');
    if (!/^\d{6,9}$/.test(idNumber)) return { ok: false, status: 400, error: 'Invalid National ID number' };
    if (!/^(07|01)\d{8}$/.test(phone) && !/^254(7|1)\d{8}$/.test(phone)) return { ok: false, status: 400, error: 'Invalid Kenyan phone number' };
    if (phone.startsWith('0')) phone = '254' + phone.slice(1);
    if (!password || password.length < 8) return { ok: false, status: 400, error: 'Password must be at least 8 characters' };
    const user = this.store.createUser({ idNumber, phone, password, name });
    if (!user) return { ok: false, status: 409, error: 'National ID or phone already registered' };
    const { challenge, code } = this.store.createChallenge(user.id, 'register');
    const sent = await this.sms.deliverCode(phone, code, 'register');
    if (!sent.ok) return { ok: false, status: 502, error: 'SMS delivery failed' };
    return { ok: true, challengeId: challenge.id, expiresInSec: 300, ...(sent.demoCode ? { demoCode: sent.demoCode } : {}) };
  }

  // POST /auth/verify-otp  (registration phone verification)
  verifyOtp({ challengeId, code }) {
    const res = this.store.verifyChallenge(challengeId, code);
    if (res !== 'ok') return { ok: false, status: res === 'locked' ? 423 : res === 'expired' ? 410 : 401, error: res };
    const ch = this.store.findChallenge(challengeId);
    const user = this.store.verifyPhone(ch.userId);
    return { ok: true, ...this._issueTokens(user), user: this._publicUser(user) };
  }

  // POST /auth/login — step 1: password check, then SMS challenge
  async login({ idNumber, password }) {
    const user = this.store.findByIdNumber(String(idNumber || '').trim());
    if (!user || !this.store.checkPassword(user, password)) return { ok: false, status: 401, error: 'Incorrect National ID or password' };
    const { challenge, code } = this.store.createChallenge(user.id, 'login');
    const sent = await this.sms.deliverCode(user.phone, code, 'login');
    if (!sent.ok) return { ok: false, status: 502, error: 'SMS delivery failed' };
    return { ok: true, challengeId: challenge.id, maskedPhone: maskPhone(user.phone), ...(sent.demoCode ? { demoCode: sent.demoCode } : {}) };
  }

  // POST /auth/verify-login — step 2: OTP → tokens
  verifyLogin({ challengeId, code }) {
    const res = this.store.verifyChallenge(challengeId, code);
    if (res !== 'ok') return { ok: false, status: res === 'locked' ? 423 : res === 'expired' ? 410 : 401, error: res };
    const ch = this.store.findChallenge(challengeId);
    const user = this.store.findById(ch.userId);
    if (!user) return { ok: false, status: 404, error: 'user_not_found' };
    return { ok: true, ...this._issueTokens(user), user: this._publicUser(user) };
  }

  // POST /auth/resend-otp — 60s cooldown, new code on the same challenge
  async resendOtp({ challengeId }) {
    const ch = this.store.findChallenge(challengeId);
    if (!ch) return { ok: false, status: 404, error: 'challenge_not_found' };
    if (ch.cooldownUntil && Date.now() < ch.cooldownUntil) {
      return { ok: false, status: 429, error: 'cooldown', retryAfterSec: Math.ceil((ch.cooldownUntil - Date.now()) / 1000) };
    }
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const salt = crypto.randomBytes(16).toString('hex');
    const { hashCode } = require('./store');
    ch.codeHash = hashCode(code, salt); ch.salt = salt;
    ch.attempts = 0; ch.locked = false; ch.used = false;
    ch.cooldownUntil = Date.now() + COOLDOWN_MS;
    ch.expiresAt = Date.now() + 5 * 60 * 1000;
    this.store.persist();
    const user = this.store.findById(ch.userId);
    const sent = await this.sms.deliverCode(user.phone, code, ch.purpose);
    if (!sent.ok) return { ok: false, status: 502, error: 'SMS delivery failed' };
    return { ok: true, challengeId, ...(sent.demoCode ? { demoCode: sent.demoCode } : {}) };
  }

  // POST /auth/refresh
  refresh({ refreshToken }) {
    const body = verifyToken(refreshToken);
    if (!body || body.kind !== 'player') return { ok: false, status: 401, error: 'invalid_refresh_token' };
    const session = this.store.findRefresh(body.jti);
    if (!session) return { ok: false, status: 401, error: 'invalid_refresh_token' };
    const user = this.store.findById(session.userId);
    if (!user) return { ok: false, status: 401, error: 'user_not_found' };
    this.store.revokeRefresh(body.jti); // rotation
    return { ok: true, ...this._issueTokens(user) };
  }

  // GET /auth/me
  me(token) {
    const body = verifyToken(token);
    const user = body && this.store.findById(body.sub);
    if (!user) return { ok: false, status: 401, error: 'unauthorized' };
    return { ok: true, user: this._publicUser(user) };
  }

  _publicUser(u) {
    return {
      id: u.id,
      idNumber: u.idNumber,
      phone: maskPhone(u.phone),
      name: u.name,
      kycVerified: u.kycVerified,
      clientSeed: u.clientSeed,
      createdAt: u.createdAt,
    };
  }

  // ── Password reset ──
  async resetRequest({ idNumber }) {
    const user = this.store.findByIdNumber(String(idNumber || '').trim());
    if (!user) return { ok: false, status: 404, error: 'No account found for this National ID' };
    const { challenge, code } = this.store.createChallenge(user.id, 'reset');
    const sent = await this.sms.deliverCode(user.phone, code, 'reset');
    if (!sent.ok) return { ok: false, status: 502, error: 'SMS delivery failed' };
    return { ok: true, challengeId: challenge.id, ...(sent.demoCode ? { demoCode: sent.demoCode } : {}) };
  }
  resetVerify({ challengeId, code }) {
    const res = this.store.verifyChallenge(challengeId, code);
    if (res !== 'ok') return { ok: false, status: res === 'locked' ? 423 : res === 'expired' ? 410 : 401, error: res };
    const ch = this.store.findChallenge(challengeId);
    const resetToken = makeAccessToken({ sub: ch.userId, kind: 'reset' }); // short-lived (15m)
    return { ok: true, resetToken };
  }
  resetPassword({ resetToken, newPassword }) {
    const body = verifyToken(resetToken);
    if (!body || body.kind !== 'reset') return { ok: false, status: 401, error: 'invalid_or_expired_reset_token' };
    if (!newPassword || newPassword.length < 8) return { ok: false, status: 400, error: 'Password must be at least 8 characters' };
    const user = this.store.setPassword(body.sub, newPassword);
    if (!user) return { ok: false, status: 404, error: 'user_not_found' };
    // revoke all refresh sessions (force re-login everywhere)
    this.store.data.refreshSessions.forEach(s => { if (s.userId === user.id) s.revoked = true; });
    this.store.persist();
    return { ok: true };
  }
}

module.exports = { AuthService };
