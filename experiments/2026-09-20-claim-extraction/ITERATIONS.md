# Iteration log — append only

## 2026-09-20 — shape agreed, ruler under construction
Hypothesis and ruler written in README before any run. Anton's rulings this
evening: extract everything in the test (do not skip by classifier); full body;
one variable at a time; Qwen3.8 Flash; prompt reviewed by him before spend.
Ruler built by Fable subagents in fighter-time windows (≤22 articles, 4-article
overlap) then a merge pass over one-line cluster descriptions.

## 2026-09-20 night — ruler, three passes
- Pass 1: 15 Fable agents, fighter-time windows of ≤26 articles, 4-article
  overlap, headline + first 1500 chars. 182 clusters; overlap merge → 146.
  All 300 placed once. 78 uncertain pairs flagged. ~1.3M subscription tokens.
- Anton's challenge: why not full bodies, since extraction reads full bodies?
  Chosen answer: keep the lead-based pass, then re-read IN FULL only what the
  leads could not settle. Cost goes where the doubt is.
- Pass 2 (merge, one agent, descriptions only): 10 merges + 17 "same" pair
  rulings → 133 clusters. 26 "different", 35 "cannot tell" (53 articles).
  9 split candidates flagged; 7 survive after merges.
- Pass 3 (running): 35 pairs and 7 split-candidate clusters (79 articles)
  re-read in FULL by four agents. "Cannot tell" disallowed this time.
- Prompt: one invented example per news kind added at Anton's request
  (~580 tokens). Invented fighter names so nothing leaks from the test set.
  Awaiting his go. Runner is gated behind --yes; estimate $0.07/pass.
