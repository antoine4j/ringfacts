# Brief: a design doc in hours, a build overnight

*Backlog idea 8 · building with AI tools · briefed 2026-10-05 with the
`developing-post-briefs` skill · numbers measured that day*

**Verdict: holds in a narrower form.** "About two hours overnight" is right
(1 h 53 min, unattended). "The whole v0" is not: 16 of the 22 v0 tasks were
built that night. "A few cents" is true of running it hourly, not of the
one-off tests (about $4 that day) or the build itself (about 90 million agent
tokens, not priced).

**Point.** When an agent writes the code, your hours belong in the design.
About five hours of design bought an unattended build of under two.

**Hook.** "I spent five hours arguing over a design doc. Claude built it while
I slept, in under two."

## Audience

People building with AI tools. Today they think an agent's value is typing
speed: prompt faster, ship faster. The post corrects that: the build was quick
because the decisions were already made and written down. Takeaway they can
use: before letting an agent run, write and approve a numbered list of
decisions and a working contract (what it may do alone, what needs a yes, how
it reports).

## Claims

| Claim, as the author would say it | Number | How measured | Verdict | Wording the evidence supports |
|---|---|---|---|---|
| Claude built it in ~2 h overnight | 1 h 53 min: resumed 02:38, last agent message 04:31 Pacific; 16 commits, ~7,600 lines of code (lockfiles excluded) | Session transcript timestamps; `git log 6e0f06d..4a2faac`; `git diff --numstat 6e0f06d 4a2faac` | supported (measured) | "under two hours, unattended" |
| "the whole v0" | 16 of 22 tasks overnight; 21 of 22 by 13:07 next day, with Anton present on and off | `docs/checkin-log.md`, both 2026-10-05 entries | weaker than stated | "most of v0: 16 of 22 tasks" |
| Unattended | Anton's last message 02:36, next 10:04; only an automatic task-finished notice in between | Transcript, human-message timestamps | supported | "nobody at the keyboard" |
| Many hours on the design | Design session 21:31–02:36 (~5 h; ~30 min of it an unrelated git-history cleanup); spec review rounds 3–6 committed (00:20 → approved 02:28); 30 decisions at approval, D31–D34 added during the build | Transcript; `git log -- docs/superpowers/specs/2026-10-04-v0-design.md`; `grep -oE '\bD[0-9]+\b'` on `git show 02528c6:docs/superpowers/specs/2026-10-04-v0-design.md` | supported | "about five hours, 30 written decisions" |
| Runs for a few cents | 10 hourly runs, 13 readings: $0.020 in model calls | `runs` table in the v0 database: JEV tokens × $0.042/M plus OpenRouter microdollars (rate in `v0/pipeline/store/counts.ts`) | supported (measured) | "about 2¢ for its first ten hourly runs" |
| …overall | One-offs: night ≈ $0.94 (the agent's own tally; the database holds no OpenRouter cost for the backfill runs); three-model digest comparison $3.13 | `docs/checkin-log.md`; `select model, sum((raw->'usage'->>'cost')::numeric) from digests where backfill group by model` | weaker than stated | "cents an hour to run; about $4 of one-off tests" |
| Building it was cheap | Build window: 90.2M cache-read input tokens, 755k cache-write, 252k output | Transcript `usage` fields, 02:38–04:35 | unmeasured in dollars | leave out, or price it from the actual plan |

## Counter-evidence

The two hours stood on a month of measured work: the 300-article labelled set
(frozen 3 Oct), classifier v7.7 tuned, the extractor prompt (pass 4) tested.
The design assembled proven parts. Saying so strengthens the point: the hours
went in before the build, not into it. The morning also needed Anton for two
things the agent could not do (messaging the bot so it could read its chat,
pasting a database address into Vercel). And the agent found and fixed its own
story-splitting bug overnight by replaying the labelled articles (D31: pair
recall 0.55 → 0.83): a strength, not a morning fix.

## Outline

1. Hook: five hours of design, under two of build. *(rows 1, 4)*
2. What the design held: 30 numbered decisions, review rounds, a written
   contract for the agent. *(row 4)*
3. The night: 16 commits, deployed, running hourly, its own bug caught by a
   replay. *(rows 1, 3)*
4. What it could not finish: 6 tasks, two things only Anton could do. *(row 2)*
5. Cost: cents an hour to run; honest about one-off tests and agent tokens.
   *(rows 5–7)*
6. Why it was fast: the parts were measured beforehand.

## Still needed

- Anton's hours on the scoping before the spec (plan commits from 19:30, three
  sessions from 16:48), split into design and other work.
- The agent's tokens priced on his actual plan.
- Time spent on spec rounds 1–2, which were never committed.

## Overstatements to avoid

- "Claude built the whole thing": 16 of 22 tasks.
- "Two hours from nothing": a month of measured parts came first.
- "The project costs cents": running it does; building and testing it do not.
- That the hourly runs posted overnight: they posted nothing, as the bot had
  no chat to post to yet.
