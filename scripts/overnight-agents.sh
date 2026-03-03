#!/opt/homebrew/bin/bash
set -euo pipefail

###############################################################################
# Saga — Overnight Agent Orchestrator
#
# Runs Claude CLI agents to implement plans. Each plan gets its own feature
# branch and PR targeting its dependency's branch (nothing goes to main).
#
# Resilience features:
#   - Auto-resume: detects plans that already have a branch + PR and skips them
#   - Per-agent timeout: kills stuck agents after N minutes
#   - Retry: failed plans get retried once before giving up
#   - Independent chains: if plan 09 fails, plans 05→06 still run
#   - nohup-safe: run with nohup to survive terminal close
#   - PID file: check status while it's running
#
# Usage:
#   ./scripts/overnight-agents.sh [OPTIONS]
#   nohup ./scripts/overnight-agents.sh >> logs/overnight.log 2>&1 &
#
# Requirements:
#   - claude CLI authenticated
#   - gh CLI authenticated
#   - git configured with push access
###############################################################################

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLANS_DIR="$REPO_ROOT/docs/plans"
LOG_DIR="$REPO_ROOT/logs/overnight-$(date +%Y%m%d-%H%M%S)"
HITL_FILE="$LOG_DIR/HITL-REVIEW.md"
STATUS_FILE="$LOG_DIR/status.json"
PID_FILE="$REPO_ROOT/logs/overnight.pid"
DRY_RUN=false
START_FROM=5
STOP_AT=15
AGENT_TIMEOUT_MIN=30  # kill agent after this many minutes
MAX_RETRIES=1         # retry a failed plan this many times

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)       DRY_RUN=true; shift ;;
    --start-from)    START_FROM=$2; shift 2 ;;
    --stop-at)       STOP_AT=$2; shift 2 ;;
    --timeout)       AGENT_TIMEOUT_MIN=$2; shift 2 ;;
    --retries)       MAX_RETRIES=$2; shift 2 ;;
    -h|--help)
      cat << 'EOF'
Usage: ./scripts/overnight-agents.sh [OPTIONS]

Options:
  --dry-run          Simulate without running agents
  --start-from NN    Start from plan NN (default: 5)
  --stop-at NN       Stop after plan NN (default: 15)
  --timeout MINS     Kill a stuck agent after MINS minutes (default: 30)
  --retries N        Retry failed plans N times (default: 1)
  -h, --help         Show this help

Examples:
  ./scripts/overnight-agents.sh                        # Run plans 5-15
  ./scripts/overnight-agents.sh --start-from 7         # Run plans 7-15
  ./scripts/overnight-agents.sh --timeout 45           # 45min per agent
  nohup ./scripts/overnight-agents.sh &                # Survive terminal close

Resume after crash:
  ./scripts/overnight-agents.sh                        # Auto-detects completed plans
EOF
      exit 0
      ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

mkdir -p "$LOG_DIR"

# Write PID file so you can check on us
echo $$ > "$PID_FILE"
trap 'rm -f "$PID_FILE"' EXIT

###############################################################################
# Dependency graph (plan number -> parent plan number)
#
# Plans 01-04 are already merged into main.
# Plans 05 and 07 branch from main (their deps are already in main).
# All subsequent plans branch from their direct dependency.
###############################################################################
declare -A DEPS
# DEPS[5] is unset — branches from main (04 already merged)
DEPS[6]="5"
# DEPS[7] is unset — branches from main (04 already merged)
DEPS[8]="7"
DEPS[9]="8"
DEPS[10]="9"
DEPS[11]="10"
DEPS[12]="9"
DEPS[13]="12"
DEPS[14]="12"
DEPS[15]="14"

###############################################################################
# Plan metadata
###############################################################################
declare -A PLAN_FILES
PLAN_FILES[5]="05-ai-world-generation.md"
PLAN_FILES[6]="06-image-generation.md"
PLAN_FILES[7]="07-lobby-player-joining.md"
PLAN_FILES[8]="08-lobby-realtime-portraits.md"
PLAN_FILES[9]="09-game-room-static-ui.md"
PLAN_FILES[10]="10-ai-narration-streaming.md"
PLAN_FILES[11]="11-memory-system.md"
PLAN_FILES[12]="12-player-actions-free-mode.md"
PLAN_FILES[13]="13-session-management.md"
PLAN_FILES[14]="14-combat-sequential-mode.md"
PLAN_FILES[15]="15-polish-deploy.md"

