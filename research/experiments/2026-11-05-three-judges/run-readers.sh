#!/usr/bin/env bash
# Runs one model's readers and screens through headless Claude Code sessions,
# several at a time: every batch-NN.in.json and screen-<monday>.in.json under
# data/<model>/ that has no answer file yet. Each session gets the rendered
# prompt's path and its two file paths, and may use only Read and Write. A
# session whose answer is not valid JSON is run again once. Progress goes to
# data/<model>/runner.log. The model calls are on the maintainer's Claude plan,
# not an API key: no outside spend.
#
# Usage: research/experiments/2026-11-05-three-judges/run-readers.sh <model> [parallel]
#   <model> is the folder name: opus, fable or sonnet.
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
model="$1"
parallel="${2:-6}"
case "$model" in
  opus) cli_model="opus" ;;
  sonnet) cli_model="sonnet" ;;
  fable) cli_model="claude-fable-5-1" ;;
  haiku) cli_model="haiku" ;;
  *) echo "unknown model $model" >&2; exit 1 ;;
esac
root="$here/data/$model"
log="$root/runner.log"
export here model cli_model log

# One session: the prompt by kind, the batch in, the answers out.
run_one() {
  in="$1"
  out="${in%.in.json}.out.json"
  [ -s "$out" ] && exit 0
  case "$(basename "$in")" in
    screen-*) prompt="$here/data/prompts/screen-s1.md" ;;
    *) prompt="$here/data/prompts/reader-r1.md" ;;
  esac
  text="Your instructions are in the file $prompt. Read it first with the Read tool and follow it exactly. In it, {IN_PATH} is $in and {OUT_PATH} is $out. Use only the Read and Write tools, open no file but those two, never search the web, and never look in any other folder. Work from the text alone."
  for attempt in 1 2; do
    start=$(date +%s)
    claude -p --model "$cli_model" --allowedTools "Read,Write" --max-turns 8 --output-format json "$text" > "${out}.session.json" 2>> "$log"
    if [ -s "$out" ] && node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$out" 2>/dev/null; then
      echo "$(date -u +%H:%M:%S) done $(basename "$(dirname "$in")")/$(basename "$in") in $(( $(date +%s) - start ))s (try $attempt)" >> "$log"
      rm -f "${out}.session.json"
      exit 0
    fi
    echo "$(date -u +%H:%M:%S) FAILED $(basename "$(dirname "$in")")/$(basename "$in") try $attempt" >> "$log"
    rm -f "$out"
  done
  exit 1
}
export -f run_one

echo "$(date -u +%H:%M:%S) start $model, $parallel at a time" >> "$log"
{ ls "$root"/batches-*/batch-*.in.json "$root"/screen-*.in.json 2>/dev/null; } \
  | while read -r in; do [ -s "${in%.in.json}.out.json" ] || echo "$in"; done \
  | xargs -P "$parallel" -I {} bash -c 'run_one "$@"' _ {}
echo "$(date -u +%H:%M:%S) end $model: $(ls "$root"/batches-*/batch-*.out.json 2>/dev/null | wc -l | tr -d ' ') batches read, $(grep -c FAILED "$log") failures logged" >> "$log"
