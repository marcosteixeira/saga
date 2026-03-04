#!/usr/bin/env bash
# check-agents.sh — Saga babysitter loop
# Runs as OpenClaw cron every 10 minutes.
# Responsibilities:
#   1. Check running agents (tmux sessions) and update active-tasks.json
#   2. Detect open PRs that need AI reviews → spawn 2 reviewers via OpenClaw
#   3. When ALL conditions met (CI green + 2 reviews done) → notify Marcos
#   4. Auto-respawn failed agents (max 3 attempts)
#
# Reviewers:
#   🔍 Codex  — logic, edge cases, security, type safety, Supabase RLS
#   🤖 Claude — code quality, conventions, maintainability, docs
#
# Usage: ./scripts/check-agents.sh
# Requirements: gh, python3, openclaw, tmux

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TASKS_FILE="$REPO_ROOT/.clawdbot/active-tasks.json"
REVIEWS_FILE="$REPO_ROOT/.clawdbot/reviews-state.json"
REPO="marcosteixeira/saga"
TELEGRAM_CHAT_ID="5298582239"

log() { echo "[check-agents] $*"; }

# ─── Atomic JSON write ────────────────────────────────────────────────────────
write_json() {
  local file=$1 content=$2
  local tmp="${file}.tmp.$$"
  echo "$content" > "$tmp"
  mv "$tmp" "$file"
}

# ─── Init state files if missing ─────────────────────────────────────────────
[[ -f "$TASKS_FILE" ]] || write_json "$TASKS_FILE" "[]"
[[ -f "$REVIEWS_FILE" ]] || write_json "$REVIEWS_FILE" "{}"

# ─── PART 1: Monitor running agents ──────────────────────────────────────────
monitor_agents() {
  local tasks
  tasks=$(cat "$TASKS_FILE")

  local updated
  updated=$(python3 << PYEOF
import json, subprocess, sys, time

tasks = json.loads('''$tasks''')
changed = False

for t in tasks:
    if t.get("status") != "running":
        continue

    session = t.get("tmuxSession", "")
    branch = t.get("branch", "")
    task_id = t.get("id", "")

    # Check if tmux session is alive
    alive = subprocess.run(
        ["tmux", "has-session", "-t", session],
        capture_output=True
    ).returncode == 0

    if not alive:
        # Check if PR exists for this branch
        pr_result = subprocess.run(
            ["gh", "pr", "list", "--repo", "$REPO",
             "--head", branch, "--json", "number,state", "--limit", "1"],
            capture_output=True, text=True
        )
        prs = json.loads(pr_result.stdout or "[]")

        if prs:
            pr_num = prs[0]["number"]
            t["status"] = "done"
            t["pr"] = pr_num
            t["completedAt"] = int(time.time() * 1000)
            print(f"[INFO] {task_id}: session dead, PR #{pr_num} found → done", file=sys.stderr)
        else:
            attempts = t.get("attempts", 0)
            if attempts < 3:
                t["status"] = "pending"
                t["attempts"] = attempts + 1
                print(f"[WARN] {task_id}: session dead, no PR, respawning (attempt {attempts+1})", file=sys.stderr)
            else:
                t["status"] = "failed"
                print(f"[ERROR] {task_id}: max retries reached → failed", file=sys.stderr)
        changed = True

print(json.dumps(tasks))
PYEOF
)

  write_json "$TASKS_FILE" "$updated"
}

# ─── PART 2: Auto-respawn pending tasks ──────────────────────────────────────
respawn_pending() {
  local tasks
  tasks=$(cat "$TASKS_FILE")

  python3 << PYEOF
import json, subprocess, sys

tasks = json.loads('''$tasks''')

for t in tasks:
    if t.get("status") != "pending":
        continue

    task_id = t["id"]
    agent = t.get("agent", "claude")
    description = t.get("description", task_id)
    worktree = t.get("worktree", "")

    print(f"[RESPAWN] {task_id} (agent={agent})", file=sys.stderr)
    subprocess.Popen([
        "$REPO_ROOT/scripts/spawn-agent.sh",
        task_id, description, agent
    ])
PYEOF
}

