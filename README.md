# Hefesto 🔧

**An AI-powered car maintenance assistant.** Talk to it — in the web chat or on
WhatsApp — and it keeps your vehicle's service history: it logs maintenance from a
plain sentence, answers questions about your spending with real numbers from the
database, and anticipates upcoming services.

> **You:** changed the oil and filter, $45 at 62,400 km
> **Hefesto:** ✅ Logged: oil and filter change, $45 at 62,400 km. Your next oil
> change is due around 67,400 km.

Named after Hephaestus, the Greek god of the forge — the patron of mechanics.

## Why

Keeping a service history is valuable (resale, warranties, cost control), but
nobody does it because every app demands a multi-field form at the worst possible
moment — walking out of the shop, standing at the gas pump. Hefesto's bet: **if
logging costs the same effort as sending a text, people actually do it.**

## Features

- **Conversational logging** — describe what you did in any words, in English or
  Spanish; Claude extracts a structured record (type, cost, mileage, date,
  workshop, parts) and shows it as an editable card. Missing data is never
  invented: the assistant asks instead — and numeric fields are only persisted
  if they literally appear in your message (deterministic anti-fabrication).
- **Multi-vehicle garage** — several cars, one assistant. With one car it never
  asks; with several it asks which car when your message doesn't say, and
  follow-ups like "it was $45" or "actually the Hilux" amend the record
  instead of duplicating it. You can even add a car from the chat ("add my
  Hilux 2021") or correct its profile ("it's actually a 2019 with 0 km") —
  essential on WhatsApp, where there is no Garage tab.
- **Real answers, real numbers** — "how much have I spent this year?" runs a real
  MongoDB aggregation. The AI classifies the question; the backend computes the
  answer. The model never does math.
- **Dashboard** — spending by category, maintenance timeline, and upcoming
  services predicted by simple interval rules (code, not AI).
- **Manual CRUD** — everything the AI writes is editable; records can also be
  created, edited, and deleted by hand.
- **WhatsApp channel** — click *Connect*, scan a QR from the web app, and the
  assistant lives in WhatsApp (use a spare number, or "Message yourself" on your
  own). Same brain as the web chat: everything syncs. Access is locked down:
  only your own self-chat plus numbers you explicitly authorize from the
  Connect screen get answers (DMs only — groups and channels are ignored),
  and a per-chat rate limit kills bot-to-bot loops.

## Run it

Requirements: Docker (with Compose) and an [Anthropic API key](https://console.anthropic.com/).

```bash
cp .env.example .env        # put your ANTHROPIC_API_KEY in it
docker compose up --build
# → http://localhost:3000
```

That's the whole setup — two containers (app + MongoDB). On a fresh database
it seeds a small demo garage (two cars, a few records) so the first screen is
alive — the seed runs once and never again; edit or delete the demo cars
freely. Then tell Hefesto about your last oil change and watch the dashboard
update itself.

If port 3000 is busy, set `APP_PORT=3001` in `.env`.

**API docs:** Swagger UI at [`/api/docs`](http://localhost:3000/api/docs), raw
OpenAPI 3 spec at [`/api/docs-json`](http://localhost:3000/api/docs-json).

## Architecture

```
┌─ Angular 20 + Tailwind 4 ─┐  REST  ┌───────── NestJS 11 ─────────┐
│ Chat · Dashboard ·        │───────▶│ channels/web    (controller) │
│ Vehicle · Connect         │  SSE   │ channels/whatsapp (Baileys)  │
└───────────────────────────┘        │          │                   │
                                     │          ▼                   │
      WhatsApp ─────────────────────▶│ assistant/  (channel-agnostic│
                                     │  core) ──▶ Claude API        │
                                     │          │  structured output│
                                     │          ▼                   │
                                     │ vehicles/ (Mongoose) ──▶ Mongo
                                     └─────────────────────────────┘
```

- **Channel-agnostic core.** Web chat and WhatsApp are thin adapters over one
  `AssistantService.handleMessage(channel, text)`. Adding Telegram or SMS would
  not touch the domain logic.
- **Structured outputs, validated.** Claude replies through a zod-validated
  schema (`intent: log_maintenance | query_history | general`) with one retry on
  failure — no free-text parsing, no silent bad data.
- **Hybrid AI + code.** The AI does what code can't (understand language); code
  does what AI shouldn't (aggregations, service-interval rules, money).
- **Shared types.** `shared/types.d.ts` is imported by both apps as
  `@hefesto/shared` — one contract, zero drift, no build step.

### Repo layout

```
frontend/   Angular 20 (standalone, signals) + Tailwind 4
backend/    NestJS 11 + Mongoose + @anthropic-ai/sdk + Baileys
shared/     Types shared by both apps (types-only, erased at build)
docs/       PRD.md — the product spec this was built against
```

## Local development

One command (Mongo in Docker + API and Angular with hot reload):

```bash
npm i && (cd backend && npm i) && (cd frontend && npm i)   # first time only
npm run dev
```

Or piece by piece:

```bash
docker compose up -d mongo          # Mongo on localhost:27017
cd backend  && npm run start:dev    # API on :3000
cd frontend && npm start            # Angular on :4200, proxies /api
```

**Tests:**

- Unit — `cd backend && npm test` (22 tests): the deterministic guardrails that
  sit between the model and the database (anti-fabrication number verification,
  date guard, language sniff, which-car resolution). Each case targets a known
  LLM failure mode: fabricated numbers, ambiguous car targets, bad dates.
- End-to-end — `python3 scripts/e2e-regression.py` against the running app
  (27 checks): infra + OpenAPI, CRUD with validation (invalid/future dates,
  negative amounts), garage-wide dashboard math, the full AI pipeline (log,
  amend-not-duplicate, which-car flow, real aggregation answers, off-topic
  refusal, language follow), and the WhatsApp allowlist API. It creates its own
  throwaway data and cleans up after itself.

Next testing steps: service-level tests with a mocked Anthropic client, and API
e2e via supertest + mongodb-memory-server.

Environment (see `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | — (required) | Claude API key |
| `ANTHROPIC_MODEL` | `claude-haiku-4-5` | Extraction/conversation model |
| `APP_PORT` | `3000` | Host port for the app container |
| `MONGO_URI` | `mongodb://localhost:27017/hefesto` | Only outside Docker |

## Design decisions (and trade-offs)

- **Baileys (unofficial WhatsApp Web protocol) instead of the Business Cloud
  API.** Zero-friction for a prototype: no Meta approval, no webhook tunnels; the
  reviewer can scan and test in a minute. In production this would be the
  official Cloud API — the adapter boundary makes that a drop-in swap. Note that
  unofficial clients are against WhatsApp's ToS; use a spare number.
- **Claude Haiku 4.5 by default.** Extraction and intent-classification are
  exactly the workload small models are great at; swap `ANTHROPIC_MODEL` for a
  bigger model with one env var if you want.
- **Single user (v1), multi-vehicle.** Auth and multi-tenancy are out of scope
  by design — the PRD (docs/PRD.md) documents scope decisions explicitly,
  including a changelog of what evolved during the build day.
- **The AI never computes numbers.** `query_history` answers are template +
  backend-computed value. Trust is the product.

## What I'd build next

- Receipt photo → record (Claude vision, same pipeline).
- Reminders pushed through WhatsApp when a service comes due.
- Multi-user with auth (the data model is already multi-vehicle).
- Long-term assistant memory (preferred workshop, driving patterns).
- Full UI chrome i18n (assistant replies already follow the user's language).
- CSV export of the history.