- score.py written: gemini-embedding-001 (production's model), batches of 20,
  backoff on 429, on-disk cache — Anton warned the Google key is free-tier.
- **Bug in my merge, caught before scoring:** applied the two split verdicts,
  THEN unioned the "same" pair rulings — one "same" ruling (#687 live page vs
  #683 results page) re-bridged what the split had separated, and chaining
  produced a 35-article "story" holding preview, live page, result and
  next-day column. That is precisely the join the instructions forbid. Suspect
  clusters (chained ≥2 same-rulings, any low-confidence same, or >8 articles)
  go back for a full-read split. Rule for next time: pair rulings feed the
  split review, they do not run after it.
- Re-split pass: 8 suspect clusters (89 articles) re-read in full by 8
  agents. 6 kept, 2 split: story-037 (podcast childhood story vs the divorce
  remark — Anton's low-confidence pair, now separate) and story-073 (the
  35-article chain → 6 stories: preview / second preview column / live page /
  event-wide results pages / the result itself / next-day column).
- **RULER v2: 136 stories over 300 articles.** 88 singletons; largest is the
  24-article Donchenko-beats-Soriano result across outlets and languages,
  which is genuinely one story. v1 kept as clusters-v1-chained.json.
- Baseline embedding (arms 1+2) running in background against v1; will be
  re-scored against v2 from cache. No rate-limit backoff seen so far.

## Baseline arms, ruler v2 (676 same-story pairs, 5,866 different-story pairs; same fighter, ≤3 days)
| arm | AUC | best threshold | errors at best | at prod's 0.80: misses / false merges |
|---|---|---|---|---|
| 1 headline | 0.895 | 0.84 | 572 | 375/676 · 290/5866 |
| 2 headline + lead (production) | **0.918** | **0.89** | 542 | **148/676 · 628/5866** |

Reading: production's own input separates better than headlines alone, but at
production's 0.80 threshold it falsely merges 628 different-story pairs (11%)
while still missing 148 same-story pairs (22%). The best single threshold for
that input is 0.89, not 0.80. Overlap (different-story pairs above the median
same-story pair): 5.7% → 5.0%. This is the number arm 3 has to beat.
Caveat: 276 of the 676 same-story pairs come from one 24-article result story;
a balanced view (≤6 pairs per story) is logged above the table in the run output.

## Pass 1 — the approved prompt + "examples are scenarios, not templates"
Anton's go, 2026-09-20 late. Budget ~$1.00, hard ceiling $1.50, ~$0.07/pass.
Prediction, before the run: claim arm AUC beats headline+lead's 0.918 on the
full pair set; on the balanced set the best threshold drops well below 0.98.
Coverage risk: NO CLAIM firing on articles that belong to multi-article stories.
- **Pass 1 aborted after 28 calls: reasoning was ON.** 837 of 917 completion
  tokens were thinking; 21.7 s and $0.00056 per call → ~$0.17 and ~35 min per
  pass, 2.4x the estimate, and Alibaba's own docs say thinking mode can break
  JSON output. Outputs moved to raw-p1-thinking/ (not deleted). Runner now
  sends reasoning.enabled=false and chat_template_kwargs.enable_thinking=false.
  Guides read: Alibaba structured-output doc (JSON Schema strict mode beats
  json_object; never set max_tokens; put field specs + examples in the prompt)
  and the Qwen3.8-Flash-Next card (non-thinking sampling temp 0.7/top_p 0.8 —
  I keep temperature 0 for reproducible comparisons; noted as a choice).

## Pass 1 result — the claim arm LOSES on the ruler, and the reason is definitional
$0.070, 300 articles, 39 NO CLAIM (5 inside multi-article stories, all defensible:
Gaethje-centred pieces and a boilerplate weigh-in page). Claims median 112 chars.

| arm | AUC full | AUC balanced | best thr → errors |
|---|---|---|---|
| 1 headline | 0.895 | 0.875 | 0.84 → 572 |
| 2 headline+lead (prod) | 0.918 | 0.918 | 0.89 → 542 |
| **3 extracted claim** | **0.876** | **0.830** | 0.95 → 509 (fewer pairs) |

Medians: claim same 0.918 / different 0.754 — everything is closer together.
Short sentences about the same fighter crowd in embedding space.

**But the worst "false merges" are not extraction errors.** They are pairs
whose claims are word-for-word identical — "Donchenko is scheduled to fight
Soriano at UFC Paris" across SIX ruler stories (055, 056, 066, 073.0/1/2: each
preview column or outlet's restatement was clustered as its own story), and
"Donchenko defeated Soriano by unanimous decision" across the event-wide
results pages (073.3) and the result story (073.4). The extractor is right
that these assert one fact. **The ruler was built by OCCASION (one piece of
coverage); the claim separates by FACT.** For G3 — nothing repeats — the
reader's question is "do I already know this?", and six previews of one
booking are repeats. So on these pairs the claim is closer to the goal than
the ruler is.

**The worst misses are the mirror image:** the NV interview published as
instalments (#298 TUF backstage, #320 territorial defence, #322 Kyiv club
purses) is one occasion in the ruler and three facts in the claims. For a
reader those are three different things to learn. Again the claim's reading
is the reader's reading.

So pass 1's AUC drop is largely measuring ruler-vs-claim disagreement on what
a "story" is, not extraction quality. That is a question for Anton (fact or
occasion?), recorded below. What IS an extraction problem: claims are short
and same-shaped, so genuinely different remarks by the same person on
different occasions sit too close (different-story median 0.754 vs the lead's
0.698). The claim drops the thing that distinguishes them — WHERE and WHEN it
was said.

Fields (exact match): actor agrees on 98% of same-story pairs but also 36% of
different-story pairs; event 67% vs 43%; date 86% vs 63% but filled on only
20%. Fields identify the EVENT, not the story about it — useful for "same
fight?", useless for "same news?". The third option is not a dedup on its own.

## Pass 2 — own-news sharpened, plus an `occasion` field  (from pass-1 errors, not from the idea list)
Two changes, both traced to pass 1:
1. Previews, next-day columns and "next opponent" analyses came back as the
   result/booking they recall (073.0/073.5/110 ↔ 073.4). The claim instruction
   now says the news is what the reader learns HERE and nowhere earlier, and
   two examples show the failure shapes: a next-day column (news = the verdict)
   and a next-opponents list (news = the options).
2. Different remarks by one person crowd together and one interview's
   instalments fall apart, because the sentence carries neither where nor when.
   New field `occasion` (podcast / essay / presser / post / event / date).
   Arm 3 will be scored as claim alone AND claim + occasion, to attribute.
Prediction before the run: same-story pairs under 0.80 fall from 65 (mostly
story-022/090/112 instalments) and result↔column false merges fall; balanced
AUC rises above 0.83. Beating 0.918 is the open question. Cost ~$0.06.
Spend so far: ~$0.09.
- Pass 2 ran: $0.06, 242/300 claims changed, NO CLAIM 39 → 19, `occasion`
  filled on 246/300, median claim 136 chars (was 112).
  Spot read of the pass-1 failure cases: the preview (#599) is FIXED — now the
  analysis's own point, not "scheduled to fight". The NV instalments share
  occasion "Interview with NV", as intended. But the next-day column (#817)
  STILL comes back as the result, with the fight as its occasion — the
  sharpened instruction and the column example did not reach it. And the
  drop in NO CLAIM has a cost: 3 claims now fail to name the fighter (#556,
  #643, #1050 — Gaethje/McCann pieces where Topuria is peripheral); pass 1
  had 0. One line to add for pass 3: about somebody else → NO CLAIM.
- Arm 4 (pass-1 claim + headline + lead) died on Gemini 429 after 8 retries:
  two embedding jobs were running at once on the free tier. Backoff raised to
  14 attempts / 120 s cap; embedders now run one at a time.

## Pass 2 result — real gain; occasion is worth having; production is now matched, not beaten
Embeddings moved to OpenRouter's google/gemini-embedding-001 at 768 dims
(verified cosine 1.0000 against Google-direct on a probe) after the free tier
stalled the claim arm twice. Same model as production, no throttle, ~1 cent.

| arm | AUC full | AUC balanced | overlap | best thr → errors |
|---|---|---|---|---|
| 2 headline+lead (prod) | 0.918 | 0.918 | 5.0% | 0.89 → 542 / 6542 (8.3%) |
| 3 pass-1 claim | 0.876 | 0.830 | 5.2% | 0.95 → 509 / 5139 |
| 3 pass-2 claim | 0.905 | 0.882 | 3.2% | 0.92 → 499 / 5921 |
| **3o pass-2 claim + occasion** | **0.918** | **0.897** | **2.3%** | **0.91 → 455 / 5921 (7.7%)** |

Prediction check: balanced AUC rose above 0.83 — yes (0.882 / 0.897). Beat
0.918 — on the full set it ties; on the balanced (hard-story) set it does not.
`occasion` alone is worth +0.013 full AUC and cuts overlap 3.2% → 2.3%, the
lowest of any arm. The sentence with where-and-when attached is the best
single text we have for telling stories apart at the tails.
Spend so far ≈ $0.17 of the $1.00.

## Pass 3 — decide the KIND first, one fact per claim, about-someone-else → NO CLAIM
From pass-2 errors. (a) #817 (next-day column) still came back as the result:
the instruction and example were not enough for a small model, so the shape
changes — a `kind` field is decided FIRST (fill order matters; production
learned the same with `reasoning` first) and the claim rule is keyed on it:
analysis → the verdict, restatement → NO CLAIM. (b) #732 packed result +
callout into one sentence and matched both the result story and the callout
story: one fact per claim, the NEW thing wins. (c) #1050/#948/#556/#643 —
claims that never name the fighter, one phrased "the article mentions a
report…": about_someone_else → NO CLAIM, and no meta-phrasing.
Prediction: 073.5↔073.4 and 073.4↔093 false merges disappear; claims not
naming the fighter → 0; NO CLAIM rises back toward 30–40; balanced AUC for
claim+occasion above 0.90. Risk: `kind` misfires and sends real news to
NO CLAIM — coverage must stay ≥ 97%. Cost ~$0.06; spend after ≈ $0.24.

## Arm 4 — the claim ADDS to what production embeds; it should not replace it
Text embedded: pass-2 claim + occasion, then the headline, then the first
1500 chars — i.e. production's input with one sentence in front. Same 676 /
5,866 pairs as production (nothing drops out), same embedding model.

| | AUC full | AUC balanced | overlap | errors at best thr |
|---|---|---|---|---|
| 2 headline+lead (production) | 0.918 | 0.918 | 5.0% | 542 @ 0.89 |
| 3o claim+occasion alone | 0.918 | 0.897 | 2.3% | 455 @ 0.91 (fewer pairs) |
| **4 claim+occasion + headline+lead** | **0.944** | **0.930** | **1.5%** | **398 @ 0.89** |

**27% fewer errors at production's own best threshold, on the identical pair
set.** The balanced view — the hard stories — rises from 0.918 to 0.930, the
first arm to beat production there. Overlap falls from 5.0% to 1.5%.

Reading: the claim carries the substance and the lead carries the
distinguishing detail; each alone loses something the other has. For the
whiteboard: the Extractor's sentence goes INTO the dedup embedding alongside
the text, not instead of it. This also makes the fact-vs-occasion dispute
matter less, because the lead keeps occasion-level detail the sentence
strips.
- Free variant on pass 2: occasion FIRST ("MightyCast podcast: Gaethje says…")
  beats occasion appended — AUC 0.926 vs 0.918, errors 423 vs 455, overlap
  1.7% vs 2.3%. Word order in the embedded text matters; the occasion
  weighs more up front. Carried into the standard arms (3q and arm 4).

## Pass 3 spot read, and pass 4
Pass 3 fixed what it aimed at: #732 now carries only the callout, #1050/#948
are NO CLAIM, no claim fails to name the fighter (3 → 0), meta-phrasing 1.
#817 (the next-day column) is extracted as the result for the THIRD time —
`kind` came back new_event. Three prompt shapes have not moved it; parked as
not crackable by wording alone (a date check — fight date well before the
article date — would catch it in code).
**But NO CLAIM jumped 19 → 73**, and 54 articles that had a pass-2 claim
lost it. The classifier's `role` on those: 18 background / 11 mentioned_only
(fair), but **18 "the one being talked about"** — Pimblett wanting Topuria
next (#273), Usman saying he quit on the stool (#431/#435), Hooker on whether
he'd risk Usman (#533/#540), Gaethje on a rematch (#1093). All claims ABOUT
him, all sent to NO CLAIM as "about someone else". The exact defect the
classifier had with `background`, reproduced in the extractor.
**Pass 4:** about_someone_else gets the classifier's delete test — delete
every sentence naming him; if the story still stands, it is about someone
else — and an example of another fighter wanting him next as a claim.
Prediction: NO CLAIM back to 35–45; the 18 recover; coverage ≥ 97%; arm 4
AUC balanced holds ≥ 0.93. Cost ~$0.06; spend after ≈ $0.30.

## Pass 3 scored — a regression, kept on the record
| arm | AUC full | AUC balanced | overlap | errors @ best | coverage |
|---|---|---|---|---|---|
| 3q occasion-first claim (p2) | 0.926 | 0.908 | 1.7% | 423 / 5921 | 100% |
| 3q occasion-first claim (p3) | 0.904 | 0.881 | 4.8% | 466 / 4366 | **88%** |
| 4 claim + headline+lead (p2) | **0.944** | **0.930** | **1.5%** | **398 / 6542** | 100% |
| 4 claim + headline+lead (p3) | 0.933 | 0.911 | 1.5% | 424 / 6542 | 100% |
The `kind`-first shape fixed the three cases it was aimed at and lost 25
articles of real coverage to "about someone else". Net: worse than pass 2 on
every arm. Pass 2 stays the best prompt so far; pass 4 keeps the kind field
and the one-fact rule but repairs the over-fire. If pass 4 does not beat
pass 2's arm 4 (398 errors, balanced 0.930), the kind field goes.
- Pass 4 ran ($0.06; spend ≈ $0.30). NO CLAIM 73 → 38, inside the predicted
  35–45. All ten named over-fire cases recovered; 35 articles regained a claim
  (16 of them "the one being talked about" by the classifier's reading).
  #817 is the result for the fourth time. Claims not naming the fighter: 2.
  Scores pending.

## Pass 4 scored — a tie with pass 2 on the ruler, a win on claim quality
| arm | p2 | p4 |
|---|---|---|
| 3q occasion-first claim: AUC full / balanced / errors | 0.926 / 0.908 / 423 | 0.925 / 0.896 / 440 |
| 4 claim + headline+lead: AUC full / balanced / overlap / errors | 0.944 / 0.930 / 1.5% / 398 | 0.942 / 0.929 / **1.2%** / 396 |
| coverage of multi-article stories | 100% | 98% |
By the exit rule written before pass 4 ("if it does not beat pass 2's arm 4,
the kind field goes"), this is not a beat — it is a tie inside any plausible
noise. What the ruler cannot see: pass 4's claims are cleaner as claims —
one fact each, the new thing wins over the recalled event, 0–2 fail to name
the fighter (pass 2: 3), no meta-phrasing, and about-someone-else NO CLAIMs
are now right rather than over-fired. A production extractor needs the
sentence itself to be true and single, not only to cluster well.
**Decision: pass 4 is the candidate prompt; iteration on the `kind` axis
stops here** — the ruler shows no further gain from it.

## Pass 5 — a replicate of pass 4, byte-identical, to measure the extractor's noise floor
Temperature 0 does not mean deterministic (the classifier experiment: 2.8% of
answers moved on identical input). Without this number, 396 vs 398 and
0.929 vs 0.930 cannot be called ties or differences. Prediction: some claims
change wording; arm-4 errors move by fewer than 15. Cost $0.06; spend ≈ $0.36.
