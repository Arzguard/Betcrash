# BetCrash Central Backend — full product server

Zero-dependency Node backend. Run: `node server.js` (port 3333, data in ./data).

## Modules

| Module | Routes | Status |
|---|---|---|
| SMS-IVS | /api/v1/sms/* | ✅ shared OTP delivery (console demo provider) |
| Staff-IAM | /api/v1/staff/* | ✅ staff lifecycle, sessions, audit |
| Auth (players) | /auth/* | ✅ register, 2-step login, refresh, reset |
| Wallet | /wallet/* | ✅ balance, ledger, deposit, OTP withdrawals |
| Game engine | /game/* | ✅ server-authoritative rounds, provable fairness |
| Admin | /admin/* | ✅ admin login + 2FA |

## Point the frontend at it

Open any frontend page with `?api=BACKEND_URL`, e.g.:

```
https://your-site/index.html?api=https://api.betcrash.example
```

or set `<meta name="betcrash-api-url" content="BACKEND_URL">` on every page.
The frontend auto-switches out of simulation mode (bots off, real bets,
real wallet) when a backend is configured.

## Dev convenience

With the default **console** SMS provider the API returns a `demoCode` field
in every response that generates a code (register/login/withdraw/reset/admin).
The frontend shows it on the OTP screens as "Demo code (dev)". Production
providers (Africa's Talking, etc.) never return codes — the SMS goes to the
phone and `demoCode` disappears automatically.

## Auth quick reference

```
POST /auth/register      { idNumber, phone, password }      → { challengeId, demoCode? }
POST /auth/verify-otp    { challengeId, code }              → { accessToken, refreshToken }
POST /auth/login         { idNumber, password }             → { challengeId, maskedPhone, demoCode? }
POST /auth/verify-login  { challengeId, code }              → tokens
POST /auth/reset-request { idNumber }                       → { challengeId, demoCode? }
POST /auth/reset-verify  { challengeId, code }              → { resetToken }
POST /auth/reset-password{ resetToken, newPassword }        → ok
POST /auth/refresh       { refreshToken }                   → new pair (old rotated)
GET  /auth/me            (Bearer)                           → profile
```

## Game + wallet quick reference

```
GET  /game/state                  → round (seed hash committed; crash hidden until crash)
GET  /game/history                → last 30 rounds
GET  /game/verify?roundId=N       → seeds + recomputed crash (provable fairness check)
POST /game/bet     (Bearer)       { amount, betId? }        → bet (idempotent via betId)
POST /game/cashout (Bearer)       { roundId }               → { multiplier, win }
GET  /wallet/balance (Bearer)     → { balance, bonusBalance, pendingWithdrawals, kycVerified }
POST /wallet/deposit (Bearer)     { amount, mpesaPhone }    → pending → confirmed ~3s
POST /wallet/withdraw (Bearer)    { amount, mpesaPhone }    → { challengeId, maskedPhone, demoCode? }
POST /wallet/withdraw/confirm     { challengeId, code }     → instant | queued
POST /admin/login      { username, password }               → { challengeId, demoCode? }
POST /admin/login/verify{ challengeId, code }               → { token, role, name }
```

## Demo accounts
- Player: register any National ID (6–9 digits) + Kenyan phone; codes arrive
  in the server log / `demoCode`.
- Admin: `admin` / `betcrash2026` + OTP (demoCode).
