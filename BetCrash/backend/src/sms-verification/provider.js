// SMS-IVS — provider.js
// SMS provider abstraction. The spec keeps providers pluggable so the same
// service can send via Africa's Talking, Safaricom Daraja, Twilio, etc.
// The console provider logs the message (demo/dev). Real providers only
// need to implement `send(dest, message)`.

class ConsoleProvider {
  async send(dest, message) {
    // DEMO ONLY: log to console. Never log codes in production.
    console.log(`[SMS-IVS:console] to=${dest} "${message}"`);
    return { status: 'sent', providerRef: 'console-' + Date.now() };
  }
}

// Stub showing how a real provider plugs in (fill with your credentials).
class AfricaStalkingProvider {
  constructor(apiKey, username, senderId) {
    this.apiKey = apiKey; this.username = username; this.senderId = senderId;
  }
  async send(dest, message) {
    // const url = 'https://api.africastalking.com/version1/messaging';
    // POST with apiKey header; body: username, to=dest, message, from=senderId
    throw new Error('AfricaStalkingProvider not configured');
  }
}

function createProvider(kind, policy) {
  if (kind === 'africastalking') return new AfricaStalkingProvider(process.env.AT_API_KEY, process.env.AT_USERNAME, policy.senderId);
  return new ConsoleProvider();
}

module.exports = { createProvider, ConsoleProvider };
