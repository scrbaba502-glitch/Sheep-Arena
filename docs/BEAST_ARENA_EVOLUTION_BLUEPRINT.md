# BEASTRYX ARENA — Evolution Blueprint

> Working brand: **BEASTRYX ARENA** (name selected by user).
> Tagline direction: **Every Species. One Arena. Infinite Power.**

## Product direction

Evolve the existing A² Sheep Arena codebase into an original, mobile-first, 2.5D puzzle-combat game. Preserve the existing Sheep Arena as a playable founding faction and retain its core match-3 combat, arena presentation, boosters, progression and online-room foundations.

This is an evolution of the user's own project, not a recreation of another game's protected characters, artwork, code, branding or exact presentation.

## Non-negotiable design decisions

- Sheep fighters remain in the game and remain equally playable with every other fighter.
- No species or faction is inherently weaker, starter-only or paywalled.
- Balance comes from distinct playstyles, ability timing and player skill—not faction privilege.
- Existing production `main` remains untouched while work happens on `evolution/riftbound-foundation`.
- Keep the existing web/PWA and JavaScript/Canvas architecture for the first milestones; package for Android after mobile UX and device testing.
- Keep the existing Cloudflare authoritative multiplayer track separate until it passes integration and security testing.

## Proposed factions

1. **Flock** — sheep champions, grapplers, tactical bruisers and support fighters.
2. **Human** — wrestlers, martial artists, tacticians and weapon specialists.
3. **Beast** — wolves, lions, bears and other original creature champions.
4. **Mythic** — dragons, spirits, titans and other original legendary beings.
5. **Cyber** — androids, exo-suit fighters and engineered combatants.

These are creative categories, not locked roster counts. Each faction should have varied roles and viable competitive options.

## Core gameplay pillars

- Preserve the 7×7 match-3 combat board.
- Preserve and refine punch, rifle and slam/chokeslam attack families where they fit each fighter.
- Give each fighter a distinct passive, signature ability and ultimate.
- Build ability identity through tile colours, match sizes, chains, board manipulation, defence and status effects.
- Keep Heal, Freeze and Shuffle as recognizable booster concepts while balancing cooldowns/charges and counterplay.
- Make combat readable on narrow Android screens: large touch targets, responsive board sizing, clear health/rage/status UI and reduced-motion options.

## Technical foundation already present

- Root frontend: `index.html`, canvas game and PWA files.
- Browser multiplayer adapter: `cloudflare-client.js`.
- Cloudflare backend: `cloudflare/src/game-engine.ts`, `cloudflare/src/index.ts`, Durable Object room model.
- Existing deterministic 7×7 engine has unit tests for board generation, match detection, legal swaps, cascades and attacks.
- Cloudflare backend README documents deployment and remaining two-device/reconnect/production checks.

## Milestones

### M0 — Baseline and safety
- Keep production `main` untouched.
- Establish a preview branch and capture a known-good baseline.
- Run frontend validation, backend typecheck, unit tests, integration smoke tests and dependency audit before changing mechanics.

### M1 — Mobile-ready foundation
- Audit current layout and touch interactions at common Android viewport sizes.
- Add responsive scaling, safe-area handling, accessible controls and performance profiling.
- Fix gameplay bugs without changing the existing game identity.

### M2 — Fighter data model
- Move fighter definitions into data-driven records: id, name, faction, role, stats, passive, signature, ultimate, portrait/animation keys.
- Migrate the original sheep roster into this model unchanged in spirit.
- Add one original test fighter from another faction without removing or replacing sheep fighters.

### M3 — Ability/combat architecture
- Introduce a validated ability interface and deterministic combat effects.
- Keep authoritative multiplayer calculations server-side.
- Add tests for ability use, cooldown/charges, statuses, balance boundaries and invalid client messages.

### M4 — Visual evolution
- Upgrade arena layers, hit feedback, fighter presentation, effects and transitions.
- Use original or properly licensed assets only.
- Keep a fallback low-effects mode for performance and accessibility.

### M5 — Progression and modes
- Add fighter progression, campaign encounters, unlocks and tournament scaffolding.
- Ensure unlocks and progression do not create faction-level competitive disadvantages.

### M6 — Android release candidate
- Choose a maintained Android packaging route after validating the web game on devices.
- Test install, orientation, pause/resume, offline behavior, network loss, memory and performance.
- Prepare store assets and privacy disclosures only after feature and backend readiness.

## Immediate next engineering task

Perform a baseline audit on the evolution branch before modifying gameplay files. Report exact current file structure, test commands/results, existing fighter roster and ability implementation locations. Then implement the data-driven fighter registry in a small, reviewable change with the original sheep roster represented first. Do not deploy or merge to production without explicit user approval.
