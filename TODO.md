# RingFacts — Next Steps

## After v0: the showcase, then the friends (ranked 2026-10-06)

v0 is complete (22 of 22; task 9.1 closes itself on the first real tier-1
story). The end state is restated in [docs/goals.md](docs/goals.md) ("The
end state, restated"): a public showcase first, then a bot good enough
for the real group, then a place to read, then chat. Ranked by how much
each item moves that, in order. Importance is given for the showcase (S)
and the launch (L). The "Parked (v0)" list of earlier today is folded in here.
The same list laid across the stations, task by task, with the parked
backlog: [docs/launch-map.html](docs/launch-map.html), the Launch Map, also the
public roadmap at https://antoine4j.github.io/ringfacts/launch-map.html.

1. **Tidy the repo and rewrite the README.** S: critical, strangers read
   the repo today. L: none. Experiments into a named folder, article
   bodies out of history, a status banner naming v0, the README in the
   order what / how / how measured / how to run.
   Days, not weeks. **2026-10-06:** research folders under `research/`;
   history rechecked, no article text; status line on the README and both
   published pages; README rewritten; the public pages re-read against the
   code and corrected. Left: the GitHub description (drafted), the
   clean-up decisions (0.14) and the backlog sort (0.12).
   **2026-10-09:** all three done: the GitHub description applied, 0.14
   cleaned every copy, and 0.12 moved five candidates onto their stations
   and kept 4.26 and 4.27 parked for v8. Left: 0.15, what leaves this repo.
2. **The precision scoreboard** ([spec](docs/superpowers/specs/2026-10-06-precision-scoreboard.md),
   eight questions open; unparked). S: critical, it is the page that shows
   how well the pipeline does; what matters is that each rate is on the page with a
   date and a method, not that it is high. L: the dashboard for the launch
   bar. Built on the compare page and the reactions that exist.
3. **Review tooling** ([the classifier's answers behind a tier](docs/superpowers/specs/2026-10-06-review-classifier-answers.md),
   two decisions open; [editing a review mark](docs/superpowers/specs/2026-10-06-review-mark-editing.md);
   the feedback form as plain notes, [v0 design](docs/superpowers/specs/2026-10-04-v0-design.md)
   section 11; all unparked). L: medium on its own, but Anton's review
   time is the scarce resource and over-merges are visible now and scroll
   into history; this makes the every-couple-of-days grooming fast while
   the claims are fresh. S: the "production teaches the model" post (blog
   backlog 10).
4. **Tune the digest station.** L: critical, ~115 Topuria tier-2 readings a
   week go through it and it is most of what friends will see. Pick the
   model on the blind comparison page (`/digests/compare`), prompt rounds,
   a ranking over claims on top of the classifier's tier, a cap (about 5
   items was suggested). Anton's reactions are the score. B: medium, the
   "small model classifies, big model writes" story with a cost table
   (blog backlog 7).
5. **Make v0 self-feeding, then retire production.** S and L: critical.
   v0 still reads its articles from production's `items` table (v0 design,
   "Timing"), so production cannot stop until v0 runs stations 1–3 itself:
   the feeds, the seen-before check and the body fetch. Build those in v0
   with the fallback below as part of them, watch a week of both feeding
   the same articles, then retire production once the launch window reads
   clean. The storyboard loses its compare page.
6. **The body-fetch fallback** (G1), inside item 5. L: high. 72% of
   Amosov's readings and 42% of Donchenko's have no text, so the classifier
   never sees them and G1 is at risk for the two fighters the friends care
   about most; the spike recovered 56% for free: a decode retry on the next
   run, a reader service (Jina) when the fetch fails, the MMAWeekly and
   Athlon feeds; new articles only. S: blog backlog 6, "count what never
   reached the model", with the dirty-text measurement parked there.
7. **A public read-only live demo.** S: high, something a visitor can
   use: trace
   any article to its claim, grouping and digest, and a web section that
   imitates the channel. After the switch so it shows the real thing;
   article bodies stay private (headlines, extracts, claims, digests only).
   L: the seed of the reader-facing site. Domain to be found.
