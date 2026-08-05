# BetCrash — full project

```
BetCrash/
├── frontend/                  ← the site (deploy to Vercel)
│   ├── index.html             ← game page (crash game, bots, 18+ gate)
│   ├── onboarding.html        ← register + login (National ID, 2-step OTP)
│   ├── wallet.html            ← wallet (M-Pesa demo, OTP withdrawals)
│   ├── admin.html             ← admin dashboard (RBAC, IAM, odds monitor)
│   ├── fairness.html          ← provable-fairness explainer
│   ├── responsible-gaming.html← 18+ & Kenya help resources
│   ├── CHANGES.md             ← full change log
│   ├── NEXT_STEPS.md          ← backend + Kenya compliance roadmap
│   └── README-DEPLOY.txt      ← quick deploy guide
├── backend/                   ← central server (zero-dependency Node)
│   ├── server.js              ← all API routes (port 3333)
│   └── src/
│       ├── sms-verification/  ← SMS-IVS (OTP service per spec)
│       ├── staff-iam/         ← staff identity & access management
│       ├── auth/              ← players (register, 2-step login, reset)
│       ├── wallet/            ← balance, deposits, OTP withdrawals
│       ├── game/              ← crash engine + provable fairness
│       └── admin/             ← admin login + 2FA
├── docs/                      ← your spec PDFs (SMS-IVS, Staff IAM, Admin v2)
└── packages/                  ← ready-to-download zips
    ├── betcrash-site.zip      ← frontend only
    └── betcrash-backend.zip   ← backend only
```

## Run it

**Frontend (static):** put the 6 `.html` files in a folder and serve, or deploy
to Vercel. Simulation mode works standalone; for live mode set the
`betcrash-api-url` meta tag or open with `?api=BACKEND_URL`.

**Backend:** `cd backend && node server.js` → http://localhost:3333
(data persists in `backend/data`).

**Demo logins**
- Player: register any National ID (6–9 digits) + Kenyan phone; OTP codes
  appear via the console provider / `demoCode` field.
- Admin: `admin` / `betcrash2026` + OTP.

## Status
Simulation + live-demo. No real money until BCLB licensing, M-Pesa
partnership and the responsible-gaming server features exist (see
frontend/NEXT_STEPS.md).