# ─── PART 3: AI Reviews — detect PRs needing review ──────────────────────────
run_ai_reviews() {
  local reviews_state
  reviews_state=$(cat "$REVIEWS_FILE")

  # Get all open, non-draft PRs
  local open_prs
  open_prs=$(gh pr list --repo "$REPO" \
    --json number,title,headRefName,isDraft,state \
    --jq '[.[] | select(.state=="OPEN" and .isDraft==false)]' 2>/dev/null || echo "[]")

  if [[ "$open_prs" == "[]" ]]; then
    return 0
  fi

  python3 << PYEOF
import json, subprocess, sys, os

open_prs = json.loads('''$open_prs''')
reviews_state = json.loads('''$reviews_state''')
changed = False

for pr in open_prs:
    pr_num = str(pr["number"])
    pr_title = pr["title"]
    branch = pr["headRefName"]

    pr_state = reviews_state.get(pr_num, {})
    reviewers_done = pr_state.get("reviewers_done", [])

    # Determine which reviewers still need to run
    all_reviewers = ["codex", "claude"]
    pending_reviewers = [r for r in all_reviewers if r not in reviewers_done]

    if not pending_reviewers:
        continue

    print(f"[REVIEW] PR #{pr_num} ({pr_title}): spawning reviewers {pending_reviewers}", file=sys.stderr)

    # Get PR diff
    diff_result = subprocess.run(
        ["gh", "pr", "diff", str(pr["number"]), "--repo", "$REPO"],
        capture_output=True, text=True
    )
    diff = diff_result.stdout[:8000] if diff_result.stdout else "(no diff)"

    # Spawn each pending reviewer as a background openclaw sub-agent
    for reviewer in pending_reviewers:
        if reviewer == "codex":
            focus = """Focus on: logic errors, edge cases, missing error handling, race conditions (especially Supabase realtime), TypeScript type safety, missing tests, security vulnerabilities (XSS, injection, exposed secrets, insecure API routes), Supabase RLS policy gaps, environment variables exposed on client side, N+1 queries, unbounded loops.

Format your response as:
## 🔍 Codex Review

### Critical Issues (block merge)
[list or "None"]

### Security & Safety
[list or "None"]

### Warnings (should fix)
[list or "None"]

### Suggestions (optional)
[list or "None"]

Be precise. Low false positive rate is important."""
        else:  # claude
            focus = """Focus on: code organization, maintainability, missing docs for complex logic, adherence to project conventions (App Router only, AI calls server-side only, Conventional Commits).

Format your response as:
## 🤖 Claude Review

### Critical Issues (block merge)
[list or "None"]

### Code Quality
[list or "None"]

Only mark Critical if highly confident. Avoid overengineering suggestions."""

        prompt = f"""You are reviewing PR #{pr["number"]} for the Saga project (AI tabletop RPG — Next.js 16 + TypeScript + Supabase).

PR Title: {pr_title}
Branch: {branch}

DIFF:
{diff}

{focus}

After writing your review, post it as a comment on the PR using:
gh pr comment {pr["number"]} --repo $REPO --body "$(your review text here)"

Then run:
openclaw system event --text "review-done:{reviewer}:PR#{pr_num}" --mode now
"""

        # Write prompt to temp file and spawn background claude
        prompt_file = f"/tmp/saga-review-{pr_num}-{reviewer}.txt"
        with open(prompt_file, "w") as f:
            f.write(prompt)

        model = "claude-sonnet-4.6" if reviewer == "claude" else "gpt-5.1-codex"

        subprocess.Popen([
            "claude", "--dangerously-skip-permissions", "--print",
            "--model", model,
            open(prompt_file).read()
        ], stdout=open(f"/tmp/saga-review-{pr_num}-{reviewer}.log", "w"),
           stderr=subprocess.STDOUT)

    # Mark as in-progress
    if pr_num not in reviews_state:
        reviews_state[pr_num] = {}
    reviews_state[pr_num]["title"] = pr_title
    reviews_state[pr_num]["spawned"] = ["codex", "claude"]
    changed = True

if changed:
    with open("$REVIEWS_FILE", "w") as f:
        json.dump(reviews_state, f, indent=2)
PYEOF
}

