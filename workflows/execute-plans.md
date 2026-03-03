# Workflow: Execute Plans (05 → 15)

> Use this workflow to review, implement, and open PRs for each plan in `docs/plans/`.
> TARS runs Claude CLI to implement each plan. Marcos is the final gatekeeper — no merges without his approval.

---

## Pre-flight

```bash
cd ~/.openclaw/workspace/saga
git fetch --all
git status  # must be clean
```

Confirm current state of remote branches:
```bash
git branch -r | grep feat/
```

Expected existing branches: `feat/01` through `feat/04`, `feat/05-ai-world-generation`.

---

## Phase 0: Review Plan 05 (already implemented)

> Goal: Verify the existing branch matches the plan. No implementation needed.

### Step 1: Check out the branch locally

```bash
git checkout feat/05-ai-world-generation
```

### Step 2: Review the diff

```bash
git diff main...feat/05-ai-world-generation
```

Read `docs/plans/05-ai-world-generation.md` and compare:
- All acceptance criteria in the plan are covered by the diff
- No obvious missing tasks
- Code quality is acceptable (no TODOs left, no hardcoded secrets, tests present)

### Step 3: Review the PR on GitHub

```bash
gh pr list --head feat/05-ai-world-generation
gh pr view <PR_NUMBER> --comments
```

Check:
- PR description matches the plan
- CI is green (all checks passing)
- No unresolved review comments

### Step 4: Notify Marcos

Send a summary message with:
- ✅/⚠️ status per acceptance criterion
- CI status
- Any issues found (missing tasks, failing tests, code concerns)
- PR link

**Template:**
```
📋 Plan 05 Review — AI World Generation

Acceptance criteria:
• [x/✗] lib/memory.ts CRUD (4 tests)
• [x/✗] lib/prompts/world-gen.ts (2 tests)
• [x/✗] Claude world generation in campaign creation
• [x/✗] 5 campaign files initialized
• [x/✗] WorldPreview component
• [x/✗] Loading state
• [x/✗] yarn build succeeds

CI: ✅ passing / ⚠️ failing
PR: <link>

Issues found: <none | list>
```

---

## Phase 1: Execute Plans 06 → 15 (serial)

Repeat this block for each plan N, where:
- `PREV_BRANCH` = branch of plan N-1
- `PLAN_FILE` = `docs/plans/NN-plan-name.md`
- `BRANCH` = `feat/NN-plan-slug` (derive slug from plan filename)

### Plan sequence

| N  | File                              | Branch                          | Base branch                     |
|----|-----------------------------------|---------------------------------|----------------------------------|
| 06 | 06-image-generation.md            | feat/06-image-generation        | feat/05-ai-world-generation      |
| 07 | 07-lobby-player-joining.md        | feat/07-lobby-player-joining    | feat/06-image-generation         |
| 08 | 08-lobby-realtime-portraits.md    | feat/08-lobby-realtime-portraits| feat/07-lobby-player-joining     |
| 09 | 09-game-room-static-ui.md         | feat/09-game-room-static-ui     | feat/08-lobby-realtime-portraits |
| 10 | 10-ai-narration-streaming.md      | feat/10-ai-narration-streaming  | feat/09-game-room-static-ui      |
| 11 | 11-memory-system.md               | feat/11-memory-system           | feat/10-ai-narration-streaming   |
| 12 | 12-player-actions-free-mode.md    | feat/12-player-actions-free-mode| feat/11-memory-system            |
| 13 | 13-session-management.md          | feat/13-session-management      | feat/12-player-actions-free-mode |
| 14 | 14-combat-sequential-mode.md      | feat/14-combat-sequential-mode  | feat/13-session-management       |
| 15 | 15-polish-deploy.md               | feat/15-polish-deploy           | feat/14-combat-sequential-mode   |

---

### Step-by-step for each plan N

#### 1. Create branch from previous

```bash
git checkout <PREV_BRANCH>
git pull origin <PREV_BRANCH>   # ensure latest
git checkout -b <BRANCH>
```

#### 2. Run Claude CLI to implement the plan

```bash
PLAN=$(cat docs/plans/<PLAN_FILE>)
claude --dangerously-skip-permissions -p "$PLAN"
```

> Claude Code will use its built-in tools (Bash, Edit, etc.) to implement all tasks in the plan file.
> The plan file already instructs Claude to use `superpowers:executing-plans`.

#### 3. Verify implementation

After Claude exits:

**Check exit code:**
- Non-zero → implementation failed → **stop, notify Marcos immediately** (see Failure Protocol below)

**Check file changes:**
```bash
git diff --stat HEAD
```
- Zero changed files → Claude did nothing → **stop, notify Marcos** (see Failure Protocol)

**Run tests:**
```bash
yarn test --run 2>&1 | tail -30
```
- Note pass/fail counts.

**Run build:**
```bash
yarn build 2>&1 | tail -20
```
- Note any errors.

#### 4. Push branch

```bash
git push origin <BRANCH>
```

#### 5. Open PR (base = previous branch, not main)

```bash
gh pr create \
  --base <PREV_BRANCH> \
  --head <BRANCH> \
  --title "feat: Plan $(N) — $(plan title)" \
  --body "$(cat docs/plans/<PLAN_FILE> | head -5)

---
Implements: \`docs/plans/<PLAN_FILE>\`
Depends on: \`<PREV_BRANCH>\`

## Test results
\`\`\`
$(yarn test --run 2>&1 | tail -20)
\`\`\`

## Build
\`\`\`
$(yarn build 2>&1 | tail -10)
\`\`\`

> ⚠️ Do not merge without Marcos's explicit approval."
```

#### 6. Notify Marcos — one ping per step

Send a Telegram message after **each individual step**, not just at the end:

| Step | Message |
|------|---------|
| 1 — Branch created | `🌿 Plan <N> · Branch created: <BRANCH> (from <PREV>)` |
| 2 — Claude started | `🤖 Plan <N> · Claude CLI running...` |
| 2 — Claude finished | `✅ Plan <N> · Claude done. Exit: 0 · Files changed: N` |
| 3 — Tests | `🧪 Plan <N> · Tests: X passed / Y failed` |
| 3 — Build | `🏗️ Plan <N> · Build: ✅ success / ⚠️ errors` |
| 4 — Pushed | `⬆️ Plan <N> · Branch pushed to origin` |
| 5 — PR opened | `📬 Plan <N> · PR: <link> (base: <PREV>)` |
| 6 — Done | `📋 Plan <N> complete. Starting plan <N+1>...` |

Then immediately proceed to plan N+1 (do not wait for approval to start the next implementation).

---

## Failure Protocol

If Claude exits non-zero, produces no file changes, or build/tests fail critically:

1. **Stop the chain** — do not proceed to next plan
2. **Notify Marcos immediately:**

```
🚨 Plan <N> — STUCK

Reason: <exit code N / zero file changes / build error>

Last Claude output:
<paste relevant excerpt>

Build errors:
<paste>

Waiting for your input before continuing.
```

3. Wait for Marcos's explicit instruction to continue or fix.

---

## Notes

- **No direct commits to main.** Ever.
- **No merging PRs.** Marcos merges. PRs are for review only.
- **PR base = previous plan branch**, not main. This makes diffs focused and reviewable.
- **Context given to Claude = plan file only.** Claude Code has access to the full repo via its Bash/Edit tools — the plan file is the task description.
- **Dated plan files** (`2026-03-03-*.md`) are design documents, not executable plans. Skip them.
