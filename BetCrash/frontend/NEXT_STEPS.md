# BetCrash — Next steps: server, provable fairness & Kenya compliance

This is the roadmap for the backend phase. The frontend is already structured
for it: set the `betcrash-api-url` meta tag (or `window.BETCRASH_API_URL`) to
your backend and the site switches out of simulation mode automatically.

## 1. Choose where the game server runs

**Recommendation: a small always-on Node service (Render / Railway / a VPS),
keep Vercel for the static pages.** A crash game needs a shared, authoritative
round clock and bet settlement — that's not what serverless functions are for.

| Option | Round timing | Live updates | Verdict |
|---|---|---|---|
| Always-on Node (Express + WebSocket) | single in-memory loop | WebSocket push | ✅ recommended |
| Vercel serverless + Upstash Redis + Vercel Cron | cron-driven state machine | SSE (streaming response) | ⚠️ workable but fiddly; rounds drift if cron misses |
| Serverless + polling | serverless | 1 s polling | ❌ poor UX for crash |

If you must stay on Vercel: use a cron interval as the round clock, store round
state in Upstash Redis (transactions are atomic there), and stream updates to
clients with SSE from a serverless function reading Redis. It works, but
budget time for edge cases (cold starts, cron overlaps).

## 2. API contract (all JSON, Bearer JWT)

| Endpoint | Purpose |
|---|---|
| `POST /auth/register` | create account — payload `{ idNumber, phone, password }` (National ID is the unique identifier) |
| `POST /auth/login` | step 1 of login — `{ idNumber, password, deviceToken? }` → password OK: `{ challengeId, maskedPhone }` (SMS OTP sent); device trusted: `{ accessToken, refreshToken, deviceToken? }` |
| `POST /auth/verify-login` | step 2 of login — `{ challengeId, code }` → `{ accessToken, refreshToken, deviceToken? }` (optional device token lets the server skip OTP on that device) |
| `POST /auth/verify-otp` | verify SMS code during registration — **new, referenced by onboarding** |
| `POST /auth/resend-otp` | resend code |
| `POST /auth/reset-request` | password reset step 1 — `{ idNumber }` → `{ challengeId }` (SMS OTP) |
| `POST /auth/reset-verify` | password reset step 2 — `{ challengeId, code }` → `{ resetToken }` |
| `POST /auth/reset-password` | password reset step 3 — `{ resetToken, newPassword }` → ok |
| `POST /auth/refresh` · `GET /auth/me` | token refresh / profile |
| `POST /kyc/submit` · `GET /kyc/status` | KYC upload + review status |
| `GET /wallet/balance` | `{ balance, bonusBalance, pendingWithdrawals, kycVerified }` |
| `GET /wallet/transactions` | `{ type, amount, status, reference, description, createdAt }` |
| `POST /wallet/deposit` | initiate M-Pesa STK push (Daraja API) |
| `POST /wallet/withdraw` | step 1 of withdrawal — `{ amount, mpesaPhone }` → OTP required: `{ challengeId, maskedPhone }` (SMS sent); else `{ status, message }` |
| `POST /wallet/withdraw/confirm` | step 2 of withdrawal — `{ challengeId, code }` → `{ message }` (completes the payout) |
| `GET /game/rounds` (SSE/WS) | live round stream (state, multiplier, players, bets) |
| `POST /game/bet` | place bet for current round (idempotency key required) |
| `POST /game/cashout` | cash out (server resolves final multiplier) |
| `GET /game/history` | past crash points (the history strip) |
| `GET /game/verify` | returns seeds/nonces for a round so players can verify |
| `POST /admin/login` | admin step 1 — `{ username, password }` → `{ challengeId }` (OTP to admin device) |
| `POST /admin/login/verify` | admin step 2 — `{ challengeId, code }` → `{ token, role, name }` |
| `GET/POST /admin/...` | users, withdrawals, KYC, audit, reports (all admin actions server-authorized + audit-logged) |

The frontend already calls most of these; the wallet and onboarding pages will
work end-to-end once they exist.

