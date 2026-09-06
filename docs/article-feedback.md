# Article feedback

Anton's verdicts on articles the group actually received — the ground truth
that archive columns cannot capture. For later review and tuning: when a
threshold or rule is being re-measured, check the change against every entry
here first.

Convention: one entry per article, newest at the bottom. `Comment` is Anton's
wording, kept verbatim — it is data, not prose to polish. `Signals` is the
tuning-relevant extraction from that comment. `Item` links the entry to the
archive row (`items.id`), where the embedding, tier, and body live.

---

## 👍 2026-08-14 — Amosov's UFC standing, analyzed (Tribuna UA)

- **URL**: https://ua.tribuna.com/uk/boxing/blogs/3178110-katehoriya-amosova-v-ufc-tytulnyy-biy-ta-yaku-pozytsiyu-zaraz/
- **Item**: #191 · Yaroslav Amosov · Tribuna UA · uk edition · posted 2026-08-14, digest tier `main`
- **Comment**: "I like this article because is gives great analysis of Amosov's
  UFC journey so far. It has embedded videos of his 2 finishes in UFC. Reviews
  Yaroslav's division and speculates lightly on who may be his next opponent."
- **Signals**:
  - Long-form *analysis* is valued, not just news events — career retrospective,
    division overview.
  - Embedded media (his two UFC finish videos) adds value.
  - Light, grounded speculation (next opponent) is welcome, not noise.
  - Ukrainian-language blog content earns its digest slot.
  - The system never read this body (`body_via: http-403` — the site blocks
    cloud fetchers), so nothing in the archive could have predicted this
    verdict from content. Headline and source alone carried it.

---

## 📋 2026-09-04 — The first G2 grading pass (103 posts, Aug 5 – Sep 4)