# ─── PART 4: Check reviews completion & update state ─────────────────────────
check_review_completions() {
  local reviews_state
  reviews_state=$(cat "$REVIEWS_FILE")

  python3 << PYEOF
import json, subprocess

reviews_state = json.loads('''$reviews_state''')
changed = False

for pr_num, pr_state in reviews_state.items():
    if pr_state.get("notified"):
        continue

    spawned = pr_state.get("spawned", [])
    reviewers_done = pr_state.get("reviewers_done", [])

    # Check PR comments to detect completed reviews
    comments_result = subprocess.run(
        ["gh", "pr", "view", pr_num, "--repo", "$REPO",
         "--json", "comments", "--jq", "[.comments[].body]"],
        capture_output=True, text=True
    )
    comment_bodies = json.loads(comments_result.stdout or "[]")
    comment_text = " ".join(comment_bodies)

    newly_done = []
    if "🔍 Codex Review" in comment_text and "codex" not in reviewers_done:
        newly_done.append("codex")
    if "🤖 Claude Review" in comment_text and "claude" not in reviewers_done:
        newly_done.append("claude")

    if newly_done:
        reviewers_done = list(set(reviewers_done + newly_done))
        reviews_state[pr_num]["reviewers_done"] = reviewers_done
        changed = True

if changed:
    with open("$REVIEWS_FILE", "w") as f:
        json.dump(reviews_state, f, indent=2)
PYEOF
}

# ─── PART 5: Notify when ALL conditions met ───────────────────────────────────
check_and_notify() {
  local reviews_state
  reviews_state=$(cat "$REVIEWS_FILE")

  local open_prs
  open_prs=$(gh pr list --repo "$REPO" \
    --json number,title,isDraft,state \
    --jq '[.[] | select(.state=="OPEN" and .isDraft==false)]' 2>/dev/null || echo "[]")

  python3 << PYEOF
import json, subprocess, sys

open_prs = json.loads('''$open_prs''')
reviews_state = json.loads('''$reviews_state''')
changed = False

for pr in open_prs:
    pr_num = str(pr["number"])
    pr_title = pr["title"]

    pr_state = reviews_state.get(pr_num, {})

    # Skip if already notified
    if pr_state.get("notified"):
        continue

    reviewers_done = pr_state.get("reviewers_done", [])

    # Condition 1: all 2 reviews done
    if not all(r in reviewers_done for r in ["codex", "claude"]):
        continue

    # Condition 2: CI checks passing
    checks_result = subprocess.run(
        ["gh", "pr", "checks", pr["number"], "--repo", "$REPO",
         "--json", "name,state"],
        capture_output=True, text=True
    )
    checks = json.loads(checks_result.stdout or "[]")

    if not checks:
        continue

    all_green = all(
        c.get("state") in ("SUCCESS", "NEUTRAL", "SKIPPED")
        for c in checks
    )

    if not all_green:
        failing = [c["name"] for c in checks if c.get("state") not in ("SUCCESS", "NEUTRAL", "SKIPPED")]
        print(f"[INFO] PR #{pr_num}: CI not yet green, failing: {failing}", file=sys.stderr)
        continue

    # ALL conditions met — notify via OpenClaw
    print(f"[NOTIFY] PR #{pr_num} ready for review!", file=sys.stderr)

    pr_url = f"https://github.com/$REPO/pull/{pr['number']}"
    msg = (
        f"🎮 Saga PR #{pr['number']} pronto para review\n\n"
        f"*{pr_title}*\n\n"
        f"✅ CI passou\n"
        f"✅ Codex review feito\n"
        f"✅ Claude review feito\n\n"
        f"{pr_url}"
    )

    subprocess.run([
        "openclaw", "system", "event",
        "--text", msg,
        "--mode", "now"
    ])

    reviews_state[pr_num]["notified"] = True
    changed = True

if changed:
    with open("$REVIEWS_FILE", "w") as f:
        json.dump(reviews_state, f, indent=2)
PYEOF
}

# ─── MAIN ─────────────────────────────────────────────────────────────────────
main() {
  cd "$REPO_ROOT"

  log "Starting check cycle..."

  monitor_agents
  respawn_pending
  run_ai_reviews
  check_review_completions
  check_and_notify

  log "Check cycle complete."
}

main
