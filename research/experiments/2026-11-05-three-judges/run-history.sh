#!/usr/bin/env bash
# Runs one model's history pass through headless Claude Code sessions, one per
# fighter: builds history-in-<fighter>.json from every judged week
# (history-input.mjs, which refuses while a week is not judged), then runs the
# prompt h1 on it with only Read and Write, and tries once more when the
# answer is not valid JSON. A fighter with an answer file is skipped. Progress
# goes to data/<model>/history.log. On the maintainer's Claude plan: no outside
# spend. (The first history pass, 2026-11-05, ran the same prompt as Claude
# Code subagents; this runner does it headless, like the readers and judges.)
#
# Usage: research/experiments/2026-11-05-three-judges/run-history.sh <model>
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
model="$1"
case "$model" in
  opus) cli_model="opus" ;;
  sonnet) cli_model="sonnet" ;;
  fable) cli_model="claude-fable-5-1" ;;
  *) echo "unknown model $model" >&2; exit 1 ;;
esac
root="$here/data/$model"
log="$root/history.log"
prompt="$here/data/prompts/history-h1.md"

echo "$(date -u +%H:%M:%S) start $model" >> "$log"
node "$here/history-input.mjs" "$model" >> "$log" 2>&1 || { echo "$(date -u +%H:%M:%S) no history input" >> "$log"; exit 1; }
for in in "$root"/history-in-*.json; do
  out="${in/history-in-/history-out-}"
  [ -s "$out" ] && continue
  text="Your instructions are in the file $prompt. Read it first with the Read tool and follow it exactly. In it, {IN_PATH} is $in and {OUT_PATH} is $out. Use only the Read and Write tools, open no file but those two, never search the web, and never look in any other folder."
  for attempt in 1 2; do
    start=$(date +%s)
    claude -p --model "$cli_model" --allowedTools "Read,Write" --max-turns 20 --output-format json "$text" > "$out.session.json" 2>> "$log"
    if [ -s "$out" ] && node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$out" 2>/dev/null; then
      echo "$(date -u +%H:%M:%S) done $(basename "$out") in $(( $(date +%s) - start ))s (try $attempt)" >> "$log"
      rm -f "$out.session.json"
      break
    fi
    echo "$(date -u +%H:%M:%S) FAILED $(basename "$out") try $attempt" >> "$log"
    rm -f "$out"
  done
done
echo "$(date -u +%H:%M:%S) end $model" >> "$log"
