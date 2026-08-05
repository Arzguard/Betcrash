════════════════════════════════════════════════════════════════
 BetCrash — site package (simulation mode, ready to deploy)
════════════════════════════════════════════════════════════════

WHAT'S INCLUDED
  index.html              → Game page (crash game, bots, 18+ gate)
  onboarding.html         → Register + Log in (National ID, 2-step OTP)
  wallet.html             → Wallet (M-Pesa demo, OTP-protected withdrawal)
  admin.html              → Admin dashboard (admin / betcrash2026 / OTP 482913)
  fairness.html           → Provable-fairness explainer
  responsible-gaming.html → 18+ & help resources
  CHANGES.md              → Full change log
  NEXT_STEPS.md           → Backend + compliance roadmap

HOW TO DEPLOY (Vercel — free)
  1. Put ALL the .html files in your project root (next to your favicon/ folder).
  2. Deploy to Vercel as a static site. That's it — no build step.

DEMO LOGINS
  Player: register any National ID (6–9 digits) + Kenyan phone + password
          → OTP code 482913 → log out → log in with your ID + password → OTP 482913
  Admin:  /admin.html → admin / betcrash2026 → OTP 482913

WHAT WORKS NOW (simulation mode)
  • Crash rounds every ~7s with 3 sets of demo bots (shuffled, up to 14 each)
  • Admin Bots ON/OFF button → game page updates instantly (open both tabs)
  • Bet, auto cash-out, wallet demo balance, deposits, OTP-protected withdrawals
  • Admin: RBAC roles, KYC/withdrawal queues, audit log, notifications, export

GOING LIVE (real money)
  Set the <meta name="betcrash-api-url" content="YOUR_BACKEND_URL"> tag on every
  page and build the backend per NEXT_STEPS.md. Until then everything is a
  clearly-labelled simulation — no real money involved.
════════════════════════════════════════════════════════════════
