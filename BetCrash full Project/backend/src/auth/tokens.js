// Auth — tokens.js
// Minimal HMAC-SHA256 JWT (HS256) implementation, zero dependencies.
// Access tokens: 15 min. Refresh tokens: 7 days, rotated on use.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function getSecret() {
  const file = path.join(__dirname, '..', '..', 'data', 'jwt-secret.json');
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')).secret;
  } catch (_) {}
  const secret = crypto.randomBytes(32).toString('hex');
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ secret }));
  } catch (_) {}
  return secret;
}
const SECRET = getSecret();

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');

function makeToken(payload, ttlSec) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = { ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + ttlSec, jti: crypto.randomBytes(8).toString('hex') };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(body));
  return `${h}.${p}.${sign(h + '.' + p)}`;
}

function verifyToken(token) {
  try {
    const [h, p, s] = String(token || '').split('.');
    if (!h || !p || !s) return null;
    if (sign(h + '.' + p) !== s) return null;
    const body = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    if (body.exp * 1000 < Date.now()) return null;
    return body;
  } catch (_) { return null; }
}

module.exports = {
  makeAccessToken: (payload) => makeToken(payload, 15 * 60),
  makeRefreshToken: (payload) => makeToken(payload, 7 * 24 * 3600),
  verifyToken,
};
