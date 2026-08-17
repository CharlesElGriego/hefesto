# PRD — Hefesto 🔧🤖
### AI-powered car maintenance assistant
> *Hefesto (Hephaestus): Greek god of the forge and workshops — the patron of mechanics.*

**Version:** 1.1 · **Author:** Charles
*(v1.0 was the morning plan; v1.1 records what actually shipped by end of day — see the changelog at the bottom.)*

---

## 1. Vision

A personal assistant for your car. The user talks to it in natural language — via web chat or WhatsApp — and Hefesto logs maintenance, answers questions about the service history, and anticipates upcoming services. The form disappears: keeping track of your vehicle becomes as easy as sending a message.

> *"changed the oil and filter, $45, 62,400 km"* → structured record + *"✅ Logged. Your next oil change is due around 67,400 km."*

## 2. Problem

Keeping a vehicle's maintenance history is valuable (resale value, warranties, cost control, preventing breakdowns), but almost nobody does it: existing apps demand multi-field forms at the worst possible moment — walking out of the shop, standing at the gas station. The result is an incomplete or nonexistent history.

**Hypothesis:** if logging a maintenance event costs the same effort as sending a WhatsApp message, users will actually keep their history up to date.

## 3. Users and use cases

**User:** a vehicle owner who wants a service history and cost control without friction.

Primary use cases:
1. **Log maintenance via chat:** describe in natural language what was done; Hefesto extracts type, cost, mileage, date, workshop, and items, and saves it with implicit confirmation (an editable card).
2. **Query the history conversationally:** "how much have I spent this year?", "when was my last oil change?" → Hefesto queries the DB and answers with real data.
3. **See the vehicle's state at a glance:** dashboard with timeline, cumulative/per-category spend, and estimated upcoming services.
4. **Manage records manually:** classic CRUD as a fallback (create, edit, delete).
5. **Connect WhatsApp from the web:** scan a QR code and manage the car from WhatsApp without ever returning to the site.

## 4. Scope

### 4.1 Core — non-negotiable
- **F1. AI logging pipeline:** message → Claude (structured output, JSON validated against a schema with retry) → action → natural reply. Intents: `log_maintenance`, `query_history`, `general`.
- **F2. Web chat (Angular):** conversation with Hefesto; when something is logged, it shows a card of the created record with an edit option (the human corrects the AI).
- **F3. Vehicle and record management:** vehicle profile (make, model, year, mileage), history table, manual CRUD.
- **F4. Dashboard:** maintenance timeline, total and per-category spend, upcoming-service alerts (simple km/time interval rules).
- **F5. Docker Compose:** 2 services (multi-stage Angular+NestJS app, Mongo) + demo seed data.

### 4.2 Differentiator — high priority
- **F6. WhatsApp channel (Baileys):** "Connect WhatsApp" screen in the web app; live QR (SSE, rotates ~20s); connected/disconnected status; session persisted in a volume; supports a secondary number or self-chat ("Message Yourself"). Same pipeline as the web chat (channel-agnostic core).

### 4.3 Next iteration (stretch)
- **F7. Receipt photo → record** (Claude vision, same pipeline).
- **F8. CSV export** of the history.
- ~~**F9. Multi-vehicle support.**~~ → **shipped in v1.1** (see changelog).

### 4.4 Out of scope (v1)
- Authentication/multi-user (single-user by design in the prototype).
- Official WhatsApp Business Cloud API (documented as the production path).
- Push/scheduled reminders, i18n, native mobile apps.

## 5. Architecture and stack

```
┌─ Angular + Tailwind ─┐      ┌──────── NestJS ────────────┐
│ Chat · Dashboard ·   │ REST │ channels/web (controller)  │
│ Vehicle · Connect    │─────▶│ channels/whatsapp (Baileys)│
└──────────────────────┘ SSE  │        │                   │
                              │        ▼                   │
   WhatsApp (Baileys) ───────▶│ assistant/ (channel-       │
                              │  agnostic core)──▶ Claude  │
                              │        │                   │
                              │        ▼                   │
                              │ vehicles/ (Mongoose)──▶ Mongo
                              └────────────────────────────┘
```

| Layer | Choice | Rationale |
|---|---|---|
| Front | Angular 20 standalone (signals) + Tailwind | Productivity and consistent utility-first UI |
| Back | NestJS | Modular architecture (DI, modules) mirroring Angular; TypeScript end-to-end |
| DB | MongoDB + Mongoose | Documents fit heterogeneous maintenance records |
| AI | Claude (Anthropic SDK, structured outputs) | Reliable structured extraction + natural conversation |
| WhatsApp | Baileys (unofficial, WebSocket, no Chromium) | Prototype speed; production = Cloud API (documented) |
| Infra | Docker Compose, monorepo with `shared/` (common types) | Reproducibility: clone → up → it runs |

