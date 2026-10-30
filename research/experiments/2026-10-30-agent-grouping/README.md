# Agents propose the grouping marks (2026-10-30)

**Question.** Can agents read a week's articles and propose the grouping
marks the maintainer makes on the storyboard (a reading belongs in its
claim, does not and where, is its own claim; two claims are one), well
enough that his review becomes confirming or denying their calls instead of
reading every article?

**Why.** Over-merging and over-splitting are measured from his marks
(`/scores`), and marking is slow: 80 marks in the busiest week took a
reading of each article. A call with a one-line reason can be checked in
seconds. The calls are proposals only: they never enter the review tables
unless he confirms one, which saves it as his own mark
([storyboard README](../../../v0/storyboard/README.md#agents-calls-local-only)).

## How it runs

Everything here reads v0's live tables with the session set read-only, and
writes only to `data/` (git-ignored: it holds article text). The model calls
are Claude sessions' agents, not API keys: no outside spend.

1. **Export a week** (`export-week.mjs <monday>`): every claim with a
   reading published that Pacific week, all its readings (headline,
   extract, body cut at 6,000 characters) and the maintainer's marks on
   them → `data/week-<monday>.json`.
2. **Cut reading batches** (`make-batches.mjs <monday>`): 25 readings each,
   in claim order, body cut at 3,500 characters, without his marks.
   A batch with an answer file is skipped, so a later run resumes.
3. **Read** (one agent per batch, a mid-size model,
   [reader-prompt.md](reader-prompt.md)): what each article reports: the
   occasion, the speaker, the fact, how much it is about the fighter, and
   whether it matches the claim's label, with why → `batch-NN.out.json`.
4. **Judge** (`judge-input.mjs <monday>`, then one agent on the strongest
   model, [judge-prompt.md](judge-prompt.md)): from the readers' lines, and
   the article text for hard cases, one call per reading and the same-claim
   links → `data/judge-out-<monday>.json`.
5. **Build** (`build-marks.mjs <monday> "<who>"`): checks the calls against
   the week, writes `data/agent-marks-<monday>.json` and
   `data/compare-<monday>.md` (where they differ from his marks), and joins
   every week into the storyboard's `data/agent-marks.json`.

A claim can span two weeks. Its readings are read once (`make-batches.mjs`
reuses an earlier week's reader answers), and the judge sees the earlier
call on each and keeps it unless the new week shows it wrong.

## Caveats

- The judge's rule of what one claim is was written from the maintainer's
  notes. Rule 2 (different speakers' reactions are different claims) comes
  from his note on claim 419, which is in the first week judged, so
  agreement on that claim is not independent evidence.
- One reader per article: the readers were not run twice, so the noise
  floor below is the judge's alone.
- The readers saw the claim's label, which can anchor them toward "matches".

## Results

**Week of 2026-09-28** (61 claims, 344 readings; Sonnet readers in 14
batches, one Opus judge; no outside spend):

- Calls: 258 belongs, 29 belong in another claim, 57 their own claim; 13
  same-claim links. 294 of 344 calls are marked high confidence.
- **Against the maintainer's 80 marks on these readings: the same call on
  70, a different one on 10** (88%; a second judge run differs on 3 of 344,
  below). The 10 fall into
  three questions of rule rather than misreadings (from the calls' reasons;
  the articles were not re-read to check):
  - reactions by other people inside the big "back, and the gloves" claim
    (#289: fans, Dana White, a preview column), which he kept and the
    judge's rule 2 splits off;
  - later weekly issues of one power-rankings column (#383, three
    readings), which he kept together and rule 4 splits;
  - four Pimblett write-ups in #421 that the judge, reading the bodies,
    traces to an earlier interview (claim #394) rather than the later clip.
- 86 calls propose a split or a move, 74 of them on readings he had not
  marked; 35 of the 61 claims carry at least one such proposal.

**Week of 2026-10-05** (45 claims, 239 readings; 167 of them in claims
that span both weeks, read once and reused, so 72 new readings were read).
The judge was given last week's call on each reused reading and kept all
but 3, which it moved to a claim first seen this week.

- **Both weeks together** (95 claims, 416 readings): the calls match 77 of
  the maintainer's 87 marks; the 10 that differ are the ones above (all on
  claims that span the two weeks). The one same-claim link he made in
  these weeks (#424 with #426, a rumour and the reply to it) the judge made
  too, without seeing it. 94 calls propose a split or a move; 19
  same-claim links.

**Weeks of 2026-10-12 and 2026-10-19** (41 and 57 claims; 104 and 94 new
readings read, the rest reused). Each judge kept the earlier calls on
reused readings but for 3 a week, moved to a claim first seen that week.

- **All four weeks** (168 claims, 608 readings): the calls match **98 of
  the maintainer's 108 marks**; the 10 that differ are still the ones
  listed for the first week. His one same-claim link is among the judge's.
  119 calls propose a split or a move; 37 same-claim links.
- Beside the marks, his note on claim #476 says all its articles are
  Volkanovski on one podcast; the judge splits eight of them off as later
  sittings or other speakers. A note is not a mark, so it is not counted
  above.

**Week of 2026-10-26** (38 claims, 110 readings, 64 new). The judge moved
8 earlier "own claim" calls into claims first seen this week (a press
conference and an interview that had no claim of their own before).

- **All five weeks** (197 claims, 672 readings): still **98 of the
  maintainer's 108 marks** matched, 120 calls proposing a split or a move,
  43 same-claim links.

**Noise floor: the judge is stable on the same reader lines.** A second
judge run on week 1, in its own work folder and told to open nothing but
the prompt, the input and the article batches, made the same call as the
first on **341 of 344 readings (99.1%)** and the same 13 same-claim links.
The 3 that differ were low or medium confidence in one run or both (two
readings of a preview column, one Pimblett write-up); against the
maintainer's 80 marks the runs score 70 and 72. So a difference of more
than a few calls between two prompts or models is not judge noise. This
measures the judge only: the readers were not run twice.

An earlier attempt at this second run is not used: it worked in a scratch
folder shared by every agent of the session, where the first judge's
output still lay. Agents of one session share that folder, so a repeat
run gets a folder of its own.

## Where it stands

- Weeks of 2026-09-28 to 2026-10-26: done. The storyboard reads all five
  from `data/agent-marks.json`; nothing is answered yet.
- **Next:** new weeks as they fill (from step 1; claims that span weeks
  are read once). Open questions for the maintainer are the three rule
  questions under the first week's results, and the #476 note.