- **List**: [docs/grading/2026-09-04-posted-30d.md](grading/2026-09-04-posted-30d.md) — every posted item with Claude's bucket, the reason, and Anton's verdict.
- **Comment** (Anton, in chat): "my rulings on grading: #21, #43, #50, #256, #318, #340 - bucket 3; #194, #226, #279, #291, #320, #523 - bucket 2. I think in the future we need a category lifestyle for updates like #366. Eurosport imposed a geoblocking on me when I tried to open #445. Whatever borderlines I did not mention they stay as graded."
- **Result**: useful 34 / 103 = 33% against the 90% target. Overruled: #21, #43, #50, #256 (2 → 3), #291 (3 → 2). Confirmed borderlines: #318, #340 stay 3; #194, #226, #279, #320, #523 stay 2.
- **Signals**:
  - Another fighter or camp *acting toward* him — a callout, a request to fight him, advice about his weight class, a rival naming his next opponent (#21, #50, #256), or two managers arguing about him (#43) — is **bucket 3**. Nothing new about him is in it.
  - An established authority *assessing* him — the champion on his loss and the face-off (#194, #226), a top coach on the path he needs (#279), a doctor on his injury (#523) — is **bucket 2**.
  - His own account of his own life, when it is substantial — childhood (#291), joining territorial defence in 2022 (#320) — is **bucket 2**; a lesson from his divorce (#380) stayed 3, so length and depth matter, not the topic alone.
  - Training trivia from his coaches (#318, #340) is 3; a coach breaking down *his game* (#547) is 2.
  - Anton wants a future **lifestyle** category for updates like #366 (Donchenko's fishing and breakdance hobbies) — not junk, not for the main digest.
  - Eurosport (#445) geoblocks Anton; the verdict there rests on Claude's summary. Worth remembering when a Eurosport post is graded again.

---

## 📋 2026-09-04 (evening) — The callout rule, sharpened

- **Comment** (Anton, in chat): "I think callout specifically should be bucket 2, like if other fighter says I want to fight Topuria. But if another fighter says Topuria should fight <somebody else> - it's bucket 2. With authority, it might be more important, but within limits, like champ Makhachev's opinion on who Topuria might fight, or Makhachev's coach'd opinion." Then, confirming Claude's reading of the second sentence as bucket 3: "I agree with your correction, do as you said."
- **Rule**: a fighter saying *I want to fight him* → **2**. A fighter saying *he should fight someone else* → **3**. An authority (the champion, the champion's coach) on who he might fight → **2**, within limits.
- **Effect**: #21 (Usman's camp asks for Topuria as a first fight) goes back to 2. Precision for the window becomes 35 / 103 = 34%. #50 (Prates warns him off welterweight) and #256 (Tsarukyan picks his next opponent) stay 3.
- **Also decided**: the mentions digest is held back — Anton does not want tangential articles in the chat at all; a single link to an aggregated page is the only shape he would consider (TODO).

## 📋 2026-09-05 — The all-articles review: a reply to a callout is about him

- **Comment** (Anton, in chat, reviewing the stories in docs/grading/2026-09-05-all-articles.md): "I think both #34 and #43 should be bucket 2, because one is reaction to another."
- **Rule**: Abdelaziz asking for Topuria as Usman's first fight (#34) is a callout at him → **2** (the 09-04 evening rule). Kawa, Topuria's manager, firing back at him (#43) is the reaction to that callout → **2** as well. Reverses the 09-04 morning ruling on #43 ("a feud about him is still a feud between others"); the worked example in goals.md is updated.
- **Also from the same review**: the group saw the Abdelaziz–Kawa exchange nine times over Aug 7–11 as separate posts; as stories it is two roots (#34, #43) with 34 members between them, of which the group should have seen two. Stories are named by their root (TODO 3f).
- **Lifestyle, later the same day**: on #208 (Donchenko phoning the grandmother who opposed his career, after his win) Anton: "technically they are not about career. So it should be 3, but I like it and want it in 2 for now." Then: "Bring #366 to 2" (the fishing and breakdance piece, graded 3 on 09-04). **Rule**: a personal-life story about a watched fighter is bucket **2**; the "possible lifestyle bucket" note in goals.md becomes this ruling.

## 2026-09-04 evening — one story, three claims (messages 200 and 201)

Items 620, 626 and 627 (Topuria's video letter to his son after the Gaethje loss)
became claims 51, 52 and 53 and were posted as message 200 and then, an hour
later, message 201 with two lines. Anton: "201 and 200 are the same news."
The matcher saw three angles ("announced his return", "made a short film about
the loss", "returned to social media") and treated each as a new fact. The
headline embedding held three other rewrites (0.81–0.82) but not these two.

Ruling: a claim is an event, not an angle. Same video, same fight, same
statement → MATCH, whatever detail the article leads with.

## 📋 2026-09-06 — Fight week: four pieces about one fight are four stories

- **Context**: judging the useful stories option D swallowed (docs/grading/2026-09-06-story-matching.md). D folded #490, #594 and #598 into #474, the first odds piece about Donchenko–Soriano.
- **Comment** (Anton, in chat): "these 4 articles are different, 474 is betting odds in Ukrainian betting company Beton it seems like, 490 is great article about Donchenko full of quotes from his interview and it's official source, 594 is betting odds from a different betting company - DraftKings, 598 - preview of a fight, statistical analysis of both fighters. From this I maybe want to see betting odds posted from a western company like DraftKings, and official article full with Donchenko interview quotes."
- **Rule**: a fight is not one story for the whole of fight week. The odds from one bookmaker, the odds from another, an official long-form with the fighter's own quotes, and a statistical preview are **separate stories**; a matcher that folds them together is wrong on all three counts. Labels stand: #490 → 2, #594 → 2, #598 → 2, #474 → 3.
- **Signals**: an official source (UFC.com) full of the fighter's quotes is wanted. Odds from a Western bookmaker (DraftKings) are wanted; odds from a Ukrainian bookmaker's blog were not ("maybe" — a preference, not yet a rule).

## 📋 2026-09-06 — One interview, one link: excerpts are repeats

- **Context**: option D folded #208 (grandmother) into #203 (church bonus) and #300 (TUF earnings) into #298 (TUF conflicts) — each pair two Sport.nv.ua articles, same day, same Donchenko interview, a different quote in the headline. The labels had kept both halves as separate posts.
- **Comment** (Anton, in chat): "Ideally, I'd like to see link to an interview, and I'm not sure I need all these quotes from the same interview."
- **Rule**: one interview is one story; the group gets one link. Labels changed in the `feedback` table (user rows, updated in place): #208 → 3 dup of #203, #300 → 3 dup of #298. D was right on both. The 09-05 lifestyle ruling on #208 stands as a bucket rule for a story; it does not make a second excerpt its own story. goals.md carries the sharpened sentence.

## 📋 2026-09-06 — The six "same news or second occasion" pairs, and a question of authority

- **Context**: the remaining pairs option D folded that the labels had kept apart (docs/grading/2026-09-06-story-matching.md). Anton judged each from the articles.
- **Comment** (Anton, in chat): "1 same coz it's the same interview, 6 same because it seems to refer to the quotes from the same interview no? 2 articles both refer to the same trainer interview, but first article has much more that that, so somewhat separate. 3 - different despite same outlet, but this info is from a journalist and from a ufc analyst, which is not really authority for me. So they may be seprate, but not sure if they need to be posted. I know I might me contradicting what I had said previously but maybe we need to establish different level of authority. 4 trust you that it's same 5 - different 572 teases and 620 actually delivers, to I woldn't want 620 to be folded."
- **Rulings** (feedback table, user rows updated in place; members re-rooted so every dup names its root):
  - #34 → dup of #5 (same Abdelaziz X post, two outlets). #5 becomes the story root at bucket 2: the remarks name Topuria as the fight he wants, a callout at him.
  - #135 → dup of #77 (the bodies confirm one Jesús Gallo interview on Jorge Ebro's channel; ABC took the "new version" quotes, 20minutos the date quotes three days later). #135's eleven members now sit under #77. *Caveat*: the late-August members (#398, #401, #409, #411, #412, #422, "Topuria already has a return date") may be a later fact than Gallo's interview; not re-read today.
  - #445 → dup of #443 (Gaethje's remarks, AS first). #443 becomes the root at bucket 2 (Anton's label for the story).
  - #100 stays 2, its own story: a journalist's argument that draws on more than the trainer's interview — "somewhat separate".
  - #382 and #379 stay separate stories, both 2 as graded; see the open question.
  - #620 stays 1, its own story: Bloody Elbow's #572 teased a return, 20Minutos's #620 is Topuria announcing it. "572 teases and 620 actually delivers."
- **Open question — authority**: "this info is from a journalist and from a ufc analyst, which is not really authority for me … maybe we need to establish different level of authority." Anton's 09-05 rule made others assessing him bucket 2; today he is not sure a journalist's or an analyst's assessment earns a post at all. Candidate levels, for him to confirm: the fighter and his team (trainer, manager) · officials and the promotion · other fighters and coaches who face him · journalists and analysts. Not a rule yet; recorded so the matcher prompt and the bucket rules can carry it once he decides. TODO 3j.
