# DESIGN.md — Hefesto

## Theme decision
Direction chosen by the owner: **premium light SaaS** — the most
commercially "sellable" register (Stripe/Linear/Notion familiarity). Scene: a car
owner at the gas pump at midday, one thumb, 20 seconds — bright light also favors
light-first. Dark mode is a cool-slate variant via `prefers-color-scheme`.
(Two earlier explorations — warm craft paper, and warm "forge at night" dark —
were rejected as insufficiently commercial.)

## Color — strategy: Restrained, cool neutrals + one brand accent
Cool near-white surfaces, deep slate ink. One accent — **trustworthy blue**
(oklch 55% 0.2 262) — at ≤10% of the surface, reserved for: brand marks, the
primary action, selection states, and record-type tints. Owner decision:
orange/ember rejected as an accent; blue chosen for maximum commercial
familiarity. The forge heritage lives in the name, the 🔧 mark, and
the copy — not in the palette. Token name: `--color-accent`.

Tokens (OKLCH):
- `--surface`        oklch(0.975 0.006 75)   warm paper (page background)
- `--surface-raised` oklch(0.99 0.004 75)    cards, input bars
- `--surface-sunken` oklch(0.945 0.008 70)   user chat bubbles, wells
- `--ink`            oklch(0.24 0.015 55)    primary text (warm near-black)
- `--ink-soft`       oklch(0.45 0.015 55)    secondary text
- `--ink-faint`      oklch(0.62 0.012 60)    timestamps, placeholders
- `--line`           oklch(0.90 0.008 70)    hairline borders
- `--ember`          oklch(0.60 0.17 45)     accent: burnt ember orange
- `--ember-deep`     oklch(0.50 0.16 40)     accent hover / active
- `--ember-tint`     oklch(0.95 0.025 55)    accent wash backgrounds
- `--ok`             oklch(0.58 0.12 150)    success (forge-patina green)
- `--warn`           oklch(0.70 0.14 85)     upcoming-service amber
- `--danger`         oklch(0.55 0.19 25)     destructive

Dark variant: invert lightness roles (surface oklch(0.21 0.012 55), raised 0.25,
ink 0.93), ember raised to oklch(0.68 0.16 50) for contrast.

## Typography
- Display/headings: **Bricolage Grotesque** (via @fontsource, bundled — works
  offline in the Docker demo). Weight 600–700, tight tracking.
- Body/UI: system sans stack. Chat body 15–16px, line-height 1.5.
- Numbers (costs, mileage): `font-variant-numeric: tabular-nums`.
- Scale ratio ≥1.25 between steps.

## Shape & spacing
- Radii: 12px cards, 18px chat bubbles (asymmetric corner toward the sender), full
  pill for the input bar and chips.
- Mobile-first: single column, bottom tab bar (Chat · Panel · Vehicle), content
  max-width 640px centered on desktop, tab bar becomes a left rail ≥900px.
- Spacing rhythm varies: chat is tight (8px stack), dashboard breathes (24px+).

## Components
- **Chat bubbles**: user = sunken warm bubble right-aligned; Hefesto = no bubble,
  flush-left text with a small ember anvil/wrench glyph — the assistant is the
  page talking, not a box.
- **Record card**: the trust object. Raised card with type glyph, description,
  meta row (date · km · cost in tabular nums), confidence hint when AI-created,
  edit affordance. Appears inline in chat after a log and in the history list.
- **Input bar**: pill, sticky bottom, send button fills ember when text present.
- No side-stripe borders, no gradient text, no glassmorphism, no identical card
  grids, no modals where inline works.

## Motion
- Message entry: 180ms ease-out-quint translateY(6px)+fade.
- Typing indicator: three ember dots, subtle.
- Respect `prefers-reduced-motion`.
