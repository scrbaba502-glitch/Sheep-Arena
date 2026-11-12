# MYTHBEASTS CLASH — Isometric 3D Vision Lock

**Status:** Direction locked  
**Target:** Android-first mobile action game  
**Working branch:** `feature/mythbeasts-3d-foundation`  
**Pull request:** Draft PR #3 — keep open and unmerged

## 1. Camera and battlefield direction

The game uses a **3D isometric / elevated three-quarter camera**. The camera looks diagonally down across a readable battlefield, showing the champion, enemies, terrain, hazards and combat space at once.

This is not a fixed circular ring fighter. Battle locations should feel like places in a mythic world: ancient temple complexes, ruined kingdoms, frozen wastes, volcanic fortresses and other distinct environments. A location may have boundaries for gameplay, but the boundary must be part of the world rather than a conspicuous boxing-ring circle.

Camera behavior:
- Keep the player champion and immediate threats readable on a phone screen.
- Smoothly follow the champion and frame the active encounter.
- Avoid abrupt camera snaps, excessive shake and obstructed views.
- Use controlled zoom / framing changes only where they improve combat readability.
- Preserve clear silhouettes and telegraphs against the environment.

## 2. Champion and creature direction

Champions must read as individual mythical characters, not interchangeable robotic mannequins. Each needs a distinct silhouette, anatomy, face or head design, armor/material language, weapon or fighting style, elemental identity, animations and signature abilities.

The established champion roster includes Vyrak, Frostfang, Solarius and Raijin. Atrox Nefas remains a major primordial threat in the story.

Character quality priorities:
- Strong silhouettes and recognizable proportions.
- Articulated rigs with believable anticipation, follow-through, recovery and hit reactions.
- Locomotion that responds to direction and speed.
- Attacks with readable wind-up, active frames, impact and recovery.
- Dodges with meaningful movement and invulnerability timing communicated through animation and effects.
- Transformations and ultimate abilities that feel unique and earned.

## 3. Mobile combat controls

Replace the current four-button directional pad with a mobile-first control layout:
- Left side: responsive virtual analog joystick for 8-way movement.
- Right side: clearly separated primary attack, dodge and skill controls; ultimate becomes available contextually.
- Large touch targets, reliable multi-touch, pointer capture/release and safe-area-aware placement.
- Controls must not obscure the champion, enemy, telegraphs or essential HUD.
- Provide responsive feedback for presses, cooldowns, unavailable abilities and successful hits.

Do not add complex control clusters until the core movement and combat loop feels excellent on an actual Android device.

## 4. Combat and readability

The target is an action-combat loop with positioning, flanking, combos, dodging, signature skills, elemental effects, hit reactions and powerful ultimates. Combat must communicate cause and effect clearly:
- Enemy attacks have unmistakable telegraphs and fair timing.
- Hitboxes and damage ranges match visible weapon / effect reach.
- Attacks have satisfying impact without excessive screen clutter.
- Player and enemy states remain legible at mobile resolution.
- Performance remains stable during effects-heavy encounters.

## 5. Modes and world

Preserve the intended game pillars:
- **Classic Mode:** 1v1 against another player or the computer, subject to a later networking design and feasibility review.
- **Story Mode:** a narrative journey centered on the primordial threat and the established lore.

Do not imply online multiplayer is implemented until it is actually built, tested and supported by backend infrastructure.

## 6. Technical and delivery rules

- Keep all prototype work on `feature/mythbeasts-3d-foundation` and within draft PR #3.
- Never merge this PR or push prototype work to `main` without explicit authorization.
- Preserve existing stable game entry points and useful code; do not replace unrelated systems.
- No paid services, paid APIs, external AI integrations, secrets, production signing or surprise costs.
- Build incrementally. Inspect existing architecture before each change, run available checks, and report exact verified outcomes.
- Android build success is not proof of device usability. Test touch, performance, camera framing and readability on a real phone.
- Do not claim a feature, animation, multiplayer mode or visual quality level exists until implemented and verified.

## 7. Rebuild sequence

1. Audit the current prototype and separate reusable technical foundations from disposable arena presentation.
2. Produce a camera / battlefield greybox with a representative champion and enemy.
3. Implement and tune the virtual joystick and right-side combat controls.
4. Establish champion scale, silhouettes, animation state flow and combat readability.
5. Build one polished vertical-slice encounter in a location that expresses the world.
6. Validate on Android before expanding the roster, arenas, story or multiplayer.

**Acceptance principle:** A feature is not complete merely because it renders. It must support the intended game vision, feel good on a phone, remain readable during combat and pass the relevant checks.
