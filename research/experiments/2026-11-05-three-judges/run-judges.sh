#!/usr/bin/env bash
# Judges every week for one model, in date order, through headless Claude Code
# sessions: waits until the week's batches are all read, builds the judge
# input (which carries the judge's own earlier calls on readings of claims
# that span weeks), runs the judge with the prompt version given, checks the
# output (every reading called once), and tries once more when it is not
# usable. Progress goes to data/<model>/judges.log.
#
# Usage: research/experiments/2026-11-05-three-judges/run-judges.sh <model> <prompt version, such as j3>
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
model="$1"
version="$2"
case "$model" in
  opus) cli_model="opus" ;;
  sonnet) cli_model="sonnet" ;;
  fable) cli_model="claude-fable-5-1" ;;
  *) echo "unknown model $model" >&2; exit 1 ;;
esac
root="$here/data/$model"
log="$root/judges.log"
prompt="$here/data/prompts/judge-$version.md"
[ -s "$prompt" ] || { echo "no prompt $prompt" >&2; exit 1; }

echo "$(date -u +%H:%M:%S) start $model with $version" >> "$log"
for week in "$here"/data/history/week-*.json; do
  monday="$(basename "$week" .json)"; monday="${monday#week-}"
  out="$root/judge-out-$monday.json"
  [ -s "$out" ] && continue

  # Wait for the week's readers.
  while ls "$root/batches-$monday"/batch-*.in.json >/dev/null 2>&1 && [ "$(ls "$root/batches-$monday"/batch-*.in.json | wc -l)" -ne "$(ls "$root/batches-$monday"/batch-*.out.json 2>/dev/null | wc -l)" ]; do sleep 60; done
  node "$here/check-batches.mjs" "$model" "$monday" >> "$log" 2>&1 || { echo "$(date -u +%H:%M:%S) $monday: a batch is bad, skipping" >> "$log"; continue; }
  node "$here/judge-input.mjs" "$model" "$monday" >> "$log" 2>&1 || { echo "$(date -u +%H:%M:%S) $monday: no judge input" >> "$log"; continue; }

  text="Your instructions are in the file $prompt. Read it first with the Read tool and follow it exactly. In it, {IN_PATH} is $root/judge-in-$monday.json, {BATCH_FOLDER} is $root/batches-$monday (its batch-NN.in.json files hold the article text; the files are not in the input's order, so search them by reading_id for hard cases), and {OUT_PATH} is $out. Use only the Read and Write tools. Open nothing outside those files and that folder: no other folder, no other model's files, no other judge's output, no web. Every reading in the input gets exactly one call."
  for attempt in 1 2; do
    start=$(date +%s)
    claude -p --model "$cli_model" --allowedTools "Read,Write" --max-turns 40 --output-format json "$text" > "$out.session.json" 2>> "$log"
    if node "$here/check-judge.mjs" "$model" "$monday" >> "$log" 2>&1; then
      echo "$(date -u +%H:%M:%S) judged $monday in $(( $(date +%s) - start ))s (try $attempt)" >> "$log"
      rm -f "$out.session.json"
      break
    fi
    echo "$(date -u +%H:%M:%S) FAILED $monday try $attempt" >> "$log"
    [ "$attempt" = 2 ] && mv -f "$out" "$out.failed.json" 2>/dev/null
    rm -f "$out"
  done
done
echo "$(date -u +%H:%M:%S) end $model: $(ls "$root"/judge-out-*.json 2>/dev/null | grep -vc '\.j[0-9]\.' ) weeks judged" >> "$log"