**Key design decisions:**
1. **Channel-agnostic** assistant core — WhatsApp and web are adapters; adding Telegram/SMS never touches the domain.
2. **Hybrid determinism + AI:** the AI extracts and classifies; calculations (totals, upcoming services) are code. AI only where code can't reach.
3. **Baileys vs Cloud API:** a deliberate prototype shortcut, with the production path identified.

## 6. Data model (Mongo)

```ts
Vehicle {
  _id, make, model, year, plate?, currentMileage, createdAt
}

MaintenanceRecord {
  _id, vehicleId, type,           // oil_change | tires | brakes | battery | inspection | repair | other
  description, items: string[],   // ["10W40 oil", "oil filter"]
  cost, currency, mileage, date, workshop?,
  source: 'chat' | 'whatsapp' | 'manual',
  aiConfidence?: number,          // traceability of AI extractions
  rawMessage?: string,            // the user's original message
  createdAt
}

ChatMessage {
  _id, channel: 'web' | 'whatsapp', role: 'user' | 'assistant',
  content, recordId?, createdAt   // recordId links message → created record
}
```

## 7. Assistant contract (structured output)

Claude ALWAYS responds with JSON validated against this schema (retry on failure):

```ts
AssistantAction =
  | { intent: 'log_maintenance', record: { type, description, items,
      cost?, mileage?, date?, workshop? }, confidence: number, reply: string }
  | { intent: 'query_history', query: { kind: 'total_cost' | 'last_service'
      | 'history_filter', filters?: {...} }, reply_template: string }
  | { intent: 'general', reply: string }
```

- `log_maintenance`: the backend saves and responds with the card + reply.
- `query_history`: the **backend** runs the query against Mongo (the AI never makes up numbers) and composes the answer.
- Missing critical fields (e.g. cost) → Hefesto asks a follow-up question instead of inventing data.

## 8. API (minimal surface)

```
POST /api/chat                    { message } → { reply, record? }
GET  /api/vehicles/:id            profile + summary
GET  /api/records?vehicleId=      history (basic filters)
POST/PUT/DELETE /api/records      manual CRUD
GET  /api/dashboard/:vehicleId    aggregates (totals, per category, upcoming)
GET  /api/whatsapp/status
POST /api/whatsapp/connect        → SSE /api/whatsapp/qr (QR stream)
POST /api/whatsapp/disconnect
```

*(v1.1: the surface grew — full vehicles CRUD, `GET /api/dashboard/garage`
fleet overview, WhatsApp allowlist endpoints. The live spec is Swagger at
`/api/docs`.)*

## 9. Non-functional requirements

- **Startup:** `cp .env.example .env` (only `ANTHROPIC_API_KEY`) + `docker compose up` → app at `http://localhost:3000` with seed data.
- **AI resilience:** schema validation + 1 retry; on failure, an honest error reply (never invented data).
- **Graceful degradation:** without WhatsApp connected, everything else works 100%.
- **Persistence:** volumes for Mongo and the Baileys session (no QR re-scan).
- **UI:** mobile-first (the primary use happens on the phone — at the shop, at the gas station); fully usable on desktop; dark-mode friendly; carefully designed empty states.

## 10. Acceptance criteria

1. Cold `docker compose up` → app running with seed data. ✅
2. Type a maintenance event in natural language in the web chat → correct record card + updated dashboard. ✅
3. Ask "how much have I spent this year?" → answer with the real number from the DB. ✅
4. Connect WhatsApp by scanning the QR from the web → send a WhatsApp message → the record appears in the web app. ✅
5. Edit/delete a record manually. ✅
6. Ambiguous message ("did some work on the car") → Hefesto asks a follow-up instead of inventing. ✅

## 11. Risks and mitigations

| Risk | Prob. | Mitigation |
|---|---|---|
| Baileys breaks (WhatsApp protocol change, number ban) | Medium | It's F6, not core; the web app works 100% without it; use a secondary number |
| Erratic AI extraction | Low | Schema + validation + retry; user-editable card |
| Scope creep ("make it do everything") | High | This PRD is the contract: car only, F1–F6 only; stretch only once core is done |
| Running out of time | Medium | Cut order defined (§12): cutting from the bottom never breaks the delivery |
| API cost/latency | Low | Haiku 4.5 for extraction (fast and cheap); bounded conversation context |

## 12. Implementation plan (cut order: bottom-up)

