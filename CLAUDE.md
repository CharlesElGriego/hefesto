# Hefesto — project conventions

AI-powered car maintenance assistant. Talk to it (web chat or WhatsApp), it keeps
your service history. Full spec: `docs/PRD.md` — read it before large changes.

## Structure

- `frontend/` — Angular (standalone components) + Tailwind. Mobile-first.
- `backend/` — NestJS. Modules: `assistant/` (channel-agnostic core + Claude),
  `vehicles/` (Mongoose CRUD), `channels/web`, `channels/whatsapp` (Baileys).
- `shared/types.d.ts` — types shared by both apps, imported as
  `import type { ... } from '@hefesto/shared'`. Types only — no runtime code.

## Commands

- Dev backend: `cd backend && npm run start:dev` (needs local Mongo or `docker compose up mongo`)
- Dev frontend: `cd frontend && npm start` (proxies `/api` to :3000)
- Full stack: `docker compose up --build` → http://localhost:3000
- Tests: `cd backend && npm test`

## Conventions

- API routes under `/api` (global prefix). DTOs typed from `@hefesto/shared`.
- The AI never computes numbers: Claude classifies/extracts (structured output,
  validated with retry); Mongo queries and aggregations are code.
- The assistant core must stay channel-agnostic — web/WhatsApp are adapters.
- WhatsApp (Baileys) is optional at runtime: the app must work fully without it.
- UI: Tailwind utilities, mobile-first, dark-mode friendly. Spanish-facing copy
  for the assistant persona ("Hefesto"), English for code and docs.