declare -A BRANCHES
BRANCHES[5]="feat/05-ai-world-generation"
BRANCHES[6]="feat/06-image-generation"
BRANCHES[7]="feat/07-lobby-player-joining"
BRANCHES[8]="feat/08-lobby-realtime-portraits"
BRANCHES[9]="feat/09-game-room-static-ui"
BRANCHES[10]="feat/10-ai-narration-streaming"
BRANCHES[11]="feat/11-memory-system"
BRANCHES[12]="feat/12-player-actions-free-mode"
BRANCHES[13]="feat/13-session-management"
BRANCHES[14]="feat/14-combat-sequential-mode"
BRANCHES[15]="feat/15-polish-deploy"

###############################################################################
# Execution order — interleaved so independent chains both get a shot
#
# Two chains fork from main:
#   Chain A: 05 → 06
#   Chain B: 07 → 08 → 09 → (10 → 11) + (12 → 13) + (12 → 14 → 15)
###############################################################################
EXEC_ORDER=(5 7 6 8 9 10 12 11 13 14 15)

get_parent_branch() {
  local plan=$1
  local dep="${DEPS[$plan]:-}"
  if [[ -n "$dep" ]]; then
    echo "${BRANCHES[$dep]}"
  else
    echo "main"
  fi
}

###############################################################################
# Status tracking
###############################################################################
declare -A PLAN_STATUS
declare -A PLAN_RETRIES

update_status() {
  local plan=$1 status=$2
  PLAN_STATUS[$plan]="$status"
  # Write status JSON (atomic via tmp + mv)
  local tmp="$STATUS_FILE.tmp.$$"
  local json="{"
  local first=true
  for n in $(echo "${!PLAN_STATUS[@]}" | tr ' ' '\n' | sort -n); do
    $first || json+=","
    json+="\"plan_${n}\": \"${PLAN_STATUS[$n]}\""
    first=false
  done
  json+="}"
  echo "$json" > "$tmp"
  mv "$tmp" "$STATUS_FILE"
}

init_hitl_file() {
  cat > "$HITL_FILE" << 'EOF'
# Overnight Agent Run — HITL Review

> Plans that need human attention are listed below.
> Review each section and take the recommended action.

---

EOF
}

