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
