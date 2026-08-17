# PRODUCT.md — Hefesto

## Product purpose
Hefesto is an AI-powered car maintenance assistant. The user talks to it in natural
language (web chat or WhatsApp) and it keeps the vehicle's service history: logs
maintenance from a sentence, answers questions about spending, anticipates upcoming
services. The core promise: **the form disappears** — logging maintenance costs the
same effort as sending a text message. Full spec in `docs/PRD.md`.

## Register
register: product

## Users
A single car owner (v1 is single-user by design). They are not car nerds — they want
a reliable history for resale/warranty and cost control without friction. Primary
moment of use: **on the phone, right after leaving the workshop or at the gas
station** — one thumb, bright or mixed light, 20 seconds of attention. Desktop use
is secondary (reviewing the dashboard, editing records).

## Tone
Like a trusted mechanic who happens to be organized: warm, direct, competent, a
little craft-proud (the Hephaestus/forge heritage). Never corporate, never cutesy.
The assistant speaks the user's language (Spanish or English); UI chrome is English.

## Brand heritage
Named after Hephaestus, Greek god of the forge — patron of mechanics. The identity
leans on forge materials: iron, ember, warm metal. The wordmark moment is the 🔧 +
"Hefesto" pairing.

## Anti-references
- Enterprise fleet-management dashboards (tables everywhere, gray chrome).
- Generic SaaS AI-chat clones (purple gradients, glassmorphism, sparkle emoji ✨).
- Car-parts e-commerce aesthetics (racing stripes, aggressive reds, carbon fiber).
- Sterile clinical white + teal "utility app" look.

## Strategic principles
1. The chat is the product's face; the dashboard is its receipt.
2. Every number shown comes from the database, never from the model — the UI should
   make records feel like solid, verifiable objects (cards you can open and edit).
3. Mobile-first always; desktop is an adaptation, not the origin.
4. Trust cues matter: show what the AI extracted and let the human correct it.
