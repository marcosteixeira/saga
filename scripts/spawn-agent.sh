#!/usr/bin/env bash
# spawn-agent.sh — Create a git worktree and launch an AI agent in a tmux session
#
# Usage:
#   ./scripts/spawn-agent.sh <TASK_ID> <DESCRIPTION> <AGENT> [--prompt "..."]
#
# Args:
#   TASK_ID     — Unique task identifier (e.g. "fix-123-login-bug")
#   DESCRIPTION — Short human-readable description
#   AGENT       — "claude" or "codex"
#   --prompt    — Optional custom prompt to send to agent

set -euo pipefail

TASK_ID="${1:?TASK_ID required}"
DESCRIPTION="${2:?DESCRIPTION required}"
AGENT="${3:?AGENT required (claude|codex)}"

CUSTOM_PROMPT=""
shift 3 || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --prompt)
      CUSTOM_PROMPT="${2:?--prompt requires a value}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKTREES_DIR="$REPO_ROOT/.worktrees"
WORKTREE_PATH="$WORKTREES_DIR/$TASK_ID"
BRANCH_NAME="feat/$TASK_ID"
TASKS_FILE="$REPO_ROOT/.clawdbot/active-tasks.json"

echo "🚀 Spawning agent for task: $TASK_ID"
echo "   Description: $DESCRIPTION"
echo "   Agent: $AGENT"
echo "   Worktree: $WORKTREE_PATH"

# --- 1. Create git worktree ---
mkdir -p "$WORKTREES_DIR"

if [ -d "$WORKTREE_PATH" ]; then
  echo "⚠️  Worktree already exists at $WORKTREE_PATH — reusing"
else
  echo "🌿 Creating worktree on branch $BRANCH_NAME from origin/main..."
  cd "$REPO_ROOT"
  git fetch origin main --quiet
  git worktree add -b "$BRANCH_NAME" "$WORKTREE_PATH" origin/main
fi

# --- 2. Install dependencies ---
echo "📦 Installing dependencies in worktree..."
cd "$WORKTREE_PATH"
yarn install --frozen-lockfile --silent

# --- 3. Register task in active-tasks.json ---
echo "📝 Registering task in $TASKS_FILE..."
python3 - << PYEOF
import json, sys
from pathlib import Path

tasks_file = Path("$TASKS_FILE")
try:
    tasks = json.loads(tasks_file.read_text())
except (FileNotFoundError, json.JSONDecodeError):
    tasks = []

# Remove existing entry for this task if any
tasks = [t for t in tasks if t.get("id") != "$TASK_ID"]

tasks.append({
    "id": "$TASK_ID",
    "description": "$DESCRIPTION",
    "agent": "$AGENT",
    "branch": "$BRANCH_NAME",
    "worktree": "$WORKTREE_PATH",
    "status": "running",
    "attempts": 1,
    "pr_number": None
})

# Atomic write
import tempfile, os
tmp = tasks_file.parent / (".tmp_" + tasks_file.name)
tmp.write_text(json.dumps(tasks, indent=2) + "\n")
os.replace(tmp, tasks_file)
print("Task registered.")
PYEOF

# --- 4. Build agent command ---
DEFAULT_PROMPT="You are working on the Saga project (AI tabletop RPG - Next.js 16 + TypeScript + Supabase).

Task: $TASK_ID
Description: $DESCRIPTION
Branch: $BRANCH_NAME
Worktree: $WORKTREE_PATH

An approved implementation plan exists in docs/plans/ for this task.

## Workflow

1. Read the plan in docs/plans/ that corresponds to this task.
2. Use superpowers:executing-plans to implement the plan task-by-task.
   Skill file: ~/.codex/superpowers/skills/executing-plans/SKILL.md
3. Execute in batches of 3 tasks. Run verifications as specified in the plan.
4. Stop immediately if blocked — never guess.
5. Follow project conventions from CLAUDE.md (App Router only, AI calls server-side, Conventional Commits).
6. When all tasks complete, use superpowers:finishing-a-development-branch.

## When done:
git push -u origin $BRANCH_NAME
gh pr create --fill
openclaw system event --text \"Done: $TASK_ID PR created\" --mode now"

PROMPT="${CUSTOM_PROMPT:-$DEFAULT_PROMPT}"

if [ "$AGENT" = "claude" ]; then
  AGENT_CMD="claude --dangerously-skip-permissions"
elif [ "$AGENT" = "codex" ]; then
  AGENT_CMD="codex"
else
  echo "Unknown agent: $AGENT (must be claude or codex)" >&2
  exit 1
fi

FULL_CMD="cd $WORKTREE_PATH && $AGENT_CMD <<'AGENTEOF'
$PROMPT
AGENTEOF
git push -u origin $BRANCH_NAME && \
gh pr create --fill && \
openclaw system event --text \"Done: $TASK_ID PR created\" --mode now"

# --- 5. Launch in tmux session ---
echo "🖥️  Creating tmux session: $TASK_ID"

if tmux has-session -t "$TASK_ID" 2>/dev/null; then
  echo "⚠️  tmux session $TASK_ID already exists — killing and recreating"
  tmux kill-session -t "$TASK_ID"
fi

tmux new-session -d -s "$TASK_ID" -x 220 -y 50
tmux send-keys -t "$TASK_ID" "$FULL_CMD" Enter

echo "✅ Agent spawned!"
echo "   Task ID:  $TASK_ID"
echo "   tmux:     tmux attach -t $TASK_ID"
echo "   Worktree: $WORKTREE_PATH"
echo "   Branch:   $BRANCH_NAME"
