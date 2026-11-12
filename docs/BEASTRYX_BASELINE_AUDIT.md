# BEASTRYX ARENA — Baseline Engineering Audit

Date: 2026-11-12
Branch: `evolution/riftbound-foundation`
Production branch: `main` (not modified)

## Executive summary

The existing Sheep Arena is a compact, single-page Canvas game with a 7×7 match-3 combat loop and a separate Cloudflare-authoritative 1v1 multiplayer backend. The current foundation is reusable. The main architectural gap for BEASTRYX ARENA is the absence of a real fighter data model: the visible combatants are currently rendered by a sheep-specific drawing function, while opponent names and hats are simple arrays/cosmetics.

## Confirmed frontend structure

- `index.html` — approximately 52 KB; contains the UI, styles, game state, board logic, progression, local storage, combat presentation, and home screen in one document.
- `cloudflare-client.js` — browser adapter for the Cloudflare WebSocket room API.
- `manifest.webmanifest`, `sw.js`, `icon.svg`, `icon-192.png`, `icon-512.png` — PWA metadata, service worker and icons.
- `peerjs.min.js` — bundled PeerJS fallback dependency.

## Confirmed gameplay architecture

- 7×7 match-3 board with five tile types.
- Match groups, legal swaps, cascades, gravity/refill, hints and no-legal-move rerolls.
- Combat currently maps match size and chain progression to punch, rifle and slam attacks.
- Local progression includes levels, coins, daily rewards, outfits/hats and boosters (Heal, Freeze, Shuffle).
- Canvas arena presentation includes a sheep-specific `sheep(...)` renderer.
- The current enemy naming pool is `ENM` (eight sheep-themed names); `HAT` is a cosmetic list. These are not yet a selectable multi-species fighter roster.
- Existing frontend is not yet data-driven by fighter identity, faction, role, stats or abilities.

## Confirmed multiplayer/backend architecture

- `cloudflare/src/game-engine.ts` contains deterministic, species-neutral 7×7 board rules and match-to-attack resolution.
- `cloudflare/src/game-engine.test.ts` contains Vitest tests for deterministic board creation, match merging, invalid swaps, legal moves, cascades and attack progression.
- `cloudflare/src/index.ts` implements the Worker routes and Durable Object room simulation.
- `cloudflare-client.js` handles room creation/join, WebSocket transport, reconnects, presence and server-authoritative moves.
- The backend README explicitly notes that production readiness still requires continued two-device, reconnect, network-change, quota and latency validation.

## Existing validation commands

Run from `cloudflare/` (Node.js 20+ and npm required):

```sh
npm install
npm run typecheck
npm test
npm run test:integration
npm audit --audit-level=high
node validate-frontend.mjs
npm run build
```

The GitHub Actions workflow `.github/workflows/cloudflare-backend.yml` runs dependency audit, typecheck, unit tests, integration smoke test, frontend syntax validation and Wrangler dry-run build on relevant pull requests.

## Test execution status

This audit inspected repository source and workflow configuration through GitHub. No local Node/npm execution environment was available during this audit, so the commands above are documented validation steps, **not claimed as passing test results**. CI must provide the actual pass/fail evidence before a gameplay migration is considered verified.

## BEASTRYX implications

1. Preserve the existing 7×7 match-3 rules and combat loop during the first roster migration.
2. Introduce a separate fighter registry with stable IDs, display name, faction, role, balanced stats, passive, signature and ultimate ability identifiers, plus visual asset keys.
3. Represent the founding sheep fighters in that registry first. Do not silently replace the existing sheep presentation or demote sheep to starter-only status.
4. Add one non-sheep test fighter as a controlled architecture proof only after the sheep registry and rendering adapter are in place.
5. Keep authoritative multiplayer changes isolated and tested; never trust client-submitted damage, HP or ability outcomes.
6. Keep production `main` untouched. Do not deploy or merge without explicit user approval.

## Next implementation slice

Build the fighter registry as an additive layer, first mapping the existing sheep presentation and cosmetic selections to stable fighter IDs. Then add a small compatibility adapter so the current sheep-only game still renders and plays as before. Add registry validation tests before introducing new species or ability effects.

## Implementation progress — first roster and selection slice

Branch-only changes now include:

- `fighters.js`: eight original sheep champions as stable, data-driven fighter records, each with faction, species, role, equal baseline stats, passive/signature/ultimate identifiers and renderer/cosmetic metadata.
- `cloudflare/validate-fighters.mjs`: Node-based checks for roster count, schema, unique IDs, sheep faction/species and equal baseline stats.
- GitHub Actions workflow: runs the registry validator on pull requests affecting the game.
- `index.html`: BEASTRYX identity and a champion-selection overlay. Selection persists locally and the chosen fighter ID is attached to the local player state.
- Species roadmap previews: Human, Beast, Mythic and Cyber are shown as in-development, not falsely represented as playable.
- `manifest.webmanifest` and `sw.js`: updated app description and service-worker cache version.

### Explicit limitations at this milestone

- All eight founding champions currently share the existing sheep renderer; role-specific models, animations, sounds and ability effects are not implemented yet.
- Fighter choice is stored in the local player state but is not yet synchronized to the Cloudflare multiplayer protocol.
- The non-sheep factions are previews only and are not playable yet.
- GitHub Actions is configured for pull requests. No PR has been opened, so no CI run or automated test pass is claimed.
- Existing production deployment and `main` remain untouched.

### Next safe implementation steps

1. Add a fighter presentation layer so each founding sheep champion has a distinct visual treatment without changing combat balance.
2. Add a validated ability-definition registry and implement one passive/signature/ultimate end-to-end in local play.
3. Add fighter identity to multiplayer room state only after protocol versioning and server-authoritative validation are designed.
4. Introduce the first non-sheep playable fighter as a controlled vertical slice, then expand the Human, Beast, Mythic and Cyber rosters.
