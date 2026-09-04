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
