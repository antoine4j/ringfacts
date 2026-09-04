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

## 2026-09-04 evening — one story, three claims (messages 200 and 201)

Items 620, 626 and 627 (Topuria's video letter to his son after the Gaethje loss)
became claims 51, 52 and 53 and were posted as message 200 and then, an hour
later, message 201 with two lines. Anton: "201 and 200 are the same news."
The matcher saw three angles ("announced his return", "made a short film about
the loss", "returned to social media") and treated each as a new fact. The
headline embedding held three other rewrites (0.81–0.82) but not these two.

Ruling: a claim is an event, not an angle. Same video, same fight, same
statement → MATCH, whatever detail the article leads with.
