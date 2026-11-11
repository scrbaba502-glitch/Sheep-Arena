# A² Presents — AI Collaboration Rules

Project: MYTHBEASTS CLASH
Tagline: Awaken the Beast Within. Command the Elements. Rise. Conquer. Become Legend.

## Repository workflow
- `main` is the stable production branch. Never commit directly to it.
- `beasts-arena-reimagining` is the existing experimental project line.
- Use `integration` for changes that have passed individual review and are awaiting combined testing.
- GPT and Grok must work on separate feature branches (for example, `feature/gpt-<task>` and `feature/grok-<task>`).
- Submit changes through pull requests. Do not merge to `main` without explicit owner approval.
- Before editing, inspect the current code, branch history, and project instructions. Do not assume files or architecture that have not been verified.

## Roles
- GPT: architecture, implementation planning, integration, debugging, and final verification.
- Grok: independent implementation proposals, code review, alternative solutions, and targeted debugging.
- The project owner makes final scope and merge decisions. Either AI may challenge the other's work with evidence.

## Quality requirements
- Preserve working gameplay and multiplayer behavior.
- Prioritize Android compatibility and performance on the target device.
- Keep 3D visuals ambitious while measuring frame rate, memory use, load time, and thermal impact.
- Add or update tests for changed behavior where practical.
- Run available build, lint, and test commands; report exact commands and results.
- Never claim a build or test passed unless it was actually run and its result observed.
- Review diffs for regressions, duplicated systems, unused assets, and unnecessary dependencies.
- Document changed files, known limitations, and manual device-test steps in each pull request.

## Safety and secrets
- Never commit API keys, tokens, signing credentials, passwords, or private user data.
- Do not weaken authentication, multiplayer validation, or deployment security to make a test pass.
- Do not force-push shared branches or rewrite history without explicit approval.
- If a task risks data loss or breaks a working deployment, stop and explain the risk before proceeding.

## Definition of done
A change is ready for integration only when its scope is clear, the diff is reviewed, relevant tests/builds have been run, Android impact is considered, and remaining risks are documented.
