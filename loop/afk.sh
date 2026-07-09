#!/usr/bin/env bash
set -euo pipefail

if [ -z "${1:-}" ] || [ -z "${2:-}" ]; then
  echo "Usage: $0 <iterations> <issues_path> [prompt_path]"
  echo "Example: $0 10 .scratch/task-manager/issues"
  echo "Env: AGENT=codex|pi  (default codex)"
  exit 1
fi

iterations="$1"
issues_path="$2"
prompt_path="${3:-loop/prompt.md}"
agent="${AGENT:-codex}"

case "$agent" in
  codex|pi) ;;
  *) echo "Unknown AGENT '$agent'; use codex or pi"; exit 1 ;;
esac

if ! command -v "$agent" >/dev/null 2>&1; then
  echo "$agent CLI not found on PATH"
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "This loop expects to run inside a git repository."
  exit 1
fi

if [ ! -d "$issues_path" ]; then
  echo "Issues path does not exist: $issues_path"
  exit 1
fi

if [ ! -f "$prompt_path" ]; then
  echo "Prompt file does not exist: $prompt_path"
  exit 1
fi

mkdir -p "$issues_path/done"

# Recover any leftover workspace state from the previous iteration
# (agent may have exited mid-task before committing). Stash rather than die,
# so one dirty iteration does not end the whole batch.
recover_workspace() {
  if [ -n "$(git status --short)" ]; then
    echo "Working tree dirty from previous iteration; stashing leftover."
    git status --short
    git stash push --include-untracked -m "loop-leftover-iter-$i" >/dev/null || {
      echo "stash failed iter $i; continuing with dirty tree"
    }
  fi
}

# Run one agent iteration. Prints final message to stdout (captured by caller).
run_agent() {
  local full_prompt="$1"
  case "$agent" in
    codex)
      local tmpfile
      tmpfile=$(mktemp)
      codex exec -c approval_policy=never \
        -c 'model_reasoning_effort="high"' \
        --output-last-message "$tmpfile" \
        "$full_prompt"
      local rc=$?
      cat "$tmpfile" 2>/dev/null || true
      rm -f "$tmpfile"
      return $rc
      ;;
    pi)
      # ponytail: -p prints final message to stdout directly; --approve trusts project files;
      # --no-session keeps it ephemeral (loop drives state via git, not session files).
      # Use PI_PROVIDER / PI_MODEL env vars to override provider and model.
      local pi_model_args=()
      [ -n "${PI_PROVIDER:-}" ] && pi_model_args+=(--provider "$PI_PROVIDER")
      [ -n "${PI_MODEL:-}" ] && pi_model_args+=(--model "$PI_MODEL")
      pi -p --approve --no-session \
        --thinking high \
        "${pi_model_args[@]}" \
        "$full_prompt"
      ;;
  esac
}

for ((i=1; i<=iterations; i++)); do
  recover_workspace

  commits=$(git log -n 5 --format="%H%n%ad%n%B---" --date=short 2>/dev/null || echo "No commits found")
  issues=$(
    find "$issues_path" -maxdepth 1 -type f -name "*.md" | sort | while IFS= read -r issue; do
      printf "\n--- ISSUE FILE: %s ---\n" "$issue"
      sed -n "1,260p" "$issue"
    done
  ) || issues=""
  if [ -z "$issues" ]; then
    issues="No issues found"
  fi
  prompt=$(cat "$prompt_path")
  before_head=$(git rev-parse HEAD 2>/dev/null || echo "NO_HEAD")

  full_prompt="Previous commits:
$commits

Issues directory: $issues_path
Issues:
$issues

$prompt"

  if ! result=$(run_agent "$full_prompt"); then
    echo "$agent failed in iteration $i; recovering workspace and continuing."
    recover_workspace
    continue
  fi

  if [[ "$result" == *"<promise>NO MORE TASKS</promise>"* ]]; then
    echo "Ralph complete after $i iterations."
    exit 0
  fi

  after_head=$(git rev-parse HEAD 2>/dev/null || echo "NO_HEAD")
  if [ "$before_head" = "$after_head" ]; then
    echo "Iteration $i finished without a new commit."
    echo "Stopping to avoid repeating the same task or mixing work."
    if [ -n "$(git status --short)" ]; then
      git status --short
    fi
    exit 1
  fi
done