add_hitl_entry() {
  local plan=$1 reason=$2 log_file=$3
  local parent_branch
  parent_branch=$(get_parent_branch "$plan")
  cat >> "$HITL_FILE" << EOF

## Plan ${plan}: ${PLAN_FILES[$plan]%.md}

**Status:** NEEDS REVIEW
**Reason:** ${reason}
**Branch:** \`${BRANCHES[$plan]}\` → \`${parent_branch}\`
**Full log:** \`${log_file}\`

**Suggested next steps:**
1. \`git checkout ${BRANCHES[$plan]}\`
2. Review the log and [HITL] commits
3. Fix issues and push
4. If the PR exists, it's ready for review once fixed

---

EOF
}

###############################################################################
# Auto-resume: detect plans that already have a branch + PR on GitHub
###############################################################################
detect_completed_plans() {
  echo "Checking for already-completed plans..."
  cd "$REPO_ROOT"
  git fetch origin --prune 2>/dev/null || true

  for n in "${EXEC_ORDER[@]}"; do
    [[ $n -lt $START_FROM || $n -gt $STOP_AT ]] && continue

    local branch="${BRANCHES[$n]}"

    # Check if branch exists on remote
    if git rev-parse "origin/$branch" &>/dev/null; then
      # Check if a PR exists for this branch
      local pr_state
      pr_state=$(gh pr view "$branch" --json state --jq '.state' 2>/dev/null || echo "NONE")

      if [[ "$pr_state" == "OPEN" || "$pr_state" == "MERGED" ]]; then
        echo "  Plan $n: branch + PR exist ($pr_state) — skipping"
        update_status "$n" "done"
      else
        echo "  Plan $n: branch exists but no PR — will re-run"
        update_status "$n" "pending"
      fi
    else
      update_status "$n" "pending"
    fi

    PLAN_RETRIES[$n]=0
  done
  echo ""
}

###############################################################################
# Check if a plan's dependency chain is satisfied
###############################################################################
dep_is_satisfied() {
  local plan=$1
  local dep="${DEPS[$plan]:-}"
  [[ -z "$dep" ]] && return 0

  local dep_status="${PLAN_STATUS[$dep]:-done}"
  # "done" or "hitl" means the branch exists and downstream can build on it
  [[ "$dep_status" == "done" || "$dep_status" == "hitl" ]]
}

dep_has_failed() {
  local plan=$1
  local dep="${DEPS[$plan]:-}"
  [[ -z "$dep" ]] && return 1

  local dep_status="${PLAN_STATUS[$dep]:-done}"
  [[ "$dep_status" == "failed" ]]
}

###############################################################################
# Run a single plan agent with timeout
###############################################################################
run_plan_agent() {
  local plan_num=$1
  local branch="${BRANCHES[$plan_num]}"
  local parent_branch
  parent_branch=$(get_parent_branch "$plan_num")
  local log_file="$LOG_DIR/plan-${plan_num}.log"
  local retry_num="${PLAN_RETRIES[$plan_num]:-0}"

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo " Plan $plan_num: ${PLAN_FILES[$plan_num]%.md}"
  echo " Branch: $branch → $parent_branch"
  echo " Attempt: $((retry_num + 1)) / $((MAX_RETRIES + 1))"
  echo " Timeout: ${AGENT_TIMEOUT_MIN} minutes"
  echo " Started: $(date)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if $DRY_RUN; then
    echo "[DRY RUN] Would create branch '$branch' from '$parent_branch' and run claude"
    update_status "$plan_num" "done"
    return 0
  fi

  # --- Checkout the feature branch from the parent ---
  (
    cd "$REPO_ROOT"
    git fetch origin 2>/dev/null || true

    local start_ref
    if git rev-parse "origin/$parent_branch" &>/dev/null; then
      start_ref="origin/$parent_branch"
    elif git rev-parse "$parent_branch" &>/dev/null; then
      start_ref="$parent_branch"
    else
      echo "ERROR: Parent branch '$parent_branch' not found!"
      return 1
    fi

    git checkout -B "$branch" "$start_ref"
  ) >> "$log_file" 2>&1

  # --- Build the prompt ---
  local prompt
  prompt=$(cat << PROMPT_EOF
You are implementing plan ${plan_num} for the Saga project.

You are on branch "${branch}" which was created from "${parent_branch}".

FIRST: Read the plan file carefully:
  cat docs/plans/${PLAN_FILES[$plan_num]}

ALSO reference these files as needed:
- docs/plans/2026-03-03-steampunk-design-system.md (design system)
- DESIGN.md (architecture decisions)

WORKFLOW — implement each task in the plan, in order:
1. Read the task specification
2. Write the code (and tests if specified in the plan)
3. Run tests: yarn test
4. If tests fail, try to fix (up to 3 attempts per task)
5. Commit with the message specified in the plan
6. Move to the next task

IF STUCK on a task after 3 fix attempts:
- Commit what you have with a "[HITL]" prefix in the commit message
- Move to the next task

AFTER ALL TASKS are complete:
1. Run: yarn build (fix any build errors)
2. Run: yarn test (ensure all pass)
3. Push: git push -u origin ${branch}
4. Create PR:
   gh pr create \\
     --base ${parent_branch} \\
     --title "feat: ${PLAN_FILES[$plan_num]%.md}" \\
     --body "\$(cat <<'PRBODY'
## Plan ${plan_num}: ${PLAN_FILES[$plan_num]%.md}

Automated implementation. See \`docs/plans/${PLAN_FILES[$plan_num]}\` for spec.

**PR chain:** \`${parent_branch}\` ← \`${branch}\`
PRBODY
)"

IF you hit an unrecoverable blocker:
- Commit all progress with "[HITL]" prefix
- Push and create the PR as draft: gh pr create --draft ...

Do NOT ask questions. Work autonomously.
PROMPT_EOF
  )

  # --- Run Claude CLI with timeout ---
  update_status "$plan_num" "running"
  local timeout_secs=$(( AGENT_TIMEOUT_MIN * 60 ))
  local agent_pid
  local exit_code

  (
    cd "$REPO_ROOT"
    claude --print --dangerously-skip-permissions \
      -p "$prompt"
  ) >> "$log_file" 2>&1 &
  agent_pid=$!

  # Wait with timeout
  local waited=0
  while kill -0 "$agent_pid" 2>/dev/null; do
    if [[ $waited -ge $timeout_secs ]]; then
      echo "  TIMEOUT after ${AGENT_TIMEOUT_MIN} minutes — killing agent"
      kill "$agent_pid" 2>/dev/null || true
      sleep 2
      kill -9 "$agent_pid" 2>/dev/null || true
      wait "$agent_pid" 2>/dev/null || true

      # Even on timeout, try to push whatever progress was made
      (
        cd "$REPO_ROOT"
        if [[ -n "$(git status --porcelain)" ]]; then
          git add -A && git commit -m "[HITL] plan $plan_num: partial progress (agent timed out)" || true
        fi
        git push -u origin "$branch" 2>/dev/null || true
        gh pr create --draft \
          --base "$parent_branch" \
          --title "feat: ${PLAN_FILES[$plan_num]%.md} [HITL - timed out]" \
          --body "Agent timed out after ${AGENT_TIMEOUT_MIN}min. Partial progress pushed. Needs human completion." \
          2>/dev/null || true
      ) >> "$log_file" 2>&1

      update_status "$plan_num" "hitl"
      add_hitl_entry "$plan_num" "Agent timed out after ${AGENT_TIMEOUT_MIN} minutes" "$log_file"
      return 0
    fi
    sleep 10
    ((waited += 10)) || true
  done

  wait "$agent_pid" 2>/dev/null
  exit_code=$?

  # --- Evaluate result ---
  if [[ $exit_code -eq 0 ]]; then
    local hitl_commits
    hitl_commits=$(cd "$REPO_ROOT" && git log --oneline "$(get_parent_branch "$plan_num")..HEAD" 2>/dev/null | grep -c "\[HITL\]" || true)

    if [[ $hitl_commits -gt 0 ]]; then
      echo "  → Completed with $hitl_commits HITL commit(s) — needs review"
      update_status "$plan_num" "hitl"
      add_hitl_entry "$plan_num" "$hitl_commits task(s) need human intervention" "$log_file"
    else
      echo "  → SUCCESS"
      update_status "$plan_num" "done"
    fi
  else
    echo "  → FAILED (exit code: $exit_code)"

    # Retry logic
    if [[ $retry_num -lt $MAX_RETRIES ]]; then
      echo "  → Will retry (attempt $((retry_num + 2)) of $((MAX_RETRIES + 1)))"
      PLAN_RETRIES[$plan_num]=$((retry_num + 1))
      update_status "$plan_num" "pending"
    else
      update_status "$plan_num" "failed"
      add_hitl_entry "$plan_num" "Agent failed after $((MAX_RETRIES + 1)) attempt(s) (exit code: $exit_code)" "$log_file"

      # Try to salvage: push any progress
      (
        cd "$REPO_ROOT"
        if git rev-parse "$branch" &>/dev/null; then
          if [[ -n "$(git status --porcelain)" ]]; then
            git add -A && git commit -m "[HITL] plan $plan_num: partial progress (agent crashed)" || true
          fi
          git push -u origin "$branch" 2>/dev/null || true
          gh pr create --draft \
            --base "$parent_branch" \
            --title "feat: ${PLAN_FILES[$plan_num]%.md} [HITL - failed]" \
            --body "Agent failed. Partial progress pushed. Needs human completion." \
            2>/dev/null || true
        fi
      ) >> "$log_file" 2>&1
    fi
  fi

  echo "  Finished: $(date)"
  return 0
}

###############################################################################
# Main
###############################################################################
main() {
  cat << BANNER
==============================================
 Saga Overnight Agent Orchestrator
 Started:  $(date)
 Plans:    ${START_FROM} → ${STOP_AT}
 Timeout:  ${AGENT_TIMEOUT_MIN} min/agent
 Retries:  ${MAX_RETRIES}
 PID:      $$
 Logs:     ${LOG_DIR}
==============================================

 PR chain (each PR targets its parent's branch):

   main
    ├─ 05-ai-world-generation
    │   └─ 06-image-generation
    └─ 07-lobby-player-joining
        └─ 08-lobby-realtime-portraits
            └─ 09-game-room-static-ui
                ├─ 10-ai-narration-streaming
                │   └─ 11-memory-system
                └─ 12-player-actions-free-mode
                    ├─ 13-session-management
                    └─ 14-combat-sequential-mode
                        └─ 15-polish-deploy

 Execution order (interleaved chains):
   ${EXEC_ORDER[*]}

BANNER

  echo '{}' > "$STATUS_FILE"
  init_hitl_file

  # --- Auto-resume: detect already-completed plans ---
  detect_completed_plans

  # --- Pre-flight: verify parent branches exist ---
  echo "Pre-flight checks..."
  for n in "${EXEC_ORDER[@]}"; do
    [[ $n -lt $START_FROM || $n -gt $STOP_AT ]] && continue
    [[ "${PLAN_STATUS[$n]:-}" == "done" ]] && continue

    local parent
    parent=$(get_parent_branch "$n")
    if (cd "$REPO_ROOT" && git rev-parse "origin/$parent" &>/dev/null) || \
       (cd "$REPO_ROOT" && git rev-parse "$parent" &>/dev/null); then
      echo "  Plan $n: base=$parent ✓"
    else
      local dep="${DEPS[$n]:-}"
      if [[ -n "$dep" ]] && [[ $dep -ge $START_FROM ]]; then
        echo "  Plan $n: base=$parent (will be created by plan $dep)"
      else
        echo "  Plan $n: base=$parent ✗ NOT FOUND"
        echo ""
        echo "ERROR: Parent branch '$parent' does not exist."
        exit 1
      fi
    fi
  done
  echo ""

  # --- Execute plans in dependency-aware order ---
  # Loop repeatedly until all plans are done/failed/hitl (handles retries)
  local max_loops=$(( (STOP_AT - START_FROM + 1) * (MAX_RETRIES + 2) ))
  local loop_count=0
  local made_progress=true

  while $made_progress && [[ $loop_count -lt $max_loops ]]; do
    made_progress=false
    ((loop_count++)) || true

    for n in "${EXEC_ORDER[@]}"; do
      [[ $n -lt $START_FROM || $n -gt $STOP_AT ]] && continue

      local status="${PLAN_STATUS[$n]:-pending}"

      # Skip completed/failed/hitl/running/skipped plans
      [[ "$status" != "pending" ]] && continue

      # Skip if dependency failed (no branch to build on)
      if dep_has_failed "$n"; then
        echo ""
        echo "Skipping plan $n — dependency plan ${DEPS[$n]} failed"
        update_status "$n" "skipped"
        made_progress=true
        continue
      fi

      # Skip if dependency not yet satisfied
      if ! dep_is_satisfied "$n"; then
        continue
      fi

      # Run this plan
      run_plan_agent "$n"
      made_progress=true
    done
  done

  # --- Final summary ---
  echo ""
  echo "=============================================="
  echo " Overnight Run Complete: $(date)"
  echo "=============================================="
  echo ""

  local done_count=0 hitl_count=0 failed_count=0 skipped_count=0
  for n in "${EXEC_ORDER[@]}"; do
    [[ $n -lt $START_FROM || $n -gt $STOP_AT ]] && continue
    local s="${PLAN_STATUS[$n]:-pending}"
    local parent
    parent=$(get_parent_branch "$n")
    printf "  Plan %2d: %-35s → %-35s [%s]\n" "$n" "${BRANCHES[$n]}" "$parent" "$s"
    case $s in
      done)    ((done_count++)) || true ;;
      hitl)    ((hitl_count++)) || true ;;
      failed)  ((failed_count++)) || true ;;
      *)       ((skipped_count++)) || true ;;
    esac
  done

  echo ""
  echo "  Done: $done_count | HITL: $hitl_count | Failed: $failed_count | Skipped: $skipped_count"
  echo ""
  if [[ $((hitl_count + failed_count)) -gt 0 ]]; then
    echo "  Review: $HITL_FILE"
  fi
  echo "  Logs:   $LOG_DIR/"
  echo "  Status: $STATUS_FILE"
  echo ""

  rm -f "$PID_FILE"
  if [[ $((hitl_count + failed_count)) -gt 0 ]]; then
    exit 1
  fi
  exit 0
}

main
