# BetCrash Backend

This folder contains the NestJS backend for BetCrash.

## Setup

1. Install dependencies:
   ```bash
   cd apps/backend
   npm install
   ```

2. Start local databases:
   ```bash
   docker compose up -d
   ```

3. Generate Prisma client:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

4. Run the app:
   ```bash
   npm run start:dev
   ```

## API

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/refresh`
- `POST /auth/logout`

## CORS

The API is locked down by default. Set `FRONTEND_URL` (comma-separated origins) so the
frontend deployed on Vercel can call the backend:

```
FRONTEND_URL=https://betcrash.vercel.app,https://betcrash-admin.vercel.app
```

When unset, all origins are allowed (dev convenience only).