| Block | Hours | Deliverable |
|---|---|---|
| 1. Skeleton | 1.5 | Monorepo + compose up working end-to-end (3-layer hello world) |
| 2. AI pipeline | 2.5 | POST /api/chat → Claude → Mongo → reply (the heart, first) |
| 3. Web chat | 2 | Chat screen + record cards |
| 4. Dashboard + CRUD | 2 | Timeline, aggregates, table with CRUD |
| 5. WhatsApp | 2 | QR connection from the web + end-to-end messages |
| 6. Wrap-up | 2 | Demo seed data, UI polish, README |

---

## 13. Changelog — v1.1 (what shipped beyond the plan, end of build day)

Everything in F1–F6 shipped. Intensive testing during the day (much of it over
the live WhatsApp channel) shaped these additions:

**Scope promoted / new features**
- **Multi-vehicle garage** (was stretch F9): vehicle CRUD + selector in the UI,
  per-car dashboard, and assistant disambiguation — with one car it never asks;
  with several it asks *which* car when the message doesn't say.
- **`add_vehicle` intent**: cars can be added from the conversation ("add my
  Hilux 2021, 80,000 km") and their profile corrected from it too ("it's
  actually a 2019 with 0 km") — required for the WhatsApp channel to stand
  alone, since there is no Garage tab in a chat. Same anti-fabrication rules
  apply, and the assistant never claims a change it didn't persist.
- **`amend_last_record` intent** (not in the original contract):
  follow-ups like "it was $45" or "the odometer was at 24,000 km" edit the
  just-created record instead of duplicating it — including moving it to
  another car ("it was the Hilux, not the Corolla").
- **Pending-log flow**: when the backend asks "which car?", the extracted
  record is held in memory and completed deterministically when the user
  answers with a car name — no second AI extraction.
- **OpenAPI 3 + Swagger UI** at `/api/docs`.

**Trust & safety by design (an AI that writes to your data must be caged)**
- **Anti-fabrication net**: cost and mileage are only persisted if the number
  literally appears in the user's current message. LLMs are known to carry
  numbers over from conversation history — deterministic code beats prompt
  rules, so the net is code, not prompt.
- **Backend-enforced vehicle guardrail**: with several cars and no clear
  target, the backend never guesses — it asks which car and completes the
  pending record deterministically.
- **WhatsApp access control, zero-trust by default**: the paired account's
  own self-chat always works; every other number must be explicitly
  authorized from the Connect screen (persisted allowlist + env override).
  DMs only — groups, channels, and broadcasts are ignored — plus an
  8-replies/min per-chat rate limit that makes bot-to-bot loops impossible.
- **Strict assistant scope**: off-topic questions (sports, recipes, general
  knowledge) are declined, not answered — this is a tool, not a chatbot.
- **Date/number validation** on manual CRUD (invalid dates, future dates,
  negative amounts → 400) and full request/pipeline logging.

**Design & UX changes**
- Accent color: ember orange → **trustworthy blue** (owner decision:
  commercial familiarity over thematic branding; the forge lives in the name
  and the 🔧). Cool light SaaS palette, dark variant, AA contrast, focus rings.
- Channel-aware answer formatting: history breakdowns grouped by car with
  subtotals and totals; WhatsApp gets bold markup, web gets clean plain text.
- Deterministic replies (errors, guardrail questions, confirmations) detect
  the user's language (ES/EN); AI replies follow the latest message's language.
  The web UI chrome localizes itself (ES/EN) from the device language.
- Information architecture: Panel = fleet-wide overview (total, spending per
  car, upcoming across every car), Garage = card grid → per-car detail page
  with its history and totals. Reactive-form validation on all manual entry.
- Typing indicator on WhatsApp (`composing` presence) and a welcome message
  on fresh pairing.
- Destructive actions confirm through a proper modal dialog (danger button,
  Escape/backdrop to cancel) instead of inline yes/no.
- Demo garage seeded exactly once on a fresh database (concurrency-guarded),
  so the first `docker compose up` already shows a living product.

**Quality & tooling**
- 22 unit tests over the deterministic guardrails — every case targets a real
  LLM failure mode (fabricated numbers, ambiguous car targets, bad dates) — plus
  a 27-scenario e2e sweep (`scripts/e2e-regression.py`) that creates its own
  data and cleans up after itself.
- Strict TypeScript end to end (backend included), `OnPush` change detection
  on every component, TSDoc on every exported symbol, Prettier in both apps,
  BEM naming for all custom CSS.

**Still out of scope (unchanged):** auth/multi-user, official WhatsApp Cloud
API, push reminders, receipt photos, CSV export.
