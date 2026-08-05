// BetCrash central backend — SMS-IVS + Staff-IAM + Auth + Wallet + Game + Admin
// Run: node server.js   (data persists in ./data)

const http = require('http');
const { SmsVerificationService } = require('./src/sms-verification/service');
const { StaffIamService } = require('./src/staff-iam/service');
const { AuthService } = require('./src/auth/service');
const { WalletService } = require('./src/wallet/service');
const { GameEngine } = require('./src/game/engine');
const { AdminService } = require('./src/admin/service');
const { verifyToken } = require('./src/auth/tokens');

const PORT = process.env.PORT || 3333;

const sms = new SmsVerificationService();
const iam = new StaffIamService();
const auth = new AuthService(sms);
const wallet = new WalletService(auth);
const game = new GameEngine(wallet);
const admin = new AdminService(sms);

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch (_) { resolve({}); } });
  });
}
function send(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', ...extraHeaders });
  res.end(JSON.stringify(payload));
}
const bearerUser = (req) => {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer (.+)$/);
  if (!m) return null;
  const body = verifyToken(m[1]);
  return body && body.kind === 'player' ? body.sub : null;
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const route = url.pathname;
  const b = await readBody(req);
  try {

    /* ── SMS-IVS ── */
    if (req.method === 'POST' && route === '/api/v1/sms/request') return send(res, 200, await sms.request(b));
    if (req.method === 'POST' && route === '/api/v1/sms/verify') return send(res, 200, sms.verify(b));
    if (req.method === 'POST' && route === '/api/v1/sms/resend') return send(res, 200, sms.resend(b));
    if (req.method === 'GET' && route === '/api/v1/sms/status') return send(res, 200, sms.status());
    if (req.method === 'PUT' && route === '/api/v1/sms/policy') return send(res, 200, sms.updatePolicy(b));

    /* ── Staff IAM ── */
    if (route.startsWith('/api/v1/staff')) {
      const id = route.split('/')[4];
      const action = route.split('/')[5];
      let r;
      if (req.method === 'GET' && route === '/api/v1/staff') r = iam.list(b);
      else if (req.method === 'GET' && route === '/api/v1/staff/roles') r = iam.roles();
      else if (req.method === 'GET' && route === '/api/v1/staff/sessions') r = iam.sessions();
      else if (req.method === 'GET' && route === '/api/v1/staff/audit') r = iam.audit();
      else if (req.method === 'POST' && route === '/api/v1/staff') r = iam.createStaff(b);
      else if (req.method === 'POST' && route === '/api/v1/staff/activate') r = iam.activate(b);
      else if (req.method === 'POST' && route === '/api/v1/staff/login') r = iam.login(b);
      else if (req.method === 'POST' && route === '/api/v1/staff/devices/verify') r = iam.verifyDevice(b);
      else if (req.method === 'POST' && id && action === 'invite') r = await iam.invite(id, b);
      else if (req.method === 'POST' && id && action === 'status') r = iam.setStatus(id, b);
      else if (req.method === 'POST' && id && action === 'revoke') r = iam.revoke(id, b);
      else if (req.method === 'DELETE' && id) { iam.store.softDelete(id); iam.store.audit(b.actor || 'system', 'staff.delete', id, b.device || null, 'success'); r = { ok: true }; }
      else if (req.method === 'GET' && id) r = iam.profile(id);
      else r = { status: 404 };
      return send(res, r.ok === false && r.status ? r.status : 200, r);
    }

    /* ── Auth (players) ── */
    if (route.startsWith('/auth')) {
      let r;
      if (req.method === 'POST' && route === '/auth/register') r = await auth.register(b);
      else if (req.method === 'POST' && route === '/auth/verify-otp') r = auth.verifyOtp(b);
      else if (req.method === 'POST' && route === '/auth/login') r = await auth.login(b);
      else if (req.method === 'POST' && route === '/auth/verify-login') r = auth.verifyLogin(b);
      else if (req.method === 'POST' && route === '/auth/resend-otp') r = await auth.resendOtp(b);
      else if (req.method === 'POST' && route === '/auth/refresh') r = auth.refresh(b);
      else if (req.method === 'POST' && route === '/auth/reset-request') r = await auth.resetRequest(b);
      else if (req.method === 'POST' && route === '/auth/reset-verify') r = auth.resetVerify(b);
      else if (req.method === 'POST' && route === '/auth/reset-password') r = auth.resetPassword(b);
      else if (req.method === 'GET' && route === '/auth/me') r = auth.me(bearerUser(req) ? req.headers.authorization.replace('Bearer ', '') : null);
      else r = { status: 404 };
      return send(res, r.ok === false && r.status ? r.status : 200, r);
    }

    /* ── Wallet (auth required) ── */
    if (route.startsWith('/wallet')) {
      const userId = bearerUser(req);
      if (!userId) return send(res, 401, { error: 'unauthorized' });
      let r;
      if (req.method === 'GET' && route === '/wallet/balance') r = wallet.balance(userId, auth.store.findById(userId));
      else if (req.method === 'GET' && route === '/wallet/transactions') r = wallet.transactions(userId);
      else if (req.method === 'POST' && route === '/wallet/deposit') r = wallet.deposit(userId, b);
      else if (req.method === 'POST' && route === '/wallet/withdraw') r = await wallet.withdraw(userId, b);
      else if (req.method === 'POST' && route === '/wallet/withdraw/confirm') r = wallet.withdrawConfirm(userId, b);
      else r = { status: 404 };
      return send(res, r.ok === false && r.status ? r.status : 200, r);
    }

    /* ── Game ── */
    if (route.startsWith('/game')) {
      if (req.method === 'GET' && route === '/game/state') return send(res, 200, game.state());
      if (req.method === 'GET' && route === '/game/history') return send(res, 200, game.history());
      if (req.method === 'GET' && route === '/game/verify') return send(res, 200, game.verify(url.searchParams.get('roundId')));
      const userId = bearerUser(req);
      if (!userId) return send(res, 401, { error: 'unauthorized' });
      if (req.method === 'POST' && route === '/game/bet') return send(res, 200, game.placeBet(userId, b.amount, b.betId));
      if (req.method === 'POST' && route === '/game/cashout') return send(res, 200, game.cashout(userId, b.roundId));
      return send(res, 404, { error: 'not_found' });
    }

    /* ── Admin ── */
    if (route.startsWith('/admin')) {
      let r;
      if (req.method === 'POST' && route === '/admin/login') r = await admin.login(b);
      else if (req.method === 'POST' && route === '/admin/login/verify') r = admin.verify(b);
      else if (req.method === 'GET' && route === '/admin/me') r = admin.me((req.headers.authorization || '').replace('Bearer ', ''));
      else r = { status: 404 };
      return send(res, r.ok === false && r.status ? r.status : 200, r);
    }

    send(res, 404, { error: 'not_found' });
  } catch (e) {
    console.error('[BetCrash]', e);
    send(res, 500, { error: 'internal_error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`BetCrash backend listening on http://0.0.0.0:${PORT}`);
  console.log('Modules: SMS-IVS · Staff-IAM · Auth · Wallet · Game engine · Admin');
});
