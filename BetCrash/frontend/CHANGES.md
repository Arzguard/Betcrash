# BetCrash — Frontend fixes (Aug 2026)

All changes are in this `betcrash/` folder. Copy the files into your repo root
(`index.html`, `onboarding.html`, `wallet.html`, `admin.html`, `fairness.html`,
`responsible-gaming.html`) and redeploy to Vercel — nothing else is needed.

## admin.html — admin dashboard (new, per enhancement spec v2.0)

**Live betting & odds — next odds linked to the game page**
- New **"Live betting & odds"** nav item (Operations, all roles): a live
  monitor showing the **next round's crash point before the game page shows
  it**, the current round, status (Waiting/Flying/Crashed), live multiplier,
  live player count, and a countdown to lift-off.
- **Round sequence panel**: the game page pre-generates the next **10 crash
  points** and publishes them; the admin shows the ordered sequence
  (NOW → #10486 → #10487 → …) that advances automatically as each round
  runs on the main site. Round IDs stay sequential with no gaps; queue
  stays topped up at 10.
- **FIXED**: the nav item was initially blocked by the RBAC guard — `'live'`
  was missing from every role's allowed-views list, so clicking it showed
  "Not permitted" and nothing happened. Added `'live'` to all four roles.
- **Multiplier logic panel**: the formula `crash = max(1, min(0.97/(1−r), 60))`
  with the 3% house edge, plus the **actual random draw r** used for the
  coming round and the worked derivation (r → formula → clamped crash point).
- **Demo override**: set the next crash point (1.00x–60.00x) — the game page
  picks it up instantly for the round that hasn't lifted off; audit-logged.
- **Dashboard strip**: "NEXT ODDS · 3.42x · round #10485 · lift-off in 2.3s"
  with a link to the monitor.
- Synced via `betcrashRoundState` published by the game page (localStorage +
  storage event, 1s ticker). If the game page isn't open, the monitor says so
  with a link to open it.
- Honest note in the UI: in production the crash point is fixed by the
  provable-fairness seed commitment before each round — even admins can't see
  or change it early. This preview/override is simulation-only.
- **Fixed a real sync bug**: the bots flag was being written to sessionStorage
  (admin session storage) while the game page reads localStorage — cross-tab
  bots toggling never worked. Added `sharedGet/sharedSet` (localStorage) for
  all cross-tab keys; session stays in sessionStorage. Also removed a
  duplicated `storage` listener on the game page.

**Notification center — rebuilt, clean and responsive**
- Bell button now shows a **red count badge** (caps at 9+) instead of a bare dot.
- Dropdown redesigned: header with title + "N new" pill + **Mark all read**,
  scrollable body, and a footer noting the demo feed.
- Each notification has a **category icon chip** (💳 finance / 🛡️ security /
  👤 user / ⚙️ system), bold title, muted text, mono timestamp, a green unread
  marker, and a hover state. **Clicking one marks it read**; "Mark all read"
  clears the badge with a toast.
- **Empty state**: "✨ You're all caught up."
- **All devices**: anchored dropdown under the bell on desktop; on phones
  (≤640px) it becomes a full-width panel fixed under the top bar
  (`max-height: calc(100dvh - 80px)`), so it never overflows off-screen.
  Smooth open animation, closes on outside click or Escape, `aria-expanded`
  on the bell.

Built from your `betcrash-admin.html` mockup + the v2 spec, with the same
security/honesty pattern as the player pages:

**Security (the critical fixes)**
- **Admin login gate with 2FA** — the dashboard no longer pretends to be
  "signed in as Super Admin" without a login. Two-step: username + password →
  OTP to the admin's device → session (sessionStorage, cleared on logout).
  Demo creds (clearly labelled): `admin` / `betcrash2026` / OTP `482913`.
- **RBAC** — role switcher (Super Admin / Finance / Risk / Support) genuinely
  hides modules per role; opening a disallowed view shows "Not permitted".
  Nav is built from the role's allowed views.
- Live-mode contract: `POST /admin/login` → `{ challengeId }` →
  `POST /admin/login/verify` → `{ token, role, name }`; every Approve/Deny
  action must be re-authorized server-side (never trust the browser).

**Honesty (no fabricated operations)**
- Persistent **"Demo data"** chip + simulation banner: "no backend is
  connected, so every number and action here is sample data — do not act on
  it as if it were real."
- Removed the fake `Math.random()` "users online" ticker — stats are a
  labelled static snapshot. The live-rounds monitor says so explicitly.
- Audit entries, queues and notifications are marked `(demo)`; the exported
  CSV is watermarked "DEMO DATA".

**Spec v2.0 modules, scaffolded**
- Working: Dashboard (stats, rounds monitor, activity feed, withdrawal queue
  with Approve/Deny that moves state + audits), Users (searchable, suspend),
  Transactions (filterable), Verification/KYC queue (Approve/Deny),
  Fraud & risk (flag/unlock), Audit logs (filterable, feed shared with
  dashboard), Global search (filters users/transactions), Notification center
  (demo drop-down), Quick actions (Export CSV), System health pill.
- Stubbed with honest labels: Analytics, Reports, Settings, CMS — "wired to
  the API in the backend build".

**Demo bots toggle**
- **Bots ON/OFF button right in the "Live betting rounds" panel** on the
  dashboard — the most contextual spot, next to where the players appear.
  Plus the quick pill in the top bar, plus the switch in **Settings**.
  All three stay in sync and reflect the stored state on every render.
- The toggle writes `betcrashBotsEnabled`, is audit-logged, and the game page
  reacts instantly via the storage event (separate tab, no reload).
- Settings view ("Simulation & demo controls") explains what the bots are
  (3 sets, up to 14 each, shuffled per round, purely visual) and that this
  becomes a server-side flag in production.

**Other**
- Real generated date ("Wednesday, 5 August 2026") instead of a hardcoded one.
- HTML-escaped names everywhere (stored-XSS guard), keyboard-accessible nav
  and tabs, reduced-motion support, responsive sidebar.

**Responsive — usable on all devices**
- ≤900px: **off-canvas drawer from the left**. A slim top bar keeps the brand
  and avatar, with the **hamburger ☰ on the LEFT**; tapping it slides the nav
  drawer in from the left edge (with a blurred scrim, ✕ close, tap-outside and
  Escape to close, body scroll lock). Picking a view or switching role
  auto-closes it.
- The drawer mirrors the sidebar: section labels, active states, role switcher
  (kept in sync with the desktop selector), admin profile and Log out.
- ≤880px: every data table (withdrawal queue, users, transactions, KYC,
  fraud) converts to stacked cards with `data-label` field labels — no more
  sideways scrolling. Approve/Deny buttons become 38px+ touch targets.
- ≤640px: full-width search, 2-up stat cards, 16px inputs (no iOS zoom),
  bottom-centered toasts, compact panels.
- Desktop: sidebar stays fixed on the left; main content now has a max width
  so very wide screens stay clean and readable.
- **Log out fix**: the 🧪 sim banner (bottom-left, z-index 9000) was floating
  exactly over the drawer's Log out button on mobile — taps hit the banner,
  so Log out appeared dead. The drawer/scrim now sit above the banner
  (z 9200/9100) and the banner hides while the drawer is open. Also, the
  mobile top bar and drawer are `display:none` on desktop (they were leaking
  as unstyled blocks), so desktop shows only the sidebar.

## index.html (game page)

**Demo bots (3 sets, up to 14 each, shuffled every round)**
- `BOT_SETS` — Set A Casual (KES 50–500), Set B Regulars (KES 200–2,000),
  Set C High rollers (KES 1,000–10,000); each round every set is shuffled and
  contributes 4–14 bots, so the lineup always changes (~12–42 players).
- Bots behave like real players in the list: `@target` while waiting, green
  cash-out rows with profits when the multiplier passes their target,
  losses on crash. Purely visual — they never touch the wallet, bets,
  cash-outs or history, so they can't break the game loop.
- **Admin-controlled**: reads `betcrashBotsEnabled` (localStorage, default ON
  in demo) and reacts live via the `storage` event — toggle it in the admin
  panel and the game page updates without a reload. In live mode (backend
  connected) bots are ignored; real players come from the server.
- Empty state now tells you how to re-enable bots when they're off.

**Untraceable randomness (CSPRNG)**
- All bot shuffling, per-set counts, stakes and cash-out targets now use
  `crypto.getRandomValues` (the platform's cryptographically secure RNG —
  the same entropy used for key generation) instead of the patternable
  `Math.random()`. Fisher–Yates shuffle driven by it is uniform with no
  positional bias, and consecutive shuffles never repeat.
- The simulation crash point (`generateCrashPoint`) also switched to the
  CSPRNG. The only remaining `Math.random` uses are the crash-particle
  visuals (cosmetic) and a fallback for ancient browsers.
- Honest caveat (unchanged): true provable fairness for real money still
  comes from the server-side SHA-256 seed scheme on /fairness — client CSPRNG
  prevents pattern-tracing of the demo, it isn't a substitute for server
  seeds.

## Self-service demo OTPs + password reset (all pages)

**Self-generated OTPs (simulation)**
- No more hardcoded `482913`: every "request code" now generates a random
  6-digit OTP via the CSPRNG, shows it immediately (toast + on-screen hint,
  "📲 Demo OTP: 588051 — expires in 5 min") and records it in a **shared
  inbox** (`betcrashOtpInbox` in localStorage) that the admin panel displays
  like an SMS gateway.
- Covers **register**, **login** (2-step), **withdrawal** and **password
  reset** — request from any of those screens and you get the code instantly.
- OTPs are **single-use, purpose-scoped** (a register code can't verify a
  login), expire after 5 minutes, wrong codes are rejected without consuming,
  and "Resend" issues a fresh code.
- Admin **OTP inbox** view (Operations → OTP inbox, superadmin + support):
  live list of every generated code with purpose, destination, created time,
  expiry countdown and status (active/used/expired), plus a "Request test
  OTP" button. Honest note: in live mode this becomes the real SMS gateway
  log — codes are never shown to staff.

**Password reset (fully working)**
- "Forgot password?" on the login screen → National ID → OTP → new password +
  confirm → saved. Demo mode updates the device demo account so **the next
  login uses the new password**; live contract:
  `POST /auth/reset-request` → `reset-verify` → `reset-password`
  (documented in NEXT_STEPS.md).
- **Fixed**: `setAuthMode` was referenced by the Log in/Register toggle links
  but never defined — the toggle was silently dead. Defined now, and the
  reset flow uses it too.

## Staff IAM — identity & access management for staff (plan v1.0)

**Admin panel (frontend demo)**
- **10-role hierarchy** per the plan: Super Admin, Operations, Finance,
  Compliance, Marketing, Technical Admin, Developer, DevOps, Support,
  Read Only Auditor — each with least-privilege view gating (RBAC enforced
  on every nav click).
- **Staff & IAM → Staff & roles**: searchable staff directory (name/ID/email,
  department + status filters), profiles (staff ID, phone, email, dept, role,
  manager), statuses (Pending invitation / Active / Suspended / Locked / On
  leave / Resigned / Archived) with one-click transitions, and the
  **invite → activate** flow: create staff → department → role → permissions →
  SMS invitation (code lands in the OTP inbox, 24h expiry) → set password →
  phone verification → Active.
- **Sessions & devices**: every admin login records device/browser/OS/IP;
  sessions list with online/offline, revocation, and the new-device →
  SMS-verification rule from the plan.
- **Permissions**: role-template table (least privilege) + custom-permission
  toggles per staff member (audit-logged).
- **Dashboard**: Staff & access monitor — online staff, pending invitations,
  locked accounts, failed logins (24h) + recent access activity.
- **Audit logs upgraded**: every entry now carries actor, device, target and
  outcome; all staff actions (invite, activate, suspend, unlock, revoke,
  permission grants) are logged.

**Backend module (in betcrash-backend.zip)**
- `src/staff-iam/{store,service,schema}.js` — Staff, Roles, Permissions,
  StaffInvitations, StaffSessions, StaffDevices, StaffAuditLogs; UUIDs,
  soft deletes, permission caching, searchable directory.
- API live-tested end-to-end: create → invite (hashed, 24h) → activate
  (code + password + phone OTP) → login (new device → SMS required →
  verify device → known device skips SMS) → suspend blocks login (403) →
  soft delete hides from directory → full audit trail.

## "Fairness" wording removed from the main site display

- Removed the remaining visible "Fairness" wording on the main site:
  · the sim-banner link "How fairness will work" (banner keeps its message)
  · the game-page fair badge no longer links to /fairness — it stays as
    plain status text ("Simulated round" / "Provably fair" · round #N)
  · the "(see Fairness)" reference inside the Terms modal content.
- The /fairness page itself remains (still reachable by URL) and the admin
  panel keeps its internal fairness notes.

## Footer — reverted

- Restored the footer line **"24/7 helpline: 0705 825 637 · Terms · Privacy"**
  (and the Terms/Privacy modal popups) on all mainsite pages, per request.
- Current mainsite footer: [18+] · Play responsibly — gambling can be
  addictive. · Responsible gaming & help · 24/7 helpline: 0705 825 637 ·
  Terms · Privacy (buttons open the modal).

## Footer cleanup — Fairness link removed + responsive polish

- Removed the **Fairness** link from the footer on every page (game,
  onboarding, wallet, fairness, responsible-gaming, admin). The fairness
  page is still reachable from the game page's "fair" badge and the sim
  banner link — it just doesn't clutter the footer.
- Footer is now cleaner and mobile-friendly across all devices:
  centered, tighter gaps, slightly smaller text and touch-friendly buttons
  on small screens (≤640px), with the 18+ badge leading.
- Resulting footer on the main site: [18+] · Play responsibly — gambling
  can be addictive. · Responsible gaming & help · 24/7 helpline: 0705 825
  637 · Terms · Privacy

## Terms & Privacy — footer buttons with modal popups (all pages)

- Every page footer now has **Terms** and **Privacy** as clickable buttons
  (styled to match the footer links) that open a polished modal dialog —
  no navigation, no page reload, closes via ✕ / outside click / Escape.
- **Terms & Conditions** (9 sections): acceptance, 18+ eligibility, one
  account per National ID, current simulation-mode status, game rules with
  the 3% house edge and provable-fairness commitment, deposits/withdrawals/
  KYC, responsible play, prohibited conduct, liability, changes & Kenyan law.
- **Privacy Policy**: what we collect (ID, phone, device, financial,
  security events), how it's used, OTP/SMS security (hashed codes), sharing
  (providers + regulators only), storage/security, retention, your rights
  under Kenya's Data Protection Act 2019 incl. the ODPC (info@odpc.go.ke).
- Modal is fully self-contained (inline styles/JS) so it works in any
  deployment and in sandboxed previews. The admin page got a proper footer
  bar (18+, responsible-play line, Terms/Privacy, helpline) since it had
  none — now every page is consistent.
- Contact placeholders (support@betcrash.co.ke / privacy@betcrash.co.ke)
  are marked for replacement before launch.

## PHASE 1 — Frontend ↔ backend wired end-to-end (live mode)

**Backend now serves the whole product** (betcrash-backend.zip, zero-dep Node):
- **Auth module** (`src/auth/`): register (National ID unique, phone format
  checks, duplicate 409), registration OTP verify, two-step login
  (password → SMS challenge → tokens), resend with 60s cooldown, refresh
  token rotation, password reset (request → verify → set, revokes all
  sessions), /auth/me. HMAC JWT (15m access / 7d refresh) — zero deps.
- **Wallet module** (`src/wallet/`): balance, transactions ledger, M-Pesa
  deposit (STK simulation, ~3s confirm), OTP-protected withdrawals with
  instant (≤ KES 10,000 + verified) vs queued-for-review logic.
- **Game engine** (`src/game/engine.js`): server-authoritative rounds
  (wait 4.5s → fly → crash), bets with **idempotency keys**, cash-outs at
  the server clock, loss settlement, history, and **real provable
  fairness**: crash = floor(2^52 / h × 0.97 × 100)/100 with
  h = sha256(serverSeed + clientSeed + nonce); seed hash committed before
  each round, seed revealed at crash, /game/verify recomputes and matches.
- **Admin login** (`src/admin/service.js`): username + password → SMS 2FA →
  role token (superadmin). Staff-IAM and SMS-IVS remain mounted.

**Frontend live mode (set `betcrash-api-url` or open with `?api=BACKEND`):**
- Game page polls /game/state (500ms), places bets and cash-outs via the
  API with refresh-proof idempotency, auto-cash-out still works, history
  strip from the server, wallet refreshes from /game + /wallet.
- Onboarding register/login/reset run the real API; when the backend uses
  the console SMS provider it returns a clearly-labelled `demoCode` that
  the OTP screens display (dev convenience — production providers never
  return codes).
- Wallet deposit polls balance until the STK confirmation lands;
  withdrawals run the two-step challenge and show the dev code when present.
- Admin: live login uses the API 2FA; the Live betting & odds monitor in
  live mode shows the committed **seed hash** (never the future crash —
  that's the point of provable fairness) and explains why the sequence
  panel only shows the current round.
- **Live-tested end-to-end via the API**: register → OTP → deposit KES
  1000 → bet 300 (idempotent) → cash out at 1.02x → win 307 (balance exact)
  → withdraw 500 via OTP (queued, KYC gate message) → wrong password 401 →
  refresh rotates (reuse 401) → password reset (old password dead, new
  works) → admin 2FA login → provable-fairness verify MATCHES.
- Found & fixed during wiring: negative multiplier bug in the engine
  (flight clock reset), misleading "over limit" message when it was the
  KYC gate, `setAuthTokens(undefined)` on register (only sets when present).

## SMS-IVS v1.0 — fine-tuned & implemented (frontend demo + backend service)

**Frontend demo now complies with the SMS-IVS spec exactly**
- Business rules enforced everywhere (register / login / withdrawal / reset):
  6-digit CSPRNG code · 5-min expiry · **60s resend cooldown** · **max 5
  verify attempts → lockout** · **configurable daily limit per number**.
- Wrong codes now count toward the attempt limit even when they match no
  record (brute-force protection) — a real flaw found and fixed.
- Resend applies the cooldown ("Wait 45s…") and issues a fresh code;
  cooldown applies even after a code was used (anti-SMS-spam).
- Admin **OTP inbox** upgraded: Attempts column (x/5), Locked status,
  SMS-status metric cards (provider, sender ID, sent/verified/failed today),
  and a "Request test OTP" button — mirrors GET /api/v1/sms/status.
- Admin **Settings → SMS-IVS policy editor**: expiry, cooldown, max attempts,
  daily limit, sender ID — saved to `betcrashOtpPolicy` and applied instantly
  across the main site (no reload). Audit-logged.

**Backend — SMS-IVS reference implementation (sms-ivs-backend.zip, zero-dep Node)**
- `server.js` + `src/sms-verification/{service,store,policies,provider}.js`
  implementing the spec lifecycle and API:
  POST /api/v1/sms/request · /verify · /resend · GET /status · PUT /policy.
- Security per spec: codes stored **hashed** (sha256 + salt), plaintext only
  for the provider call, API never returns codes; single-use, purpose-scoped,
  brute-force lockout, audit log (REQUESTED/SENT/VERIFIED/FAILED/LOCKED/
  EXPIRED/LIMIT), pluggable SMS provider (console demo; Africa's Talking
  stub), SQL schema for OTP Requests / Trusted Devices / SMS Audit Log.
- Live-tested: request → challengeId (no code in response), cooldown 429 with
  Retry-After, 4 wrong 401 → 5th locks 423, resend blocked, status metrics.
  Run: `node server.js` (data persists in ./data).

## onboarding.html — registration + login, one screen each (v2)

**Login use case added.** The same card now has two modes, toggled via the
"Already have an account? Log in" / "Don't have an account? Register" links,
or directly with `/onboarding?mode=login` (which the game page's **Log in**
button now uses).

**Login screen** (matches your screenshot's format, **National ID + password**):
- National ID (the unique identifier, mono-spaced with the same 🪪 badge style
  as registration) + password (show/hide toggle, forgot-password link), one
  **Log in** button, plus a "🔐 Secure sign-in" note that a one-time code
  follows.
- Intro line adapted from the photo: "Enter your National ID number and
  password below to login to your existing account. Otherwise click on
  Register…"

**Two-step login (OTP) — tightened against account takeovers:**
- After the ID + password check, a **6-digit code is sent to the registered
  phone** and is required before tokens are issued. The phone number is shown
  masked (0712••••78).
- "Trust this device for 30 days" checkbox on the OTP screen → skips the code
  on that device next time (stored locally as `betcrashTrustedDevice`; cleared
  by Log out). OTP is still always required on new devices.
- **Demo mode**: register → log out → log in → OTP `482913` (or skipped if the
  device is trusted). Wrong password, unknown ID, and wrong OTP all blocked
  with clear errors.
- **Live mode contract**: `POST /auth/login` `{ idNumber, password, deviceToken? }`
  → `{ challengeId, maskedPhone }` (OTP step) or tokens (trusted device);
  then `POST /auth/verify-login` `{ challengeId, code }` → tokens. Documented
  in NEXT_STEPS.md, including OTP limits (5 attempts, 5-min expiry) and that
  trusted-device skip never applies to withdrawals.

**Registration** (from the previous round, unchanged): National ID at the top
as the unique identifier, then phone, password/confirm, consent line, one
Register button → phone OTP → "You're all set".

## index.html (game page)

**Login/logout loop completed**
- "Log in" nav button → `/onboarding?mode=login`.
- In demo mode, a registered/logged-in demo account now unlocks the authed UI:
  wallet pill with a labelled demo balance (KES 12,450) — no network calls.
- New **Log out** button in the top bar clears the session (tokens + demo
  account) and reloads, so the full user case can be exercised.

(Everything from the first round still applies: no fabricated players,
honest "Simulated round" badge, 18+ gate, simulation banner, responsible
gaming footer, Start-auto fix, SVG perf, safe storage, reduced motion.)

## wallet.html — unchanged this round

## fairness.html / responsible-gaming.html — unchanged

**Honesty / real-money readiness**
- Removed the fabricated "21 players" bot system entirely (names, stakes,
  cash-out targets). The players list now shows only real participants — your
  own bet — plus an honest empty state. `playersLive` shows the real count.
- The "Provably fair" badge was a claim the code didn't back (crash point is
  still `Math.random()` in your browser). It's now a link to `/fairness` and
  shows **"Simulated round"** until a server is connected; it will flip to
  "Provably fair" automatically once the `betcrash-api-url` meta tag is set.
- Added a **simulation-mode banner** (🧪 Simulation mode — no real money) shown
  automatically while no backend is configured. Auto-hides when you point the
  meta tag at a real API.
- Added an **18+ age gate** (once per device) and a **responsible-gaming
  footer** with the 24/7 Kenya helpline (0705 825 637).
- `checkAuth()` no longer fires network calls while in simulation mode.

**Bugs fixed**
- **"Start auto" button was dead** (no click handler). It now arms auto
  cash-out and places the bet for the current round, with balance checks.
- SVG graph rebuilt its entire `innerHTML` (grid + path) every animation frame.
  The grid is now cached and only redrawn on resize; each frame updates a small
  path-layer SVG. Much cheaper on low-end phones.
- `localStorage` access is now wrapped in safe helpers — the page previously
  threw in sandboxed/private contexts (e.g. it crashed before `newRound()` ran).
- `prefers-reduced-motion` support and a `<noscript>` fallback added.

**Not changed** (deliberate): the history strip's `scrollLeft = 0` — after
`history.slice(-18).reverse()` the newest chip is already leftmost, so that
behaviour was actually correct.

## onboarding.html

- **18+ confirmation checkbox** on the registration form (required before
  "Continue" enables) linking to `/responsible-gaming`.
- Registration, OTP and KYC flows are now **mode-aware**: while no server is
  connected they simulate with clearly demo tokens / codes (`482913`), and the
  demo hint is hidden in live mode. In live mode the OTP is validated via
  `POST /auth/verify-otp` (new endpoint contract — see NEXT_STEPS.md).
- KYC submission simulates the review (4 s → "approved (demo)") when offline;
  polls `GET /kyc/status` only when live.
- The "Go to wallet" button on the verified screen now actually navigates to
  `/wallet`.
- Simulation banner + responsible-gaming footer + safe storage + reduced
  motion added.

## wallet.html

- **Fixed the filter bug**: filters (All / Deposits / Withdrawals / Betting)
  previously always rendered the mock list, even in authed mode with real API
  data. They now filter whatever source is active (API or demo).
- **Fixed a crash**: `willAutoApprove()` referenced an undefined `user`
  variable — opening the Withdraw tab would throw. `user` is now defined and
  populated from the API (`kycVerified`).
- **Honest modes**: with no server, the wallet shows clearly-labelled demo
  balances and a "Demo data" note. In live mode, an API failure now shows an
  error + Retry — never fake data (previously it silently fell back to mocks).
- Deposit (STK push) and withdrawal flows simulate with explicit "no real
  money moved" labelling when offline; they hit `/wallet/deposit` and
  `/wallet/withdraw` when live.
- Pending balance card now reflects the API's `pendingWithdrawals` instead of a
  hard-coded KES 15,000.
- **Withdrawals now require OTP confirmation** (security recommendation):
  "Request withdrawal" → a 6-digit code is sent to the registered M-Pesa number
  (shown masked) → enter it to complete. Demo code `482913` in simulation mode;
  live mode uses `POST /wallet/withdraw` → `{ challengeId, maskedPhone }` then
  `POST /wallet/withdraw/confirm`. Over-limit withdrawals still show "queued".
- Demo mode now pre-fills the M-Pesa number with the phone used at
  registration, so the register → login → withdraw loop is coherent end-to-end.
- Simulation banner + responsible-gaming footer + safe storage + reduced
  motion added.

## fairness.html (new)

Explains the provably-fair scheme we're committing to for the server
(seed hash commitment, SHA-256-derived crash points, 3% house edge, seed
rotation) with a copy-paste verifier snippet — and honestly states the current
status: rounds are simulated until the server ships. The status box flips to
"live" automatically once `betcrash-api-url` is configured.

## responsible-gaming.html (new)

18+ notice, warning signs, what BetCrash does in practice vs. what's coming
(deposit limits, time-out, self-exclusion — all server-side features), and
verified Kenya support resources: Responsible Gambling Kenya 24/7 helpline
**0705 825 637**, GamHelp Kenya **+254 726 883 960**, GAMBAN blocking software,
and the BCLB regulator.

## Placeholders to replace before launch

- `support@` contact — add a real support address/WhatsApp to the footers.
- The `betcrash-api-url` meta tag on every page (currently empty = simulation
  mode; set it to your backend URL to switch to live mode).
- Terms & Privacy pages don't exist yet — add them (see NEXT_STEPS.md).
