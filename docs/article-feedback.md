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