## 3. Provable fairness spec (commit to this before launch)

The contract on `/fairness` is already written around it — implement exactly
this so the page stays truthful:

1. **Server seed**: 64-hex random, generated server-side. Before each round
   publish `SHA-256(serverSeed)` (commitment). Reveal `serverSeed` after the
   round crashes.
2. **Client seed**: per-account, user-changeable, default random.
3. **Nonce**: per-account counter, +1 per round.
4. **Crash point** (3% house edge, Bustabit-style):

   ```
   h     = parseInt( sha256(serverSeed + clientSeed + nonce).slice(0, 13), 16 )
   e     = 2 ** 52 / h
   crash = max(1, floor(e * 0.97 * 100) / 100)
   ```

5. **Seed rotation**: new server seed every 1,000 rounds; reveal the previous
   seed at rotation.
6. **Bet settlement is server-authoritative**: the client's displayed
   multiplier is only for display; the server computes the cash-out amount
   from its own clock and stores it. Never trust the client's math.
7. **Never ship `Math.random()` client-side** for anything that affects money.
   The simulation mode is the only place it's acceptable, and it's labelled.

## 4. Security checklist (server)

- [ ] Idempotency keys on `POST /game/bet` and `/wallet/deposit` (no double-bet / double-deposit on retry)
- [ ] Server-side amount validation on every bet (min/max, balance check in one transaction)
- [ ] Access tokens short-lived (15 min), refresh tokens rotated & revocable
- [ ] Rate limiting on auth, OTP, deposit endpoints (login OTP: max ~5 attempts per challenge, code expires after 5 min)
- [ ] Login OTP is mandatory on new devices; "trusted device" tokens are revocable server-side and never skip OTP for withdrawals
- [ ] Withdrawal OTP: every withdrawal requires a fresh code (never skipped by trusted device); code expires after 5 min, max 5 attempts
- [ ] SIM-swap awareness: flag phone numbers recently ported/replaced (Daraja/Safaricom signals) before issuing login or withdrawal OTPs — SMS OTP is only as strong as the phone's owner
- [ ] Audit log for every bet, cash-out, deposit, withdrawal (needed for BCLB reporting)
- [ ] **Admin panel security**: separate admin auth (never player tokens), admin 2FA, server-side RBAC on every admin endpoint, IP allowlist, and an append-only audit trail for all admin actions (approve/deny/suspend) — the static dashboard is only a shell until these exist
- [ ] Withdrawal flow: KYC-verified phone only, manual review over the auto-approve limit, anti-fraud flags
- [ ] Never log full M-Pesa PINs / passwords; hash passwords (argon2/bcrypt)

## 5. Kenya compliance checklist

**Before accepting any real money:**

- [ ] **BCLB licence** (betting licence; crash games fall under gaming/betting regulation)
- [ ] **M-Pesa / Daraja API partnership** with Safaricom for STK push deposits and B2C payouts (partner approval takes time — start early)
- [ ] **Terms & Conditions** and **Privacy Policy** pages (none exist yet — frontend links say "Terms")
- [ ] **Responsible gaming**: page is done ✅; add deposit limits, time-out, self-exclusion when the server ships (they're promised as "coming")
- [ ] **18+ / KYC**: gate and flow are in place ✅; wire the KYC review to a real admin queue
- [ ] **Data protection**: register with the ODPC (Kenya DPA 2019), data-retention policy
- [ ] **Reporting**: BCLB levy/returns, transaction reporting
- [ ] **Marketing**: no targeting of minors, no misleading "winnings guaranteed" claims
- [ ] Remove simulation banner logic concern: once live, ensure no demo values can ever leak into a real account (they can't — the frontend picks one mode)

## 6. Small frontend follow-ups (optional)

- Real support contact (email/WhatsApp) in footers — currently placeholder-free but should link somewhere.
- `robots.txt` + `sitemap.xml` (currently 404).
- Consider a proper `<meta name="description">` + OG image per page.
- The wallet page's `mpesaPhone` is never pre-filled from the profile — wire it once `GET /auth/me` returns the verified phone.
