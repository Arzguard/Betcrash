// SMS-IVS — policies.js
// Configurable OTP policies per the SMS-IVS v1.0 spec (Administration section).
// Persisted to a JSON file; hot-reloadable at runtime.

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  expirySec: 300,        // 5-minute expiry
  cooldownSec: 60,       // 60-second resend cooldown
  maxAttempts: 5,        // brute-force protection
  dailyLimit: 10,        // configurable daily limit per destination
  senderId: 'BetCrash',  // SMS sender ID (11 chars max)
  provider: 'console',   // 'console' | 'africastalking' | 'safaricom' | 'twilio'
};

class PolicyStore {
  constructor(file = path.join(__dirname, '..', '..', 'data', 'policies.json')) {
    this.file = file;
    this.policy = { ...DEFAULTS };
    this.load();
  }
  load() {
    try {
      if (fs.existsSync(this.file)) {
        const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        this.policy = { ...DEFAULTS, ...saved };
      }
    } catch (_) { /* keep defaults */ }
  }
  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.policy, null, 2));
    } catch (_) {}
  }
  get() { return { ...this.policy }; }
  update(patch) {
    const p = { ...this.policy };
    if (patch.expirySec != null) p.expirySec = Math.max(30, Math.min(1800, Number(patch.expirySec) || 300));
    if (patch.cooldownSec != null) p.cooldownSec = Math.max(5, Math.min(600, Number(patch.cooldownSec) || 60));
    if (patch.maxAttempts != null) p.maxAttempts = Math.max(1, Math.min(20, Number(patch.maxAttempts) || 5));
    if (patch.dailyLimit != null) p.dailyLimit = Math.max(1, Math.min(100, Number(patch.dailyLimit) || 10));
    if (patch.senderId) p.senderId = String(patch.senderId).slice(0, 11);
    if (patch.provider) p.provider = String(patch.provider);
    this.policy = p;
    this.save();
    return this.get();
  }
}

module.exports = { PolicyStore, DEFAULTS };
