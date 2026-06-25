#!/usr/bin/env bash
set -euo pipefail

if [ -z "${1:-}" ] || [ -z "${2:-}" ]; then
  echo "Usage: $0 <iterations> <issues_path> [prompt_path]"
  echo "Example: $0 10 .scratch/task-manager/issues"
  exit 1
fi

iterations="$1"
issues_path="$2"
prompt_path="${3:-loop/prompt.md}"

if ! command -v codex >/dev/null 2>&1; then
  echo "codex CLI not found on PATH"
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

for ((i=1; i<=iterations; i++)); do
  if [ -n "$(git status --short)" ]; then
    echo "Working tree is not clean. Commit or stash changes before continuing."
    git status --short
    exit 1
  fi

  tmpfile=$(mktemp)

  commits=$(git log -n 5 --format="%H%n%ad%n%B---" --date=short 2>/dev/null || echo "No commits found")
  issues=$(
    find "$issues_path" -maxdepth 1 -type f -name "*.md" | sort | while IFS= read -r issue; do
      printf "\n--- ISSUE FILE: %s ---\n" "$issue"
      sed -n "1,260p" "$issue"
    done
  )
  if [ -z "$issues" ]; then
    issues="No issues found"
  fi
  prompt=$(cat "$prompt_path")
  before_head=$(git rev-parse HEAD 2>/dev/null || echo "NO_HEAD")

  if ! codex exec -c approval_policy=never \
    -c 'model_reasoning_effort="high"' \
    --output-last-message "$tmpfile" \
    "Previous commits:
$commits

Issues directory: $issues_path
Issues:
$issues

$prompt"; then
    rm -f "$tmpfile"
    exit 1
  fi

  result=$(cat "$tmpfile")
  rm -f "$tmpfile"

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
