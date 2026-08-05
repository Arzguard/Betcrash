// SMS-IVS — service.js
// Core service implementing the lifecycle from the spec:
//   Request → Generate OTP → Hash → Send SMS → Verify → Validate →
//   Mark verified → Complete requested action
// Centralized policies; every protected module uses this service.

const crypto = require('crypto');
const { SmsStore } = require('./store');
const { PolicyStore } = require('./policies');
const { createProvider } = require('./provider');

const PURPOSES = ['register', 'login', 'withdraw', 'reset', 'phone_change', 'new_device', 'suspicious', 'recovery'];

class SmsVerificationService {
  constructor() {
    this.store = new SmsStore();
    this.policies = new PolicyStore();
    this.provider = createProvider(this.policies.get().provider, this.policies.get());
  }

  policy() { return this.policies.get(); }

  // POST /api/v1/sms/request
  async request({ purpose, dest }) {
    if (!PURPOSES.includes(purpose)) return { ok: false, status: 400, error: 'invalid_purpose' };
    if (!/^\+?[0-9]{9,13}$/.test(String(dest || ''))) return { ok: false, status: 400, error: 'invalid_destination' };
    const policy = this.policies.get();

    // Daily limit
    if (this.store.countToday(dest) >= policy.dailyLimit) {
      this.store.audit('LIMIT', { purpose, dest });
      return { ok: false, status: 429, error: 'daily_limit_reached' };
    }

    // Resend cooldown against the latest request for this purpose+dest —
    // applies even if the previous code was used or locked (anti-SMS-spam).
    const last = this.store.latestRequest(purpose, dest);
    if (last && Date.now() < last.cooldownUntil) {
      return { ok: false, status: 429, error: 'cooldown', retryAfterSec: Math.ceil((last.cooldownUntil - Date.now()) / 1000) };
    }

    const challengeId = crypto.randomBytes(16).toString('hex');
    const { code, record } = this.store.create(challengeId, purpose, dest, policy);
    this.store.audit('REQUESTED', record);

    // Send via the pluggable provider. The code leaves the service only here.
    let delivery;
    try {
      delivery = await this.provider.send(dest, `${policy.senderId}: your verification code is ${code}. Expires in ${Math.round(policy.expirySec / 60)} min.`);
      this.store.audit('SENT', record);
    } catch (e) {
      this.store.audit('FAILED', record);
      return { ok: false, status: 502, error: 'sms_send_failed' };
    }

    // Never return the code — clients get the challengeId only.
    // EXCEPT demo convenience: when the provider is the console (demo),
    // include demoCode so a local/dev frontend can show it like the SMS.
    const isDemoProvider = this.policies.get().provider === 'console';
    return { ok: true, challengeId, expiresInSec: policy.expirySec, delivery: delivery.status, ...(isDemoProvider ? { demoCode: code } : {}) };
  }

  // Deliver an arbitrary code (used by other modules, e.g. Auth) via the
  // shared provider — keeps all SMS in one place per the spec.
  async deliverCode(dest, code, purpose) {
    const policy = this.policies.get();
    const message = `${policy.senderId}: your verification code is ${code}. Expires in ${Math.round(policy.expirySec / 60)} min.`;
    try {
      const delivery = await this.provider.send(dest, message);
      this.store.audit('SENT', { purpose, dest });
      return { ok: true, delivery: delivery.status, demoCode: policy.provider === 'console' ? code : undefined };
    } catch (_) {
      this.store.audit('FAILED', { purpose, dest });
      return { ok: false, error: 'sms_send_failed' };
    }
  }

  // POST /api/v1/sms/verify
  verify({ challengeId, code }) {
    if (!challengeId || !/^\d{6}$/.test(String(code || ''))) return { ok: false, status: 400, error: 'invalid_request' };
    const result = this.store.verify(challengeId, String(code), this.policies.get());
    if (result === 'ok') return { ok: true, verified: true };
    return { ok: false, status: result === 'locked' ? 423 : result === 'expired' ? 410 : 401, error: result };
  }

  // POST /api/v1/sms/resend
  resend({ challengeId }) {
    const res = this.store.resend(challengeId, this.policies.get());
    if (!res.ok) {
      const status = res.error === 'cooldown' ? 429 : 404;
      return { ok: false, status, error: res.error, ...(res.retryAfterSec ? { retryAfterSec: res.retryAfterSec } : {}) };
    }
    let delivery;
    try {
      delivery = this.provider.send(res.record.dest, `${this.policies.get().senderId}: your new verification code is ${res.code}.`);
      this.store.audit('SENT', res.record);
    } catch (_) {
      return { ok: false, status: 502, error: 'sms_send_failed' };
    }
    return { ok: true, challengeId, expiresInSec: this.policies.get().expirySec, delivery: delivery.status };
  }

  // GET /api/v1/sms/status
  status() {
    return { ok: true, ...this.store.status(this.policies.get()) };
  }

  // PUT /api/v1/sms/policy (admin) — configure OTP policies
  updatePolicy(patch) {
    const p = this.policies.update(patch || {});
    this.provider = createProvider(p.provider, p);
    return { ok: true, policy: p };
  }
}

module.exports = { SmsVerificationService };