8. **Grouping fixes** (tasks 6.9 and 6.12, on the Launch Map's station 6 since 2026-10-09). G3 only: medium, the
   digest absorbs splits and the launch bar tolerates them. They move the
   over-split and over-merge rates the scoreboard shows; measured on the
   golden replay before any change.
9. **Classifier v8** (4.26, 4.27, health). Low until the window shows a
   missed career event; then it jumps to the top.
10. **The reader-facing site proper, then chat follow-up.** After launch;
    the demo in 7 grows into the site.
11. **Bout as an entity, address clean-up, the fighter profile.** Low.

Blog posts about the project are planned and written outside this repo;
items 2, 6 and 7 each feed one.

## Superseded: priorities of 2026-09-04 (kept for the record)

These ranked production's work. Production retires with item 5 above; what
is still open below is either folded into the list above (3b, 3e → the v0
stations) or goes with production.

Goals and success criteria live in [docs/goals.md](docs/goals.md). Each item
names the goal it moves.

1. ~~**Stop the mshale.com spam** (G2)~~ — **shipped 2026-09-04**, the
   untrusted-source rule (docs/decisions.md#untrusted-source). Watch: the first
   live `held_reason: 'untrusted_source'` rows, and that no non-mshale domain
   ever trips it.
2. ~~**First measurement pass**~~ — **done and graded by Anton 2026-09-04**
   ([docs/grading/2026-09-04-posted-30d.md](docs/grading/2026-09-04-posted-30d.md)).
   103 posts in 30 days: **G2 precision 34%** (target 90%) — 68 of 103 are
   bucket 3, mostly articles about Makhachev, Gaethje, Tsarukyan or Usman with
   our fighter as backdrop, plus other fighters calling him out or naming his
   next opponent; 6 spam; 3 stale; **8 repeats** of an already-posted story
   (G3), all missed by the dedup gate. Pre-grading agreed with Anton on 99 of
   103; the misses were Claude being generous with bucket 2 on "others
   steering him elsewhere" items (worked examples in goals.md). G1: the
   one career event in the window (Donchenko booked for Paris) posted and
   confirmed; recall probe found nothing missed, weak evidence. Re-run
   monthly; next pass also grades a sample of the holds (goals.md G2, "both
   directions") and counts how many bucket-3 items are really "lifestyle".
3. ~~**Ship the tier reorder + daily mentions digest** (G2)~~ — **built
   2026-09-04** (docs/decisions.md#tier-reorder, #mentions-digest). Reorder
   re-measured 55% → 79% on the relabelled corpus, zero regressions; 15
   posted archive items would have folded, all 15 graded bucket 3. Hourly
   runs now queue mentions instead of sending them. **Digest held back
   (Anton, 2026-09-04 evening):** no tangential articles in the chat at all,
   so the daily trigger is never created; queued rows stay in the archive as
   held items. Future idea, parked: **one link to a public page** that
   aggregates the week's mentions per fighter (a static page on a public
   host — not the backup bucket; GitHub Pages or a second bucket). Revisit
   when the main digest is near 90%. Next lever after this: the grading pass shows `supporting` and
   some `central` items are bucket 3 too, so the reorder alone will not reach
   90% — that is the mention-kind field (§4 usefulness-gradient bullet).
3b. **Why did the dedup gate miss 8 repeats?** (G3) — **measured 2026-09-04,
   nothing changed.** Three pairs (#1/#4, #2/#4, #9/#8) are the 2026-08-06
   bootstrap batch, inserted in the same second with no anchors — history, not
   a live miss. The five live pairs measure **0.712–0.761** (es/en pairs
   0.72–0.75; the en pair #45/#43 0.761), all under 0.80, and their recorded
   nearest neighbours were *other* stories at 0.75–0.80. So headline
   embeddings do not separate same-story-different-angle pairs from
   different-story-same-fighter pairs — the 2026-08-06 observation, now with
   numbers — and lowering the threshold would hold real news (§5). The
   experiment that settles it, replayable offline over the archive: embed
   headline + first ~300 chars of body instead of the headline alone, and
   re-measure the gap between the 5 known repeats and their non-repeat
   neighbours. Not built.
3c. ~~**Tune the matcher prompt against Anton's buckets**~~ (G2, G4) —
   **shipped 2026-09-04** (docs/decisions.md#claim-discipline); holdout
   25/44 → 29/44, dry run clean.
   On the graded month's tune split (45 items, K=5) the pipeline's bucket
   went from **22/45 to 34/45**, bucket 2 from 8/13 to 13/13, false loud
   claims from 13 to **0**; the old corpus 11/25 → 13/25, no regressions.
   Three changes: claim types defined with negative cases as domain data;
   a gate that drops a NEW claim not naming the subject; a gate that drops a
   "result" dated more than 14 days before the article. Watch for a week:
   fewer 🕵️ lines, no real event missed (a real result or injury must still
   mint — the gates only act on a wrong name or an old date). The first
   baseline reported for this item (29/45) was void: the bench passed the
   subject object, not its name.
   **Then the reader's test, same evening** (docs/decisions.md#news-for-followers):
   a fourth matcher field, "would a follower learn something new about
   him", with Anton's rulings as the examples; a `no` folds a non-event, a
   loud claim is never folded. Tune **34 → 37/45**, holdout **29 → 32/44**,
   holdout stability 37 → 41/44. Column `items.news_for_followers`; kill
   switch `NEWS_GATE_OFF=1`. Still missed, about half the time each: a
   rival's prediction list (#30), "the one fighter who can beat X" (#249),
   his old fight in a caption or clip (#3, #106), Gaethje-manager profiles
   (#6, #22). Watch for a week: no bucket-2 article folded (every fold is a
   row with `news_for_followers='no'` and `held_reason='tangential'`).
   **First live hour (17:17 UTC) found the next weak spot: repeats at the
   claim level.** One story (Topuria's video letter to his son) became
   claims 51, 52, 53 and messages 200 and 201 — three angles on one event,
   each called NEW (docs/article-feedback.md, 2026-09-04 evening). Fix to
   bench next: a prompt rule "a claim is an event, not an angle" with items
   620/626/627 as the worked example, plus a mint-time guard comparing the
   new canonical sentence against the subject's recent claims by embedding.
   **Same evening, the other edge, shipped** (docs/decisions.md#fight-stages):
   a fight-week rehearsal folded the weigh-in, the result, the bonus and the
   callout into the booking claim, 15/15 MATCH — the result would never have
   posted. Three changes: a `reasoning` field first in the tool schema (the
   model thinks before the forced verdict), booking-type claims marked as
   bookings in the candidate list, and a "stages are separate facts" rule
   with a worked example; plus a gate demoting a `result` with no readable
   fight date to `other`. Tune 37 → 38/45, false loud claims 0, rehearsal
   0 MATCH in 12. Watch UFC Paris (Sat 2026-09-06): the result must post as
   a 🕵️ result line within the hour, later result articles must MATCH it,
   and the Friday weigh-in is the first live test. The `because:` log line
   under each verdict is the audit trail. The Topuria one-story-three-claims
   case above is NOT fixed by this: still to bench.
3d. **Cap the claim list the matcher reads** (G3, cost) — **Anton, 2026-09-04:
   "important, do soon".** Today `activeClaims` hands the matcher every
   rumor/confirmed claim for the subject, sorted by headline-to-claim
   embedding similarity, uncapped (Topuria: 35 and growing; ~1,000 tokens
   per call now, unbounded later, and a long list thins a small model's
   attention). Plan: (1) `LIMIT` the sorted list to the top 20 — the order
   already exists, this is one line; (2) age out claims nothing has matched
   in months (mark dormant, never delete); (3) before shipping, the bench
   check that the corpus's duplicate items (`class: duplicate`, and the
   MATCH-expecting announcement echoes) still come back as MATCH with the
   shorter list — the one risk is a true match at position 21. The
   comparison is headline-vs-canonical-sentence on purpose: the sentence is
   the stable side (English, one line, names the fighter). If the sort ever
   proves too weak, embed headline + first paragraph instead — the same
   experiment 3b wants for repeats, so do them together.
3e. **Feedback by talking to the bot: forward a post, say the verdict, it
   lands in the corpus** (all four goals; designed with Anton 2026-09-04,
   refined in his voice chat the same day — tmp/ holds the handoff; build
   after fight week). Today a ruling reaches the bench only through a
   grading session. The bot's conversational side (server.js) is a stub
   with no tools and no memory; this gives it its first job.
   - *Channel.* Anton's private chat with the bot, never the group. He
     forwards a post from the group, then talks normally. The bot needs no
     new access: the DM is already on the webhook whitelist, the group is
     not and stays that way. Locked to Anton's Telegram user id — his
     verdicts are the training signal; anything from another id is rejected.
   - *Session = the forward.* Each forward starts a fresh session; every
     message after it belongs to that session until the next forward or a
     TTL of about a day. Not cleared on commit, so "also mark it as too
     promotional" works after a write. No summarization, no retrieval, no
     reply-to-switch-topics in v1. Session state lives in Neon, never in
     the process (Cloud Run scales to zero; use Neon's pooled connection
     string from the service). Small store interface so Redis could replace
     it if session reads ever get hot.
   - *Session holds the article set plus a focus pointer.* On forward, the
     post's links (article URLs, the key in `items`) resolve to its two-to-
     five items; all are stored with which one is in focus, so "this one is
     junk" then "no, the second one" works without re-forwarding. Bullets
     are numbered so "2 junk" is exact; a description is resolved by Haiku
     choosing among that post's headlines only.
   - *Existing feedback loads on forward.* Items and any feedback rows about
     them are fetched in the same step, before the bot answers. Prior
     verdicts are surfaced: "you said this was junk last week — still?"
   - *Propose and commit are two tools.* `propose_feedback` classifies
     Anton's words into a draft (item, verdict up/down, reason from the
     enum junk/dup/old/wrong/loud/missed, wanted bucket, note verbatim) and
     shows it; `commit_feedback` writes it. The split means the model
     structurally cannot write without confirmation. Several verdicts in
     one message → several drafts, each with an id, so "yes to the first
     two, not the third" maps cleanly. Approve/edit/skip as an inline
     keyboard on the proposal — one tap, no text parsing.
   - *Never write without explicit confirmation.* No timeout auto-write, no
     silent write. A pending draft stays pending; on return or on the next
     forward the bot leads with "we never saved your note on the last one —
     want me to?" Losing feedback beats storing something unapproved.
   - *Ask, don't guess.* Unknown article → ask which. Unclear reason → ask a
     specific follow-up, never invent a rationale. Message with no active
     session → "I've lost track of which article that was, mind forwarding
     it again?" Off-topic → "feedback only, for now".
   - *Telegram mechanics.* Typing indicator re-fired in a loop during tool
     chains (it expires after ~5 s; 8 s of silence feels broken); better, a
     short placeholder message edited in place with the answer (a bot's
     edits to its own DM messages show no "edited" label — the no-edit rule
     is about the group). Parallel reads are fine; keep propose→commit
     sequential so approvals stay unambiguous. Dedupe Telegram retries by
     update_id.
   - *Partner, not a form.* "Why did it post this?" is answerable only if
     the hunter stores the matcher's `reasoning` per item (today a log line)
     — one additive column, `items.matcher_reasoning`. A changed verdict is
     a new row that supersedes the old (as claims do); the corpus takes the
     latest per article.
   - *Schema, additive.* `items.matcher_reasoning`; `items.tg_message_id`
     (optional, keeps a reply-in-group path open). New `feedback`: id,
     item_id, claim_id (alerts), verdict, reason, wanted_bucket, note,
     forwarded_text, from_user, supersedes, created_at. New `sessions`:
     one per forward — user id, item ids, focus, pending drafts, started,
     expires. Plus a table of DM turns, stored before anything else.
   - *One labelling system first (Anton, 2026-09-04 late evening).* Before
     the bot: every article ever captured gets a label in ONE place, the
     `feedback` table (schema.sql), and the bench file is generated from it.
     Row: wanted_bucket, reason (fine/junk/dup/old/wrong/loud/missed/other),
     dup_of, note verbatim, author (haiku/sonnet/claude/user), confidence,
     source, supersedes. Never update, always insert; `user` rows win.
     Back-fill plan, by group: the 103 graded posts converted from the
     grading doc as author=user; 7 newer posts pre-labelled; held-as-dup
     (207) checked against the stored nearest item; held-as-matched (146)
     against the claim's origin — the group where real news gets swallowed;
     wrong-subject (147) and folded (47) read and confirmed. Haiku subagents
     read (subscription, not the API cap), Sonnet re-reads doubts, Anton
     rules on the rest via one review sheet shaped like
     docs/grading/2026-09-04-posted-30d.md plus "machine said" and "dup of"
     columns. The August corpus files retire into unit tests afterwards.
   - *Into the bench.* research/corpus/build-graded.js gains feedback rows as a
     second input beside the grading table: item id + wanted bucket + note
     → corpus entry, split by hash. Rebuilt at the weekly grading pass so
     bench numbers stay comparable. Notes with a phrase are the raw
     material for prompt examples (as the 13 rulings are now).
   - *Not in v1.* Acting on a verdict live (merging claims on "dup",
     holding a source on "junk"); talking about a post without forwarding
     it; a second grader; misses — a miss is not a post, so it stays with
     the weekly held-items sample or a "missed <link>" message.
   - *Preconditions and cost.* One Haiku call per message ≈ $0.001; the
     forward costs nothing. Numbered bullets are a post-format change —
     show it in the test group first. Build order: session table and the
     two tool definitions first, agreed with Anton, then code.
3f. **Dedup by story: nearest member, root guard** (G3) — *agreed with
   Anton 2026-09-05 while reviewing the all-articles sheet; measure first,
   ship only after he sees the numbers.* The sheet showed the same story
   nine times (Abdelaziz vs Kawa, Aug 7–11), posted three times, and the
   labels chained (57 → 49 → 34 → 30) the way the August dedup gate did.
   - *The unit is the story, named by its root* — the earliest article.
     In the `feedback` table `dup_of` always names the root, never a
     middle link (the writer resolves chains); "all duplicates of #30" is
     one query, "did the group see it" the same query filtered to posted.
     No schema change.
   - *The gate.* A new headline joins story S when (1) its nearest
     **member** of S — posted or held, translations included — is above
     T_member (today's 0.80), **and** (2) it is not a stranger to the
     **root** of S: above a lower T_root. (2) is what stops drift
     (docs/decisions.md#posted-anchors) and lets held members anchor
     again, which the posted-only rule gave up. The hold is recorded as
     "dup of story S via member M". Root-only anchoring was considered
     and rejected: a Ukrainian rewrite sits far from the English root and
     near the Ukrainian member.
   - *T_root is measured, not guessed.* From the sheet's ~250 labelled
     memberships: similarity of every true member to its root (the
     genuine low tail is translations) versus the drift cases and Anton's
     "not the same story" overturns. Bench table per (T_member, T_root):
     members caught, members missed, strangers admitted. Guess for scale
     only: 0.65–0.70. If the two distributions overlap badly the guard
     belongs in the matcher, not the embedding.
   - *Floor.* Same fact, no shared words (weigh-in in Ukrainian and
     English) stays the matcher's job; the story labels are its test set
     too — human clusters versus claim clusters is a direct matcher
     measurement.
   - *Order.* After the feedback table is written (3e's first step):
     research/labels/export of memberships → bench step `story` (offline, one
     SELECT for embeddings, no LLM) → the table in front of Anton →
     then the gate.
   - **MEASURED 2026-09-05** ([docs/grading/2026-09-05-story-gate.md](docs/grading/2026-09-05-story-gate.md);
     `research/labels/export-stories.js` → `research/labels/measure-story-gate.js`, pure
     replay in `research/labels/story-gate.js`, 674 articles, 341 labelled repeats,
     333 first arrivals, 7-day window, cascade included). Three findings.
     **(1) The root guard does not separate.** A genuinely new story that
     resembles an old one sits as close to that story's root (median
     0.825) as a true repeat does (median 0.817); T_root 0.55–0.70 changes
     the counts by a handful either way. The 19 useful lookalikes are
     *connected* stories — a reply to a callout, a coach answering a
     coach, an analysis after an analysis — and no embedding threshold
     tells "same fact" from "same topic". The guard belongs in the
     matcher, as anticipated. **(2) Today's rule posts half the repeats
     again.** Posted-only anchors at 0.80 hold 173 of 341 repeats and post
     168 as new, swallowing 7 useful stories. **(3) All anchors at 0.85
     beats it on both counts**, cascade included: holds 247 (72%), posts
     94 again, swallows 5 useful stories. 0.82 holds 292 and swallows 13;
     0.80 holds 302 and swallows 19. Both knobs are env-overridable today
     (`DUP_ANCHORS_ALL=1`, `SEMANTIC_DUP_THRESHOLD=0.85`), so the first
     step is a config change, not a deploy. Caveats: the labels for
     bucket-3 chains were weak — three garbage-bag stories (#308, #16,
     #569) were split by headline before measuring, and more may exist;
     junk swallowed by junk is not counted as a cost. **Anton's call:
     switch to all anchors at 0.85 now, and build the 0.78–0.85 band
     question for the matcher ("same fact, or a reaction to it?") as the
     next step.** Not changed. The full menu of options, incremental to
     architectural, with cost estimates and a recommendation:
     [docs/story-matching-options.md](docs/story-matching-options.md).
   - **B AND D MEASURED 2026-09-06** ([docs/grading/2026-09-06-story-matching.md](docs/grading/2026-09-06-story-matching.md),
     local branch `measure-story-matching`, nothing deployed). **B alone
     does not move the gate**: bodies (167 of 315 fetched, the rest 403)
     make repeats and connected stories closer in equal measure; the best
     body threshold (all anchors 0.88: 235 held / 106 missed / 5
     swallowed) equals A. **D wins clearly**: stories as objects, top-3 by
     embedding, one Haiku call — with bodies holds 307 of 341 repeats,
     places 244 correctly (A: 97), misses 34 (A: 94), swallows 10 useful
     (A: 5; 9 of the 10 are Anton's labels, mostly fight-week previews
     folded into the odds story). Measured cost $1.74 per 674 articles,
     about $2.30 a month, under a dollar over what the matcher spends
     now. Weak joint: the true story is outside the top three for 65 of
     341 repeats; try top-5. **Anton's call: build D (with B as its
     input), or ship A now and D after.**
   - **BUILT 2026-09-06 evening** (Anton: "if A is a stopgap, implement D
     with B inside now"; branch `measure-story-matching`, not deployed;
     docs/decisions.md#stories-as-objects): `stories` table + `items.story_id`,
     bodies fetched before the decision, headline + body embedded, top-3
     stories of 7 days offered, the matcher answers join / new / reaction /
     wrong_subject; the threshold gate is the fallback at 0.85 on all
     anchors. Backfilled 193 stories over 624 articles. **Real code, one
     pass (research/bench/story.js): 309 of 346 repeats never posted, no useful
     repeat missed, 5 useful swallowed (#598 → #490 the one that matters),
     2 useful articles newly dropped as wrong subject (#5, #366), $3.48 a
     pass ≈ $4.65 a month.** Before a deploy: the bucket regression (not
     run — TEST key at $13.97 of the shared $20), a look at #5/#366, and
     Anton's content review of the rules block.
3g. **Do not post Eurosport links** (G2) — *Anton, 2026-09-05: "we should
   not post Eurosport to chat coz looks like we can't read it from the US."*
   eurosport.es geoblocks US readers (Anton hit it on #47, #82, #86, #121,
   #676); our fetcher gets no body either (17 headline-only rows in the
   all-articles sheet). Shape to decide: when a story's root is Eurosport,
   post another member's link instead (the story rule from 3f makes that
   easy); if Eurosport is the only outlet, hold or post title-only. Not a
   blocklist for judging — the article still counts as news, only the link
   changes. Not built; Anton's call on the shape.
3h. **Decode the Google URL before the early dup hold; give held items a
   body** (G1, G3) — *diagnosed 2026-09-05 while chasing the "identical
   re-ingests" in the all-articles sheet (#49/#57, #70/#71, #91/#92,
   #97–#102, #109/#119, #114/#133, #189/#193).* The url hold did not fail:
   it never got the chance. `hunter.js` runs the embedding gate (early
   hold, line ~354) BEFORE `extractBody` (line ~366), so an item held as
   an embedding dup is stored with its wrapped Google URL, no
   `resolved_url` and no body. Measured since Aug 9: **206 embedding
   holds, 4 resolved, 2 with a body**; every other outcome is ~98%
   resolved. So the direct-feed copy arriving later matches nothing and
   is held by embedding too — 12 same-address pairs in the archive, none
   posted twice, all noise. The bigger cost: **197 of the 315
   headline-only rows in the review are embedding holds by construction**
   — the readers, and any future dedup-by-story, judged them blind. The
   decoder itself works (all four sample URLs decode in ~250 ms via the
   slow path; `decode-failed` is 10 rows total). Proposed shape: decode
   (cheap, no LLM) before the early hold so the address is known; fetch
   the body for held items too (~200 page fetches a month) so the story
   labels and the feedback bot see text. Also from the same pass: of the
   23 held-but-real-news rows, **12 were held by the matcher with a body
   in hand** (Donchenko interviews, opinion pieces, lifestyle — the
   bucket rules Anton set this week are not in the matcher's prompt), 10
   by the embedding gate (the "connected story" cases 3f measured), 1 by
   wrong-subject. **Done by construction on the 3f branch (2026-09-06):**
   the body step now runs before anything is judged, so every stored item
   has its decoded address and its body when the site allows it.
3i. **Betting odds, extracted and printed in the message** (G2, wanted) —
   *Anton, 2026-09-06, judging the fight-week pieces: "I maybe want to see
   betting odds posted from a western company like DraftKings … And really,
   I'd prefer bets extracted in the future and posted in a message."* Today
   an odds article is a link like any other (#594 posted, #474 held as
   junk). Wanted: when a fight-week article carries a line for a watched
   fighter, pull the numbers out of the body (fighter, price, bookmaker,
   date) and print them in the post — "Odds: Donchenko −150 / Soriano +130
   (DraftKings, Sep 4)" — instead of, or under, the link. Western books
   preferred; a Ukrainian bookmaker's blog was not wanted. The matcher
   already reads the body, so this is one more field in its tool, plus a
   line in the message builder; a `facts.odds` field on the claim keeps the
   numbers. Separate stories per bookmaker, per the 09-06 ruling in
   docs/article-feedback.md. Not built.
3k. **A cheaper decider, measured** (cost; asked by Anton 2026-09-06: "It
   makes me want to switch to a cheaper model from another vendor … I don't
   care where my data is routed since it's news anyway") — the live bot's
   one Haiku 4.5 call costs about $4.75 a month at 900 articles; the bench
   costs $3.50 a pass, and that is what limited today's measuring. Add a
   second matcher backend behind the deps seam (one module; the prompt and
   the tool schema stay), then run the story gate (three passes) and the
   bucket regression on it and put the tables beside Haiku's. Candidates by
   price per million in / out (list prices, September 2026, verified by
   search): Gemini 2.5 Flash-Lite $0.10 / $0.40 (retires 2026-10-16; 3.1
   Flash-Lite $0.25 / $1.50 after) · DeepSeek V4 Flash $0.22 / $0.66
   off-peak, double at peak · Qwen3.8 Flash $0.14 / $0.42 (Singapore
   endpoint; Beijing 60–70% cheaper) · Qwen3.5 Flash $0.10 / $0.40 · GLM-4.5
   Air $0.20 / $1.10, GLM-4.5-Flash free · GPT-5 nano $0.05 / $0.40 · Kimi
   K2.5 $0.60 / $3.00. Gemini first: already a vendor here (embeddings), free
   tier may cover our volume, forced function calling supported. The
   decision is the bench's, not the price list's: a model that judges "same
   news" worse is dearer than Haiku at any price. Anton's ruling (2026-09-06, in
   chat): privacy is no factor for news and an open-source prompt;
   production cost is not the worry, the testing loop is — "we will do
   probably far more testing than we had done before … tune this pipeline
   to the highest precision possible". So: **Qwen3.8 Flash on the Beijing
   endpoint as the primary candidate, Gemini Flash-Lite as the comparison**;
   the model we tune on is the model production runs, so the first job on
   either is to reproduce today's tables (story gate, bucket regression)
   before any tuning. Gemini's free tier (30 requests a minute, 1,500 a
   day on Flash-Lite) covers production and nearly a bench pass a day;
   Qwen's free quota (1M tokens per model, Singapore only, 90 days) covers a
   smoke test, not a pass. Not built.
3j. **Levels of authority for who is speaking** (G2) — *Anton, 2026-09-06,
   on #382/#379 (a journalist and a UFC analyst assessing Topuria): "which
   is not really authority for me … maybe we need to establish different
   level of authority."* The 09-05 rule made "others assessing him" bucket
   2 without asking who the other is. Proposed levels, to confirm with him:
   the fighter and his own team (trainer, manager, coach) · the promotion
   and officials · fighters and coaches who face him · journalists and
   analysts. The last level may not earn a post on its own. Once ruled,
   the matcher's `subject_role` gets a sibling field (`speaker_level`) and
   the bucket rules in goals.md say which levels post. Not decided.
3l. **Does URL dedup miss the same page under a dressed-up address?** (G3) —
   **CONFIRMED with a live pair, 2026-09-18.** Items **#773 and #790** are one
   Sport.ua article, id `904629`, fetched twice:

       https://sport.ua/uk/news/904629-donchenko-peremig-soriano-…
       https://sport.ua/uk/amp/news/904629-donchenko-peremig-soriano-…

   The second is the **AMP edition** — same page, `/amp/` inserted in the path.
   Both arrived via Google News with different `rss/articles/` wrappers, so the
   raw URLs never matched and neither did the resolved ones. Worse for any
   body-based fallback: the AMP copy carries **3,196 characters against 10,000**,
   so the two are not even textually identical. Found while spot-checking the
   role-questions experiment, where both were classified separately and both
   would have been sent. A canonicalisation rule that strips `/amp/` (and
   `?amp`, `.amp`, `/amp` suffixes) would have caught this one.
   —
   found 2026-09-14 while fixing the grader's same-page marks (branch
   measure-story-matching, `grader/twins.mjs`). In the 2026-09-10 snapshot, 15
   pairs of stored articles in the same story are one page under two
   addresses: 12 differ only by a trailing slash (boxingnews.com, e.g.
   `/news/topuria-manager-blasts-abdelaziz-nurmagomedov` with and without `/`),
   2 by `utm_*` tracking parameters (bjpenn.com RSS), 1 by a `?ref=` referral
   tag (sherdog.com). Both copies were stored, which suggests the run's "drop
   anything already seen, by URL or resolved URL" step compares addresses
   exactly. To do: read that step (hunter.js "held as url dup", lib/db.js) and
   confirm; count normalized-address twins in the production archive, and how
   many were posted (SELECTs only); if real, an additive normalization with
   tests, measured, not deployed. The grader's `addressKey()` is a reference
   (strip trailing slash, `utm_*`/`ref`/`fbclid`/`gclid`, fragment; keep
   page-selecting parameters), but the pipeline must not import the grader.
   Not checked.
3m. **A follow level per fighter, applied in code** (G2) — *Anton, 2026-09-14,
   grading S2 (Masvidal: Amosov a "nightmare" for Makhachev): worth sending
   for him because Amosov is from Ukraine, as he and his group are — "I'd like
   … to be able to grade neutrally, but then … a setting that could ratchet up
   importance … if it's Amosov or Donchenko, then we're going to send a little
   more news … and could be not a LLM decision."* Grading stays neutral: the
   grader's "worth sending?" now asks for the news as if about any watched
   fighter, and his own pull goes in "personal interest". The preference
   becomes a per-fighter setting in the watchlist (e.g. a close-follow level
   for Amosov and Donchenko) that the posting decision reads — pure code, the
   same place as postOutcome() — lowering the bar so a borderline story about
   a close-follow fighter still posts. Measure before building: apply the rule
   to his neutral grading plus personal interest and count the extra posts per
   fighter. Sibling of 3j (who is speaking) — both are levels the code applies
   after the matcher classifies. Not built.
3n. **Standing is not access — and it may need its own question set** (G2) —
   *Anton, 2026-09-18, on the speaker ruling: "We should mark it a future
   setting perhaps, fine for now. This seems like it will need a mode
   differentiated questions set."* **Marked, not built. The 3j/3m rule as
   shipped is fine to run on.**

   **The crack.** 3j ranks speakers by *standing* — who are you to judge him.
   Measured 2026-09-18 in the role-questions experiment: that is only half of
   what the ranking is actually doing. Two articles the speaker filter drops:

   - *Merab: "Topuria está bien y con una actitud muy positiva"* — an update on
     his recovery
   - *Tsarukyan picks surprising name for Topuria's next opponent*

   Merab is `another_fighter` by role and so scores near the bottom, but he had
   **been to see Topuria**. The news is his firsthand knowledge of the man's
   condition, which has nothing to do with his standing to judge him. A Fable
   reviewer reached the same point unprompted and put it best: *"I bucketed on
   what he knows, not what he is."*

   So the speaker question is two questions wearing one coat — **standing** (who
   are you to judge him) and **access** (do you actually know something). Asking
   only the first mis-drops exactly the articles where a low-standing speaker has
   real information, which is a small pile but a valuable one.

   **The mode-differentiated set.** A single fixed question set has to serve
   every article, so it asks each question at the blandest useful altitude. The
   alternative is a cheap first pass over everything plus a second, *different*
   set fired only at articles that need it — here, "does this speaker have
   firsthand access?" asked only where standing is low but something substantial
   is being said. **Cost makes this practical rather than theoretical:** JEV
   measured at **$0.04 per million input tokens** and **0.22 s median latency**,
   so a second pass over a few dozen articles is rounding error. The whole
   12-pass experiment over 300 articles cost $0.52.

   **Before building:** the standing/access split has been observed, not
   measured — nobody has counted how many articles it actually costs us. Count
   that first over the frozen sample in
   `research/experiments/2026-09-17-role-questions/`, where the answers already exist.
   Sibling of 3j (who is speaking) and 3m (follow level per fighter); all three
   are levels the code applies after classification, and this one is the first
   that may need the classifier asked a second question rather than the code
   reading the first answer differently.

4. **Active verification via web search** (G4, and G2's stale-event clause) —
   concept discussed 2026-09-03/04, no design yet. On a new fight claim, search
   for it and sort results by domain trust: official domain confirms,
   reputable outlets corroborate, everything else is noise. The same tool
   resolves event dates (unblocks #5) and runs the G1 recall probe. The real
   work is the domain trust list, not the search call. Architectural: needs a
   spec before code. **Key handling (Anton 2026-09-04):** the search call uses
   its own Anthropic key (`ANTHROPIC_SEARCH_KEY`, test twin
   `ANTHROPIC_SEARCH_TEST_KEY` in `research/bench/.env.bench`) so console cost splits
   LLM from search. Secret Manager sits at its free-tier ceiling of active
   secrets, so the production key must NOT become a sixth secret — fold it
   into an existing one (JSON, the way `TELEGRAM_CHAT_IDS` travels) or replace
   a version.
5. **Stop old fights posting as fresh news** (G2) — needs event dates reliably in
   `claims.facts` first; facts extraction is measured-weak (8/13 claims empty,
   never evaluated). Search (#4) may get the date directly instead. The
   5-phase-2 recency bullet holds the details.

6. ~~**The bench runner**~~ — **built 2026-09-04** ([research/bench/README.md](research/bench/README.md)):
   `research/bench/run.js --step tier|matcher|extract|untrusted` over the corpus or any
   JSON in its shape, on the TEST keys and the bench database, table out plus
   a run record; `research/bench/reset.js` empties the schema and can restore a daily
   backup into it. Smoke-tested the same day (tier offline, one real matcher
   call on the test key, reset). Still to come, in order: the scoring harness
   (K repeats, per-class rates), a `full` step driving `huntSubject` into the
   bench database, recorded-LLM replay, `--sink` to the throwaway group.

Below the line, deliberately: nothing at the moment — the GCS backup shipped
2026-09-04 as the precondition §8 sets for any destructive migration.

## Safety (Anton, console)
- [x] **GCP budget alert (2026-08-09):** $5/month, project-scoped, email tripwire at 50/90/100/150% to the billing admin (`${ALERT_EMAIL}`). Created via `gcloud billing budgets create` (Billing Budget API enabled to allow it). `max-instances=1` still caps compute physically; this is the visibility layer on top.
- [x] **Anthropic hard spend cap (2026-08-09):** set to $5/mo (Anton, console.anthropic.com). The one cap that truly matters — LLM API is the only real runaway risk (spec §16.4).

## Housekeeping
- [ ] **Matcher eval, and the temperature decision it exists to settle (designed 2026-08-09; corpus BUILT 2026-08-11, scoring harness still missing):** the deterministic suite stubs the matcher everywhere on purpose, so nothing measures the real thing. Design: labelled items drawn from the `items` archive (where the right verdict is already known), each run K times, scored as a **pass rate with spread** — never pass/fail, because the item below makes a single run meaningless. Run on demand when the prompt changes, never on commit. Its first job is the open question directly below it: run the corpus at the API default and at `temperature: 0`, compare rates, and the decision stops being a guess. Deliberately built *after* the deterministic suite — an eval with no prompt change to measure is instrumenting-and-never-looking (§1).
  - **[x] The corpus exists: `research/corpus/` (2026-08-11).** 48 labelled articles — 25 `tune` / 23 `holdout`, split per class so both sides see every class, across eight classes (`announcement`, `claim_news`, `assessment`, `context`, `orbit`, `lifestyle`, `wrong_subject`, `duplicate`). `build.js` regenerates both files from the live table and is where the labels and their reasoning live; the JSON is the artifact. **Labels are what the system SHOULD answer, not what it does** — `a110`/`a115`/`a116` all record `production.digest_tier: 'main'` against `expect.digest_tier: 'tangential'`, so the corpus is red against today's code by construction. Six items are fabricated (`s1`–`s6`, `synthetic: true`, `*.invalid` URLs) because the archive cannot supply what they cover: an Amosov or Topuria announcement, any confirmation at all (zero in the archive, so nothing else exercises `confirmClaim` or the 🚨 ceremony), the rumor/reported/official gradient, and an adversarial near-miss about Ilia's brother. Known gaps are written down in `research/corpus/README.md` rather than left to be rediscovered — thin classes, one real announcement cluster, no `injury`/`result`/`denial` items, and only the three current watchlist subjects.
  - **Still to build: the scoring harness.** Load a split, run each item K times through the real matcher, compare against `expect`, report per-class rates with spread. Two constraints it must respect, both already load-bearing: score as a **rate**, never pass/fail (the nondeterminism item below); and **never tune against `holdout.json`** — its only value is having never been used. Natural first home is the sandbox test bench (Housekeeping), since "throw a corpus at the engine and see what it does" is the same machinery.
- [ ] **Sandbox test bench (aligned with Anton 2026-08-11, not built):** a standing instance of the engine — its own DB branch, its own Telegram chat, its own logs — with an input hatch, so a collection of articles can be thrown at it and the reaction watched. Exists because announcements are too rare to develop against: Donchenko's was the only one, and the next Amosov one may be months away. Shape as agreed:
  - **2026-09-04: items (1) runner and (2) reset are built — see priority 6 and research/bench/README.md; the runner exercises one step at a time rather than driving `huntSubject`, which is the `full` step still to come.** Earlier state, for the record: **State as of 2026-09-03 — credentials exist, zero code.** A 2026-08-12 session prepped `research/bench/.env.bench` (gitignored, live values): a dedicated `bench` database on the Neon main branch, test-only Anthropic/Gemini keys, and a throwaway Telegram group (`BENCH_CHAT_ID` — sidesteps the `TELEGRAM_CHAT_IDS` third-key idea below, which may now be unnecessary). `research/bench/runs/` is empty and nothing in the repo references `research/bench/`. Remaining work, in build order agreed with Anton: **(1)** the runner — load a JSON article file, drive `huntSubject` with overrides (`hoursBack: Infinity` per the trap below), record every decision to `research/bench/runs/`; **(2)** the reset — one command back to empty schema, without which run #2 is eaten by dedup; **(3)** the scoring harness (the matcher-eval item above — compare a run against corpus labels, K repeats, per-class rates); **(4)** recorded-LLM replay mode; **(5)** the URL-list producer (lowest — corpus + hand fixtures cover most needs). Items 1+2 are the minimum useful bench; `scripts/verify-digest-tier.js` is the working precedent for driving the pipeline through the seam.
  - **Resettability is the defining requirement, not a convenience.** Tuning means running the same corpus twice, and Gate 1 drops any URL already in `items` while Gate 2 holds anything near it — so a second run of an unreset bench produces silence and reads as "your change broke everything". A Neon branch is copy-on-write and cheap to re-cut, so "reset" can mean delete-and-re-branch rather than cleanup SQL.
  - **One input shape, three producers.** The engine only ever accepts a file of article records; those come from exporting archive rows, fetching a URL list, or hand-writing fixtures. `research/corpus/*.json` is already that shape. Hand-written matters most — it is the only way to test an Amosov announcement before it happens.
  - **Live-or-recorded LLM calls, switchable.** Live answers "is the matcher any good at announcements"; recorded (capture once, replay after) answers "does this threshold do what I think" with the sampler held still. Different questions, both wanted.
  - **A dedicated test chat, never the group.** `TELEGRAM_CHAT_IDS` gains an optional third key (`test`); `parseChatIds` keeps its refuse-don't-limp contract — validate if present, tolerate absent. AGENTS.md's "never post to the group from a dev session" stands unchanged.
  - `huntSubject(db, subject, items, overrides)` already injects `dryRun`, `chatId`, `sendMessage`, and `store` (hunter.js:262) — `scripts/verify-digest-tier.js` uses that seam today, so the bench needs no new plumbing in the pipeline.
  - **Two traps found while mapping the code to the docs (2026-08-11), both certain to fire on the first bench run:**
    - **The 24-hour window eats the corpus.** `fetchFreshItems` (hunter.js:109) filters `directItems` against `Date.now() - hoursBack` before Gate 1 sees them, so every corpus article — all of them weeks old — is dropped with no row, no log line, and no error. The symptom is an empty run that looks exactly like "nothing matched", which is the most expensive kind of silence to debug. `hoursBack` is already in the `deps` bag, so the fix is `overrides: { hoursBack: Infinity }` at the bench boundary, not a change to the pipeline. Restamping fixture dates was considered and rejected: `publishedAt` is what `digestLine` prints as the article's age, so faking it to clear a filter would make every bench post lie about how old its source is.
    - **Corpus bodies are already-extracted text, not HTML.** Passing them as `feedContent` runs `htmlToText` over prose that has no tags — harmless, but it means a bench run exercises rung 0 of the extraction ladder and never the real one. So the bench measures the matcher and the tier rule honestly, and says nothing about extraction. Worth stating out loud before a green bench gets read as "the pipeline works".
- [ ] **Matcher nondeterminism (noted 2026-08-09; MEASURED properly 2026-08-11):** `lib/matcher.js` never sets `temperature`, so the Haiku call samples at the API default. First evidence was thin — 4 runs on one synthetic item, NO_CLAIM x3 / NEW x1. Now measured over the real corpus: **48 items x 5 runs = 240 live Haiku calls**, read-only against the database (one `activeClaims` SELECT for the candidate lists, connection closed before any LLM call), nothing written anywhere, ~$0.30.
  - **`subject_role` is steadier than feared: stable in 43/48 items (90%), and the modal answer matches the corpus label in 40/48 (83%).** The five unstable items are `a3`, `a4`, `a18`, `a29`, `a37` — and with one exception the disagreement is `central` vs `supporting`, which no rule currently acts on. They are also the items that were genuinely hard to label by hand, which is mild evidence the model is wobbling where the truth is wobbly rather than at random.
  - **Only one item ever crossed the line that matters** (labelled not-`passing`, answered `passing` at least once): the Sport.ua Donchenko announcement, 3/5 runs — and its modal *verdict* was `WRONG_SUBJECT`, so it is dropped before the tier rule rather than folded by it. See the furniture bullet under step 4; it is a different bug and it predates the reorder.
  - **Verdict accuracy looks much worse (28/48, 58%) and is probably a labelling artifact, not a Haiku failure — unresolved.** The pattern is one-directional: the label says `NEW`, Haiku says `MATCH` (`a16`, `a1`, `a50`, `a43`, …). The labels were written as if each article arrived into an empty world, but the run fed Haiku the *real* candidate claims the database holds, where `MATCH` may well be the correct answer. **Do not treat 58% as a finding until this is settled** — resolve it by re-reading those items against the claims they matched, then either fix the labels in `research/corpus/build.js` or record that Haiku over-matches. Whichever way it lands is worth knowing: over-matching would mean real stories being silently absorbed as echoes of existing claims.
  - Setting `temperature: 0` would tighten all of this; still not done, because the thresholds in `lib/tier.js` were measured against the sampled behaviour. The corpus now makes that comparison cheap — run both settings, compare rates.

- [x] Hunter failure notifications (2026-08-06): Cloud Monitoring alert → email on failed job executions; plus in-code self-report — hunter DMs Anton (never the group) on fatal errors. Sentry evaluated, skipped: error volume too small to gain from it; revisit if multi-agent steps make failures subtle.
- [x] Destroy webhook-secret v1 (2026-08-09): the newline-bugged dead version. `gcloud secrets versions destroy 1 --secret=telegram-webhook-secret`. Frees a Secret Manager free-tier version slot; v2 (live, mounted) untouched.
- [x] **Daily DB backup to GCS — SHIPPED 2026-09-04** (designed hourly 2026-08-08; daily after measuring the free tier against an 8.5 MB database with poorly-compressing embeddings). `lib/backup.js` + `scripts/restore-backup.js`; bucket `fighter-bot-504723-backups`, 30-day lifecycle delete + 30-day retention policy; runs on the 11:17 UTC hunt. History: docs/decisions.md#gcs-backup. Still open: the compute service account is `roles/editor`, so create-only is the retention policy's doing, not IAM's.
- [x] Delete the `hello` crash-course service (2026-08-06)

## Build sequence (spec §9, cloud-first per §16)
- [x] 1. Delivery rail — dummy bot live end to end (2026-08-06)
- [x] 2a. Raw hunter: Cloud Run Job `fighterbot-hunter`, Google News RSS per fighter (Latin + Cyrillic aliases), posts raw to group, manual trigger (2026-08-06)
- [x] 2b. Hunter memory + schedule: Neon Postgres + pgvector, URL dedup, hourly Cloud Scheduler cron (2026-08-06). Supabase → Neon (spec amendment: free-tier fit, auto-resume).
- [x] 2c. Semantic dedup live (2026-08-06): gemini-api-key mounted, 9 rows backfilled, threshold tuned 0.85→0.80 on measured data (translated pair 0.841, unrelated ≤0.702). First production catch: re-issued URL held at 0.98 similarity. Revisit threshold if false holds appear.
- [x] 2d. Gray-zone dedup — ABSORBED by step 5 matcher (MATCH-as-echo verdict IS the dedup decision); never built standalone.
- [x] **2e. Direct publisher feeds + article bodies — SHIPPED 2026-08-08.** Six verified outlet feeds (UFC official!, MMA Fighting, Bloody Elbow, Sherdog, Sport.ua uk, Marca es; MMA Junkie and XSPORT have no feeds), fetched once per run and filtered per fighter by surname stems both scripts. Google wrapped URLs decoded (zero-network base64 fast path covers all current tokens; batchexecute slow path + circuit breaker for new-style; best-effort, never fatal). Bodies via a zero-dependency ladder (feed content / JSON-LD articleBody / article-tag / paragraphs / og:description, rung logged as telemetry) fetched ONLY for matcher-bound items (spec §11 shallow-before-deep). Matcher reads a 1200-char excerpt; archive items get Google's related-coverage cluster from `rss_description` instead. Full claims re-bootstrap ran (`RESET=1 COMMIT=1`, snapshot kept): 8 claims rebuilt, claim #4's garbled "Khabib Makhachev" fusion gone, Prates thread anchor re-attached, 5 drifted echo links deleted; audit after: argmax mismatches 7→2 (both deliberate matcher links), verify-drift 0. Watch: decode success rate; per-outlet 403s. The peripheral-mention watch item FIRED 2026-08-09 (three digest posts whose only "Topuria" was an alt attribute / URL slug / LATEST NEWS block) and was fixed same day: matchesFighter now searches reader-visible text only, and the matcher rules make furniture-only mentions WRONG_SUBJECT; still watch that prose-mention stories keep posting.
- [x] 2f. RSS retry with backoff (2026-08-08): one retry per feed after 30s on non-OK response (later 75s). Escalation path if 503s persist: jittered delay — the alternate discovery source now EXISTS (2e direct feeds run every hour), so a Google outage no longer blinds the run. **Corrected 2026-09-04:** it did blind the run until then — a failed alias threw the whole subject hunt, direct items included (06:21 and 08:17 UTC that day). Now a dead alias is skipped with a warning; docs/decisions.md#google-outage-degrades.
- [x] 3. Fighter filter (watchlist) — evidence 2026-08-08: namesakes are real (iRacing "Yaroslav Amosov", brother Aleksandre Topuria, keyword-stuffed junk). Identity check absorbed into the claims matcher contract (WRONG_SUBJECT verdict, see docs/architecture-overview.html §5). **Closed 2026-08-09:** watchlist-as-data landed as a side effect of the digest-tier work — `lib/fighters.js` pulled `FIGHTERS` out of hunter.js into its own shared module (was private, forcing `scripts/audit-digest-tier.js` to keep a hand-copied name list). Anton confirmed a `.js` module is data enough — no further move to JSON/DB needed. **Amended 2026-08-09:** still a `.js` module, but moved to a gitignored `watchlist.js` at the repo root (shape documented by `watchlist.example.js`). The trigger was open-sourcing, not engineering: who is tracked is the one genuinely personal thing in the repo. Each entry also gained optional `confusables`, so the namesake/relative hints that used to sit in the shared prompt — costing every subject the noise of every other subject's namesake — now reach only the subject they describe. **Amended 2026-08-10:** the gitignore was reversed and `watchlist.js` committed. Hiding the list while the walkthroughs quoted real headlines about the same people was a fiction rather than privacy, so everything is public and consistent instead; `watchlist.example.js` stays as the shape for anyone starting their own.
- [ ] 4. Relevance agent (importance scoring vs. threshold) — NOTE 2026-08-08: Mastra does NOT come in here or at step 5 (single structured calls don't need an agent framework); Mastra + TypeScript enter at step 6 (conversational responder = real agent shape). Step 4's classifier is absorbed by the step-5 matcher (claim type = classification).
  - **The absorption was only half true (measured 2026-08-09, `scripts/audit-digest-tier.js`).** Step 5 classifies *claims*; nothing scores *non-claims*, so the digest is the unscored remainder — and it is most of the feed: of 36 posted items, 24 were raw publisher headlines, 11 of those never naming the fighter in the headline. Claim-bearing articles get canonicalized and aggregated; the weakest items get passed through verbatim.
  - **Threshold measured, not guessed.** `scripts/backfill-bodies.js` took body coverage 4/60 → 49/60 by replaying the live decode+extract ladder over the pre-2e archive, so the rule could be tuned on real data instead of waiting a week. Result: **body mention COUNT separates cleanly** — among items with a usable body, claim-bearing articles name the fighter 2–12×, the junk cluster 0–1×. Rejected alternatives: name-in-headline alone (#26 is a real Amosov story headlined "30-1 UFC welterweight"; epithet headlines are routine) and first-occurrence position (#7 is legitimate with its first mention at 71% depth). The **300ch floor is load-bearing** — #12 is claim-bearing, unnamed in its headline, and scores 1× off a 141ch og-description blurb; without the floor the rule would demote a real claim source.
  - **Candidate rule** (`scripts/audit-digest-tier.js` evaluates it): demote when the headline does not name the fighter AND the body is ≥300ch AND it names them ≤1×. On the archive that is 6 of 36 posted items, 0 of them claim-bearing, and it catches all three of the 2026-08-09 complaints. Known residual: #23 names Topuria in a celebrity-listicle headline and never in the body — headline mentions are reader-visible so the rule keeps it; closing that needs a second rule and there is one example.
  - **[x] SHIPPED 2026-08-09.** Rule lives in `lib/tier.js`, imported by both `hunter.js` (the decision, keyed on `!isRealClaim`, right before `insertItem`) and `scripts/audit-digest-tier.js` (so re-measurement can't drift from what production runs). Tangential items fold into one "↘ Also mentioning: Source1 · Source2" line, deduped by outlet, instead of a bullet each — nothing dropped, still `posted=true`, still linked. A run whose ONLY posted items are tangential sends nothing (that empty shell is the exact noise the rule removes) and corrects those rows via a new `markUnposted()`. New `digest_tier` column (`'main'|'tangential'`, null for anything the digest never showed — held dups, WRONG_SUBJECT, MATCH). Confirmed the 6 archive demotions aren't a truncation artifact: 3 came from `feed-content` (the richest rung), 3 from `json-ld`/`article-tag` — none from the weak rungs. Found and fixed in passing: `digestLine` and the other three send sites interpolated `item.url` into an `href` unescaped, so a WordPress feed's bare `&` (utm params) would make Telegram reject the WHOLE message silently. Verified via `lib/tier.js` boundary cases, `digestLine`/`alsoMentioningLine` unit checks (both now exported), a live probe to the admin DM, and `scripts/verify-digest-tier.js` (a saved integration check driving `huntFighter` — also exported — with synthetic candidates through the real matcher/embedder, DRY_RUN semantics). Deployed; live execution confirmed `body_via` writes on a genuine new row.
  - Also shipped alongside: `body_via` column (`schema.sql`, `lib/db.js`, `hunter.js`, `scripts/backfill-bodies.js`) recording which extraction rung produced a body or which failure stopped it — closes the "Sherdog succeeds with a 75-char blurb and nothing shows it" gap. `lib/fighters.js` now holds the shared `FIGHTERS` watchlist (was private to hunter.js, forcing `scripts/audit-digest-tier.js` to keep a hand-copied name list).
  - **Cross-rail feed reuse — BACKLOG, not built.** When a Google-discovered article comes from an outlet with a direct feed, reuse the feed's article text instead of re-fetching (fixes all 5 Bloody Elbow 403s at zero network cost — its feed carries the full article, Google-discovered copies of the same story hit a 403 fetching it directly). Needs URL normalization the codebase currently lacks entirely (comparison is exact-string everywhere, and the same helper would feed Gate 1 dedup — get it wrong and dedup breaks). **Anton's constraint, record before building:** avoid hardcoding per-outlet fetch behaviour — it bakes in today's six feeds, and adding athletes may change which outlets, feeds, and extraction strategies matter at all. Design this generically or not at all.
  - **Junk-domain blocklist — considered and dropped**, not deferred. Of two `mshale.com` junk items, one (#39, an iRacing entry list under "Yaroslav Amosov") is a namesake — exactly what WRONG_SUBJECT exists to catch. A blocklist would paper over a matcher job.
    - **REOPENED 2026-08-15 — the pattern outgrew the namesake theory.** 23 mshale items since 08-07: every body fetch blocked (`http-403`, zero bodies ever extracted), 18 held `WRONG_SUBJECT`, **4 posted to the group** (#27, #39, #143, #198). #198 verified by eye in a browser: SEO keyword spam — "Yaroslav Amosov" appears only in the stuffed title and tag list, the body is three nonsense sentences with unrelated keywords. The matcher catches self-incriminating headlines ("GAME OF THRONES Yaroslav Amosov") and leaks exactly the vague ones — a headline-only judgment cannot beat keyword stuffing that contains the fighter's full name. Guard against over-fixing, measured the same day: of 13 posted-without-body items, **9 are legitimate** (incl. #191 Tribuna UA, Anton's explicitly liked article; Bloody Elbow, Diario AS, Eurosport all block fetchers too), so "no body ⇒ hold" would cost real news. The usable signal is **no body + this source's wrong_subject track record** — or a plain blocklist for mshale.com specifically. Shape is Anton's call; not built.
    - **SHIPPED 2026-09-04** as `lib/untrusted.js` + `domainRecord` in lib/db.js + the veto in `classifyItem`; re-measured the same day over 597 items (`scripts/audit-untrusted-source.js`): mshale the only domain that trips, 4 posted spams caught incl. new #596, zero casualties. History: docs/decisions.md#untrusted-source. The design as approved, for the record:
    - **DESIGN APPROVED 2026-09-03 (Anton) — the untrusted-source rule, general shape chosen over a blocklist.** Hold an item (never post it) when ALL THREE hold for its domain: **≥5 prior archive items**, **≥50% of them held `wrong_subject`**, and **zero bodies ever extracted**. Keyed on the domain of `resolved_url ?? url`, never the display source name — the spam arrives as both "Mshale" and "mshale.com", and unresolved Google items (115 of 329) pool under `news.google.com` where the mixed stats mean the rule can never fire (safe direction: can miss spam there, cannot hold real news). Ratio-alone was measured and **rejected**: Bloody Elbow runs 35% `wrong_subject` and MMA Fighting 45% — normal for surname-filtered feeds — so a ratio rule sits one bad week from muzzling a real outlet; the zero-bodies condition is what separates spam (mshale: 0 bodies in 48 items) from blocked-but-real outlets (Eurosport: 0 bodies, 11% ws — passes). **Point-in-time replay over the whole archive (~430 items): holds 3 of the 5 posted mshale spams (#143, #198, #334; #27/#39 predate the 5-item floor — accepted cold-start cost), zero non-mshale casualties.** Mechanics: post-matcher veto in `recordOutcome` (so the matcher keeps growing the domain's record), `held_reason: 'untrusted_source'` (evidence kept, reviewable by check-ins), one aggregate store query + a pure three-condition function, kill switch `UNTRUSTED_SOURCE_OFF=1`, thresholds env-overridable. Self-disarms if a domain ever yields a body. Failure mode accepted with eyes open: a domain must first earn a majority-junk record before it can silently lose one real article, and the held row remains findable.
  - **The candidate list will outgrow the prompt (Anton's question, 2026-09-04) — promoted to priority 3d the same day.** `activeClaims` hands the matcher EVERY rumor/confirmed claim for the subject, sorted by embedding similarity to the article, uncapped: at ~50 claims across three subjects that is a few hundred tokens per call and the whole archive of what the group has been told, which is what MATCH needs. It grows without bound: a year of this is hundreds of lines per Topuria call, paid on every article and read by a model whose attention thins with length. The fix is already half there — the similarity ORDER BY exists — so it is a `LIMIT` (top 20 by similarity, say) plus an age-out for claims nothing has matched in months; both need a bench check that MATCH recall on the corpus's duplicate items does not drop. **Trigger:** any subject over ~40 active claims, or the bench's `spent:` line showing the candidate block dominating input tokens.
  - **A stronger model, if Haiku tops out (Anton, 2026-09-04) — parked.** The order is fixed: squeeze everything out of Haiku first (the bench now measures that: docs/decisions.md#claim-discipline took the tune split from 22/45 to 34/45 without changing the model). If a judgment step still cannot reach the goal, the candidate is not a pricier Anthropic model but a **higher-grade model that is still cheaper than Haiku** — Anton named the latest Chinese open-weight models on a cheap host as the kind of thing to look at. Two consequences for whoever picks this up: (a) a second provider is a new vendor, so it is ask-first (self-improvement §8) and needs its own test/prod key split and cap; (b) the matcher's dependency seam (`deps.matchItem`) means a second model is a second function behind the same contract, and the bench's `--repeat` scoring is how the two get compared on the same corpus before anything switches. **Trigger:** a bench result where the remaining misses are judgment the prompt cannot fix, measured, not felt.
  - **Escalating gray-area tier calls to a stronger model — DEFERRED, with the trigger written down (Anton's idea, recorded 2026-08-10).** The shape: when the tier decision is a coin flip, spend a cheap call on a higher-order model — possibly a *second provider*, so the second opinion is genuinely independent rather than the same family agreeing with itself. Not built, and deliberately not: nothing has yet shown Haiku is the weak link, and building a second judge before measuring the first is instrumenting-and-never-looking (§1) — the same reason the matcher eval waited for a prompt change to measure. **The trigger that promotes this into work:** `scripts/audit-digest-tier.js` (new `COUNT RULE × subject_role` section) showing Haiku misjudging `subject_role` on real items — calling articles central/supporting that are plainly background colour, or passing on articles genuinely about the subject. Until that shows up, the **measured mention-count rule is the safety net**: `digestTierFor` ORs the two signals, so a wrong "central" cannot rescue junk (the count rule still demotes it) and only a wrong "passing" can demote a real story — section (b) of the audit lists exactly those, so the failure mode that matters is the one already under a microscope. Same escalation pattern already noted for canonical-text flubs at step 5 ("Sonnet escalation if pattern"); this one gets a named instrument first.
  - **A media-embed URL is positive evidence of no article — candidate rule, NOT built (noted 2026-08-10, from item #106).** #106 ("UFC 328 Highlights: Joel Alvarez vs Yaroslav Amosov", 247Sports) reached the group as a full `main` headline carrying nine words and nothing else. The decoded URL was `247sports.com/embed/video/<base64>`, the fetch returned 406 (`body_via: 'http-406'`), and the base64 behind it is a bare player shell — `{"siteKey":1407,"id":"…","url":"","videos":[]}`. There was never any prose to miss. That distinction is the whole rule: a 406 is *absence* of evidence, which `lib/tier.js` is deliberately built never to demote on, but "this URL is a media player" is *positive* evidence of no article — the same category as `subject_role: 'passing'`, so it can demote with no body floor and without touching a measured threshold. Would have folded #106 into "Also mentioning" instead of headlining it. Independent of the matcher verdict, which matters given the nondeterminism item above. **Respects Anton's no-per-outlet-behaviour constraint (§4 cross-rail bullet) only if written as a URL-*shape* rule** — an `/embed/`, `/player/`, or `/video/` path segment on the resolved URL — never as "247Sports does this"; if it cannot be stated without naming an outlet, don't build it. **Trigger:** a second embed-shell item reaching `main`, visible as a `main`-tier row with `body_via: 'http-4xx'` and an embed/player path in `resolved_url`. One example is not a rule.
  - **`subject_role: 'passing'` should outrank the headline escape — Anton's call 2026-08-11, BUILT 2026-09-04 (docs/decisions.md#tier-reorder).** The trigger written into the escalation bullet above has FIRED, and not the way it was expected to: the failure is not Haiku misjudging the role, it is the role being *discarded*. Every post since `subject_role` shipped was decided by the headline escape alone — #106 (`central`, a three-month-old fight), #110, #115, #116 (all three `passing`, all three given full headlines), with `0 tangential` on every run. The residual-#23 assumption that headline mentions are a rare edge case inverts for a subject whose press is name-rich: for Topuria's `es` feed the escape is not an escape hatch, it is the main door. Fix is a one-line reorder in `digestTierFor` (check `passing` before `mentionsName`), behind an env kill switch (`TIER_PASSING_OVERRIDES_HEADLINE`) so a bad matcher day is revertible without a deploy — `TIER_MAX_MENTIONS` already sets that precedent. Risk to weigh, not ignore: a wrong `passing` now demotes a real story *despite* the headline; a null/failed matcher keeps the old behaviour byte-for-byte, and `scripts/audit-digest-tier.js` section (b) already lists exactly the wrong-`passing` cases. Re-measure over the whole archive before deploying — the corpus (`research/corpus/`) labels all four posts as `tangential`, so it scores this change directly.
    - **MEASURED 2026-08-11, both orderings side by side, nothing deployed.** `digestTierFor` is a pure function, so the replay needed no LLM call and no repeats — three runs were byte-identical, which is the point: the variability everyone worries about lives in the matcher, and its answer is already frozen in `subject_role`. Corpus (33 of 48 items; the rest expect a drop, so the tier never runs on them): **current 21/33 correct (64%) → proposed 29/33 (88%)**. Eight items change tier, **all eight in the right direction, zero regressions**. Over the live archive only **3 posted items** change — #110, #115, #116, exactly the three Anton objected to. That number is small only because `subject_role` shipped 2026-08-10, so just 10 of 117 rows carry a role at all; it is not evidence the change is safe on older data, because older data cannot be tested this way.
    - **Four items the reorder does NOT fix, and they split into two distinct gaps.** `a25` (favourite restaurant) and `a48` (Ferran Torres in Ibiza) come back `central` — correctly, they *are* about him — and stay `main`; the role is the wrong signal to ask, these need `claim_type: lifestyle` to demote. `a37` (the recovery technician) and `a79` (French welterweight warning) come back `supporting`, which nothing acts on — the gap between `passing` and `central`. Both gaps argue for the mention-kind field rather than against the reorder, and both were visible only because the labels were written before the experiment.
    - **Announcements are structurally exempt — the reorder cannot fold one.** Worth writing down because it is not obvious and it corrected a wrong risk assessment mid-review: `hunter.js:472` reads `item.digestTier = isRealClaim ? "main" : digestTierFor(...)`, so anything the matcher turns into a real claim gets `main` unconditionally and never enters the tier function at all. Confirmed empirically — the ten announcement items in the corpus came back `central` in 5/5 runs each, except the Sport.ua one discussed in the furniture bullet below.
  - **Where folded items go: a scheduled mentions digest (Anton's call 2026-08-11) — BUILT 2026-09-04, trigger awaiting Anton's look at the format. History: docs/decisions.md#mentions-digest.** Demoting `passing` items only helps if they land somewhere. Today a run whose output is entirely tangential sends nothing AND never retries — `held_reason: 'tangential'` is a final decision, and Gate 1 means a later run will never re-offer the URL. With current traffic (one item per run) that means the three 2026-08-11 posts would have become silence, not quiet links. Carrying them to the next real digest was considered and **rejected by Anton**: for a recovering fighter the next real story may be weeks away, so carried mentions age out undelivered. Chosen shape instead — **two speeds of delivery**: real news posts immediately on the hourly run; folded mentions accumulate and ship on their own schedule. Daily beats weekly (a week of MMA-press mentions is a long list, and a stale "next Saturday" link reads dead); one combined message grouped by fighter, not one per fighter; nothing to send means nothing sent. Mechanically cheap — the hourly job already stores and marks these rows; the digest is a second Cloud Scheduler trigger that sweeps unswept tangential rows, posts once, and marks them delivered. Note this is spec §12.2's importance idea expressed as *timing* rather than as a threshold.
  - **A usefulness gradient inside the folded items (observed 2026-08-11, no rule yet).** Reading the three demoted posts in full, "passing" is not one thing: **assessment** (a rival coach breaking down Topuria's arsenal — #110, a real opinion about their guy, mildly useful), **context** (his loss retold as backdrop in someone else's preview — #116, in-domain but zero new information), **orbit** (his physio speaking at a city conference — #115, out of domain, one hop from the subject). #103 sits below all three: keyword adjacency, already dropped as `WRONG_SUBJECT`. Cheap uses first — order the mentions digest best-first, and let orbit items accumulate before deciding whether to drop them entirely. Automating it means one more matcher field alongside `subject_role`; **don't build that yet** — the digest makes misranking cheap, so let real examples pile up (the corpus already labels the axis as `expect.mention_kind`, so the data collects itself). Caveat that stops this being a clean rule: class alone does not rank an item. "Topuria's doctor speaks at a conference" is nothing, but "Topuria's coach says he returns in December" is orbit-shaped and genuinely news — it is class *plus* whether anything new is asserted.
  - **Site furniture can get real news DROPPED, not just mis-tiered — mechanism demonstrated 2026-08-11, zero victims so far, watch item.** Found while measuring Haiku's role stability over `research/corpus/`: `a18` (the Sport.ua Donchenko announcement, 8,230 chars of which the first ~1,900 are a site-wide nav menu) came back **`WRONG_SUBJECT` as the modal verdict over 5 runs**, with `subject_role: passing` 3/5. That is a genuine fight announcement being discarded as "not about this fighter", because the matcher's 1,200-char excerpt contains the menu and not the story. It is the same truncation that hid #116's Topuria paragraph, but with a worse consequence: `WRONG_SUBJECT` drops the item, and Gate 1 means it is never offered again. **Swept the archive for real instances and found none** — 15 `WRONG_SUBJECT` drops, 8 of them naming the fighter in the title, and all 8 are headline-only (`body_via: http-403`) Mshale keyword junk plus one division story (#64) where `NO_CLAIM` would have been kinder. So this is a mechanism, not a live wound. Two accidents are holding it back and neither is a fix: `a18` was caught by Gate 2 as a duplicate before the matcher ran, and announcements have so far arrived in clusters where at least one outlet published a clean page. **Trigger that promotes this into work:** a `WRONG_SUBJECT` drop on an item with a body over ~2,000 chars from an outlet with a real feed — i.e. extraction succeeded and the verdict still came back "not about them". The fix is not a bigger excerpt but a better-chosen one: lede plus a window around the subject's first mention (`lib/tier.js`'s `countMentions` already finds the positions), with the cuts marked so the model does not stitch across them. Changes every verdict's input, so it lands as a sandbox A/B over the corpus, not a tweak.
  - **Still open:** refining non-claim headlines themselves (the raw-headline pass-through remains for everything the tier rule keeps — closing it needs an LLM call per digest item, a separate, bigger decision).
  - **Alternative shape (2026-08-06, preferred so far):** classifier, not filter. Real feed volume is pleasant — nothing gets dropped; instead classify each item (fight announcement / result / interview / ...) and tier the *presentation*: announcements get their own ceremonial post (🚨🥊, bold card), possibly pinned (bot needs group admin) and loud, while digests deliver silently. First LLM call inside the hunter pipeline. "Where to watch" enrichment (Ukraine broadcast rights) joins later when web-search tools arrive (step 6) and appends into the announcement post.
- [x] 5. **Phase 1 LIVE (2026-08-08)**: claims + claim_sources tables; Haiku matcher (MATCH/NEW/NO_CLAIM/WRONG_SUBJECT/UNSURE, forced tool use); conservative lifecycle (confirm ONLY via ufc.com; no independence counting until 2e); posts: 🚨 ceremonies, 🕵️ rumor lines, ✅ threaded confirmations; bootstrap over archive done (7 claims, 23 links; Masvidal ×5, Donchenko ×5 clusters correct). Watch items: WRONG_SUBJECT is headline-limited (drops division news that doesn't name the fighter — 2e bodies fix); minor canonical hallucinations (Khabib/Islam flub) — Sonnet escalation if pattern.
  - [x] Verdict validation (2026-08-08): `normalizeVerdict` in lib/matcher.js gates every matcher answer — off-enum type → `other`, off-enum sourcing → `reported` (junk can never born-confirm), MATCH on a claim id that was never offered → UNSURE (also closes an FK-error path that would have killed the rest of that fighter's hunt). Ids compare as strings: pg returns bigints as `"7"`, the model answers `7`.
  - [x] Official sources bypass the dup gate (2026-08-08): Gate 2 ran before `isOfficialSource`, so an official confirmation — by construction a near-restatement of the rumor — was held as an echo and never reached `confirmClaim`. Audit says the bug never fired in production (0 official items ever held), so the fix is preventive; the Donchenko trap is now actually armed.
  - [x] Claim-drift guard on dup inheritance (2026-08-08): inheritance is transitive, so a 0.802 → 0.869 → 0.974 chain of held dups walked an Ali-Abdelaziz story onto an unrelated matchmaking claim (claim 4, 7 sources of which 3 were foreign). Held dups are now compared to the claim's own canonical text before linking; if another claim fits ≥ 0.10 better the item stays held but unlinked. Threshold measured over all 28 live links (drifted 0.107–0.214 vs correct-but-awkward 0.076–0.082). Matcher links untouched.
  - [x] `prediction` added to the type enum (2026-08-08, with 2e): the coercion warning recurred and claim #5 already carried the type. Predictions route digest-grade like quotes; three claims use it after the re-bootstrap.
- [ ] 5-phase-2 — **UNBLOCKED by 2e** (bodies + real URLs now flow): independence-based corroboration (attribution text like "as reported by MMA Junkie" is now readable), official denials → denied, supersede flow, edit-vs-reply for corroboration display
  - **Publication recency is not event recency — gap, nothing built (noted 2026-08-10, from item #106).** #106 is a highlights video of Alvarez vs Amosov at UFC 328, a fight that took place **2026-05-09**, re-uploaded 2026-08-10 and posted as news 7h later. No gate misfired: `published_at` was genuinely fresh and the subject was genuinely central. The archive even *held the date* — item #3 (posted 2026-08-07) is a wire caption reading "May 9, 2026; Newark, New Jersey … during UFC 328 at Prudential Center". The system had the fact and no way to reach for it. Gate 2 does not close this: #106's nearest neighbour WAS #3, at 0.762, because a Getty caption and a video title describe one event in vocabulary too unlike each other for cosine at 0.80 — and lowering the threshold to catch this pair would start holding genuinely distinct stories, so that is not the fix. The fix is claims-layer: event dates belong in `claims.facts` (the `event` key already exists but carries a name, not a date), after which an item whose event is months past can be folded or dropped no matter when someone reposted it. Blocked on claim extraction reliably capturing dates, which phase 2 has not demonstrated. **Recorded now because the failure is invisible to every existing instrument** — nothing in `items`, `scripts/audit-digest-tier.js`, or the checkin log distinguishes new news from an old fight re-uploaded, so this will not surface on its own.
  - **One article can land as several `official` evidence rows — watch, not a fix (noted 2026-08-31, from claim #11's confirmation).** The UFC.com Donchenko announcement produced three `role: official` links on one claim: items #490 and #491 are the *same page* arriving via two rails in the same run (Google News en + the direct UFC feed — Gate 1 checks the database up front, so within a run one rail cannot see the other's resolved URL), and #494 is the `jp.ufc.com` edition an hour later (a genuinely different URL). The semantic gate held none of them against each other because only *posted* items anchor the dup gate and all three were held-as-matched (`held_reason: llm`). Harmless today — `confirmClaim` is one-way, the group saw exactly one ✅ — but phase 2's independence-based corroboration would count one article as three independent official sources. When corroboration counting is built, dedupe evidence rows by resolved URL (and probably by cross-edition path identity) before counting; until then this is a known inflation to read around.
  - Observed 2026-08-06: headline embeddings miss same-story-different-angle pairs (~0.70 sim, e.g. two articles on the same Masvidal quote). True fix is claim extraction: canonical claim + source list ordered by published_at (earliest ≈ original; translations/echoes append quietly as "also covered by").
- [ ] 6. Conversational follow-ups with memory + web search. Decisions parked for build time: Mastra + TypeScript enter here (responder is born TS; hunter stays JS, converts opportunistically); responder is architecturally a separate service — home is an open question: Cloud Run (the dormant `fighterbot` webhook service already exists, one vendor, no function-timeout worries) vs Vercel (nicer TS/Mastra DX, free Hobby tier, but a second vendor holding secrets). Lean: Cloud Run, unless the responder grows a web UI.

7. **A reading app for the group — the other end of every Telegram link** (G2,
   G3) — *Anton, 2026-09-18: "we will be reporting some stories to Telegram like
   summarized nicely in substance and link to go expand more and the link will go
   to the part of the application where we don't have yet … a web part, kind of
   similar to the grader application that we built, but that will be for users.
   So anyone from the group can open the link to see more and then browse and
   slice and dice articles by story, by fighter, by time, by outlet … so that
   they can go and see what are all articles in that story."* **No design yet.
   Nothing built.**

   What it changes, and why it is worth recording now rather than when it is
   built: **it moves the cost of a borderline article.** Today every bucket-2
   decision is a decision to interrupt people, because the chat is the only
   place an article can exist. With a page behind the link, a marginal item does
   not have to interrupt anyone — it only has to be *findable*. That reopens
   questions we have been answering under the wrong constraint, including how
   fat the digest should be (the role-questions experiment currently composes
   ~5.6 digest items a day after dedup) and whether tangential mentions need to
   be dropped at all or merely demoted to the page.

   **Precursor already parked in item 3**: "one link to a public page that
   aggregates the week's mentions per fighter (a static page on a public host)".
   This is that idea grown up — per-story rather than per-week, and browsable
   rather than static. Item 3's version can be retired if this is built.

   **Reuse:** the grader app on branch `measure-story-matching`
   (`grader/public/`, `grader/export.mjs`) is the same shape — a static page over
   an exported slice of the archive, no server. It is built for one grader rather
   than a group, but the export path and the story-grouping are the parts worth
   lifting.

   **Open before any design:** who may read it (the archive holds every article
   we ever fetched, not only what was posted); whether it is static-exported or
   live against the database; whether a story needs a stable public id in the
   Telegram link; and whether it wants the responder's home (item 6, Cloud Run vs
   Vercel) — the note there says "lean Cloud Run, **unless the responder grows a
   web UI**", and this is that unless.

8. **Body extractor tune-up — last, it is a mechanical step** (Anton,
   2026-09-27: *"we might use in future one of the popular libs to make sure
   we are doing maximum to extract correctly. But since body extraction is a
   mechanical step, I'm going to do it one of the last steps."*) Test cases
   found in the golden singleton pass, where the saved text lost exactly the
   sentence that sources the news, so no station could see it:
   - **#852** (Champion.com.ua): the live page says "Про це він розповів в
     Інстаграм" (he said this on Instagram); the saved body, 1,714
     characters, does not contain the line.
   - **#385** (MMA Sucka): Topuria's reply is an embedded X post; the saved
     text shows only "X / Twitter @theufcentral status/… Will render as live
     embed". Whether it is a video or a post, and what it says, is lost.
   - The check to add: does the sourcing sentence survive ("told X", "on
     Instagram", "in a comment to"), not only whether a body exists. Also:
     the golden set's `body_unusable` pre-flags, and the headline-only path,
     which the golden set cannot test (drawn from articles with a body).

9. **A profile per fighter, built from pinned claims** (G1, G3, G4) — *Anton,
   2026-10-04.* **No design yet. Nothing built. Starts after the health scale
   (classifier v8) lands.**

   The problem it answers: every station reads one article with no memory, so
   none of them can know whether a fact is new; it can only guess from wording.
   The golden set shows the cost. In claim-015.0, four articles repeat one
   Merab quote ("he's fine, he'll be back") about an injury already known, and
   #1172 recalls an infection a month before a fight Donchenko then fought.
   Whether each is news depends on what was already known, not on the text.

   The idea: keep a profile per fighter (last fight and its result and
   injuries, health and expected return, next fight with its firmness, belt and
   ranking), and ask of each article **"which fields does this change, from
   what to what?"** A change to a field that matters is a career event (G1);
   no change at all is a repeat (G3); a field moving from rumoured to booked is
   a change too, and a rumour never overwrites an official value (G4). The
   answer is a visible change, such as "health: recovering → return early
   2027", which explains itself.

   **No separate log: the profile is the claims that carry weight, pinned to
   it.** The claims layer already groups articles into stories, keeps their
   sources (`claim_sources`) and moves a claim from `rumor` to `confirmed`. So
   a pinned claim's canonical text and facts play the role of a log entry, and
   the profile's current value for a field is its latest pinned claim. Pinned
   kinds to start: results and next fights; health at level 3 and up once the
   scale exists. The profile can always be rebuilt by re-reading the pinned
   claims, which is the guard against a model-written profile drifting.

   What the claims layer would need first, both already noted under
   5-phase-2: a supersede flow (a new booking replaces the old next fight; a
   result closes it), and event dates in `claims.facts` (today the `event` key
   holds a name, not a date).

   Risks: a claim is only as fine-grained as the grouping that made it. In
   the golden set all five claim-015.0 articles are one claim, the return-date
   article (#402) included, so a profile pinned at claim level would hide the
   one change inside a "he's fine" story; the change question has to run per
   article against the pinned claims, and a field change should be able to
   split a new claim off. A wrong pinned claim compounds (a rumoured date saved as official
   makes the later true report look like a repeat), so each field keeps its
   source and firmness; the first articles meet an empty profile and all look
   new, so it is seeded by replaying past claims in date order; and the golden
   set scores one article at a time, so testing a profile means replaying
   articles in date order (they have dates and claims, so this is possible).

   **First step, cheap:** replay #148 and the five claim-015.0 articles in date
   order through a profile updater and compare "changed a field" with Anton's
   health levels (level 3 vs level 2) from the v8 labelling. Six articles in
   one claim: enough to see whether the idea works, not to prove it.

## Deploy automation
- [ ] GitHub remote + Actions workflow: push to main → deploy to Cloud Run (spec §16.1). Retires manual `gcloud run deploy`.
- [ ] **Sandboxed autonomy (parked 2026-08-08, Anton sitting on it):** move the self-improvement routine into an ephemeral sandbox (GitHub Actions cron preferred) with scoped credentials so even a fully poisoned run is harmless. Full spec: docs/sandboxed-autonomy.md. Until then: local scheduled task + manual approvals.

## Open questions (spec §17)
- [ ] **Is the generalization real, or a veneer over an MMA tool? (Anton, 2026-08-09.)**
  Raised after auditing what's still combat-sports-wired. The doubt is worth
  keeping in front of us rather than assuming the refactor settled it.
  - **For "real":** 79 of 1,727 lines are MMA-specific, all in `domain/mma.js`.
    Fetching, extraction, Telegram, embeddings, dedup, the tier rule, the claim
    lifecycle, and `server.js` contain no sport. `claims.facts` is `jsonb`, so
    swapping `opponent, event, method` for another domain's fields needs no
    migration. Adding `domain/example-music.js` required no change outside it.
  - **For "veneer":** every threshold (0.80 dup, 0.10 drift, 300ch body floor,
    1-mention demotion) was measured against MMA press conventions and only
    *assumed* to transfer. The second domain has never been run — no feeds
    fetched, no verdicts, no database. The claim vocabulary earned its shape
    from MMA verdicts. So the seam is proven to *compile*, not to *work*.
  - **What would settle it:** one real run of a non-MMA domain against live
    feeds — even a throwaway database and a DM sink instead of a group. Until
    then the honest claim in the README is the one it already makes ("written
    to prove the seam is real... never been run"), and it should stay that
    modest. Do not upgrade the language on the strength of the line count.
  - **Also fine as an answer:** decide the tool is an MMA tracker with a tidy
    config seam, and say so plainly. That is a defensible way to describe it and
    costs nothing to tell honestly — it is the reframing, not the code, that
    would need to change.
- [ ] **One article, several watched fighters: a design input for the pipeline
  redesign (Anton, 2026-10-03).** Not a decision for now; to be weighed when the
  new extractor and pipeline are designed from the diagram
  (docs/design/system.excalidraw). *"Ultimately, we should allow the same
  article be for multiple fighters ... when we will be redesigning the new
  pipeline according to the diagram this should go as a consideration into
  the design process."*
  - **How it surfaced.** Golden article #975 is a long Donchenko interview
    after his Paris win. It is in the set only as an **Amosov** card, where
    Amosov is "only mentioned" (Donchenko thanks him as a training partner).
    The card is right for Amosov; there is no Donchenko card for the same
    article at all, though he is its main subject and speaks throughout.
  - **Why the pipeline does this.** Each run walks the watchlist one fighter
    at a time, and the first gate drops any address already stored
    (`collectCandidates` in hunter.js, `knownUrls` in lib/db.js; the check is
    by address alone, not by address and fighter). An item row carries one
    `subject`. So an article belongs to whichever fighter's feed brought it
    first, and is invisible to the others.
  - **How big, measured on the 300 golden articles:** 16 name a second
    watched fighter (10 of them Donchenko cards that name Amosov). On 4 the
    other fighter is named more often than the card's own: #975 and #1200
    (Amosov cards, mainly about Donchenko), #65, #1161. Small today, with
    three fighters, two of them Ukrainian welterweights who train together;
    it grows with the watchlist.
  - **What a design has to answer:** is the unit an article, or an
    (article, fighter) pair; where the nine labels attach (they are already
    per fighter: "how central is he", "does he speak"); whether one fetch and
    one extraction can feed several fighters' classifications; how dedup,
    claims and posting behave when one article is main-subject news for one
    fighter and a passing mention for another; and how the golden set would
    represent the pair (a second card for the same article).
- [ ] LLM model final choice (dummy uses Haiku 4.5)
- [ ] Source list per fighter (Donchenko/Amosov coverage may be sparse) — largely answered by 2e: Google News + six direct outlet feeds incl. Sport.ua (uk) which covers both quiet fighters. Still open: more Ukrainian outlets if gaps show.
- [ ] Cron frequency — hourly chosen and running (2b); revisit only if limits or noise say otherwise
- [ ] Alias lists per fighter — first draft live in hunter.js (Latin + uk-Cyrillic); expand if coverage gaps show (e.g. ru-Cyrillic spellings)
- [ ] Bot output language (spec §17.5) — precedent set 2026-08-07: uk/en headlines post as-is; other languages translate to **English**, labeled "(translated from xx)", via Gemini free tier. Still open: language of the bot's own voice (announcements, replies).

   **The storyboard — Anton, 2026-09-22, by voice, while driving.** The
   reading app now has a name and a role in the pipeline, and it dissolves
   the fact-versus-occasion question rather than answering it.

   His words, lightly trimmed for speech-to-text: *"between the dedup and
   semantic deduplication and decider, there needs to be a step non-existent
   right now … that article gets settled in a database either as its own
   story or joins the existing story that is represented by an extracted
   claim … I'm inclined to think for now that we should be focusing on
   occasion at all times for simplicity to start with … we should have a
   web UI that anybody can log in … see all the news about their fighters
   neatly organized into stories with a time slider, scrollable, expandable
   … filters like fight, lifestyle, camp updates … let's call this website a
   storyboard … only big updates like a fight announcement or fight result
   get posted directly to the channel. Everything else, even bucket two and
   three, gets posted as a digest once weekly. And before posting that, we
   run an agent through the storyboard to curate the narrative update …
   'during the last week there was a war of words between Topuria and Usman
   Nurmagomedov's managers about their possible matchup. To read more, click
   here' … the next week's digest agent can read the previous digest and
   all the stories that arrived and say 'last week's controversy about the
   Topuria–Gaethje gloves continued' … there might be 50 articles, but only
   like 20 stories … It's dealing with fact and occasion in a different way
   versus deciding directly what should be posted."*

   What this settles, as of that call:
   - **The story unit in the database is the occasion** — one interview,
     one fight, one presser — "for simplicity to start with". The
     three-instalment NV interview is one story on the board.
   - **The channel gets two speeds:** big events (a booking, a result)
     straight through; everything else once a week as a *synthesized*
     digest, one sentence per story with a link to the board. This is the
     `mentions-digest` decision in `docs/decisions.md` grown up: the digest
     is written by an agent reading the week's stories and last week's
     digest, not assembled from headlines.
   - **The fact side lives in the digest agent, not in dedup.** Six
     previews of one booking are one story on the board and one line in the
     digest; the three interview instalments are one story on the board
     and one line that names all three subjects. Neither needs dedup to
     decide what a "fact" is.
   - **Per-fighter follow level (item 3n) moves to the decider**, choosing
     what subset of the board reaches the chat for each fighter.
   - **The filters are the classifier's closed-set answers** — the role,
     what-is-done and news-kind questions from the role-questions
     experiment are the slice-and-dice axes.

   - **An arc above the story — 2026-09-23.** Reviewing the Soriano fight
     (booking, previews, result, next-day column, octagon interview, backstage
     interview: eight stories), Anton: *"there probably should be this
     overarching story … but it doesn't mean we need to reflect it on the
     storyboard — if the reporting agent is able to stitch a coherent story
     together … just put it all in one sentence, that would effectively mean
     binding it into the same overarching story."* So the digest agent stitches
     related stories into one line; whether the arc also becomes a data object
     is left open.

   - **The post-fight window — 2026-09-23.** Reviewing the three Donchenko
     post-fight sittings (octagon, backstage, press conference), Anton:
     *"Every interview in the post-fight week, or any interview in the next
     three days post-fight — which will include octagon remarks, the
     post-fight conference, and maybe some other post-fight interview — it
     would be nice to see them reported directly instead of digest."* So the
     set of things that bypass the weekly digest grows from "a booking, a
     result" to "a booking, a result, and the fighter's own words in the
     days after a fight." Needs the fight date, which is the result story's
     date — the fact memory again — plus the classifier's speaker answer
     (himself) and the extractor's occasion. Window length (three days, a
     week) is his to set. **Open, at his instruction:** what to do when
     several interviews land in the window — the Soriano week had three
     sittings in 24 hours (octagon, backstage, press conference). Three
     direct messages, one, or a stitched one; not decided.

   **To consider, not decided — official sources first?** Anton, 2026-09-25,
   ruling story-055 (a UFC.com feature on Donchenko before Paris, three
   copies): *"it's also from an official source, it's like an official
   interview. So when it's in the digest it would be good to highlight it or
   put it first, because it's from an official source. It just looks like a
   presentable article. This is not something we necessarily should do, just
   something to consider."* Would need the pipeline to know which domains
   are the promotion's own (ufc.com and its language mirrors, for a start).

   Still undecided, and his to decide: the exact list of what bypasses the
   weekly digest (so far: a fight announcement, a fight result, his own
   interviews in the post-fight window); who may read the board; the
   mechanics of "joins the existing story" for the cases above, which he
   said he wants to think about separately.

   **A test case for the digest agent — the eight-part NV interview
   (story-022, Anton, 2026-09-25, ruling it one story):** *"Ideally they are
   all caught as the same interview, but I recognize that for a lower-level
   model that doesn't have access to all articles at the same time and just
   processes them as they arrive, comparing the extracts, it might be
   difficult to link them in the same story. This is one genuine case where
   the fact evidence might be more upfront than the occasion evidence, and
   that may lead to different stories. But these are not fake news. In the
   new design all of this should be in the digest, summarized. This should
   be documented as an interesting case to test for a digest agent — to see
   if the digest agent can actually piece it together as one story, because
   the digest agent will have access to all articles to date at the same
   time, and all the extraction details and classification flags."* The
   case: NV published one sit-down with Donchenko as eight articles over
   Aug 15–22 (#203, #208, #298, #300, #301, #320, #321, #322), each a
   different fact, five naming the NV journalist, seven linking back to the
   previous piece. Grouped right by Fable reading all eight at once; a
   one-at-a-time matcher may well split it. The test: give the digest agent
   the week's stories with that interview split into several, and see
   whether its prose stitches them into one.
