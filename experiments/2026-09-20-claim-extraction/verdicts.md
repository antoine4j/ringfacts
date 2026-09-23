# Anton's rulings on the extraction experiment — append only

His words, verbatim, on the ruler (which articles are one story) and on the
claims. **The only ground truth in this folder.** A ruling on the ruler
outranks every score here: when one lands, `clusters.json` is rebuilt from it
and every arm is re-scored, and the old numbers are kept in `ITERATIONS.md`.

**What a ruling on the ruler tests — Anton, 2026-09-22:** *"What I'm looking
for is the coherence at the core story level."* A story is right when every
article in it shares the same core: the same occasion and the same main news.
Extracts may differ in wording, pick different quotes from that occasion, or
carry side mentions of other matters; none of that breaks the grouping.

Format, one block per ruling:

    ## YYYY-MM-DD — #a and #b are one story / are different stories / claim on #n is wrong
    > his words
    What changed as a result, and where.

## 2026-09-22 — story-125 (#1146, #1150, #1160): the grouping is right

Anton, by voice, reviewing REPORT.html:

> "I reviewed the first story, story 125. And I noticed that two of the three
> extracts are very similar. And the third extract provides more details …
> Makhachev said something about Amosov and then it also details why he
> thinks that. And two other articles just say what he thinks, but don't
> mention why. That's interesting. But the grouping is right."

**Ruling on the ruler:** the three articles are one story. First human ruling
in this folder. **On the claims:** checked — the reason ("I saw the fight
where someone stopped his wrestling") is in the text of all three articles;
the extractor kept it in #1146 and dropped it in #1150 and #1160. Fidelity
lost by the one-sentence rule, not by the source. Evidence for README 9b.

## 2026-09-22 — story-124 (#1125, #1129): the grouping is right

Anton, by voice: *"also story-124 is correctly grouped."*
Ruling on the ruler: one story.

## 2026-09-22 — story-112 (Gaethje on MightyCast, 9 articles): one story, by occasion

Anton, by voice, reviewing REPORT.html:

> "These two articles [#948, #1050] are definitely part of one occasion —
> Gaethje on MightyCast. All different takes are his quotes from there. So
> story-112 is one story about his comments about Topuria on MightyCast.
> Therefore 948 and 1050 are part of the story by occasion, but not part of
> it by facts. I'd rather prefer they'd be grouped by occasion in this story
> than creating standalone stories. And in a digest they can simply be
> ignored as not substance, while agent can summarize all those who have
> extracts about Topuria. So story-112 is correctly grouped."

**Ruling on the ruler:** one story. **Design ruling, first one stated on a
concrete case:** the story unit is the occasion, even when it pulls in
articles that carry no fact about the watched fighter; those stay in the
story and are simply not substance for the digest. The digest agent
summarises from the articles that have a claim about him.

Checked while he asked: #948 was in pass 1 and pass 2 as a story of its own
(m094 → s089). It joined story-112 only in the third pass, the full-text
re-read, where the reader saw "MightyCast / Demetrious Johnson" in the body
— grouped by podcast, as he guessed. And #948 is in the sample at all only
because its Bloody Elbow feed body carries a "LATEST NEWS" cross-link whose
text names Topuria; production's matcher called it `passing` and did not
post it.

## 2026-09-22 — story-113 (#958, #972, #991, #998, #1008, #1020, #1031, #1036, #1058, #1076): the grouping is right

Anton, by voice: *"story-113 is correctly grouped by Dana White interview
with Jim Rome. And the extracts are very similar although they vary slightly
by the fact — from Gaethje and Pimblett being the candidates for Topuria to
Topuria just being ready to fight — and it's all fine."*
Ruling on the ruler: one story (the occasion). On the claims: the variation
between "ready to fight" and "Gaethje or Pimblett next" is acceptable.

## 2026-09-22 — story-109 (#930, #968): the grouping is right

Anton, by voice: *"109, 116, 099, 104, 110 — correct."* Ruling on the ruler: one story.

## 2026-09-22 — story-116 (#1016, #1027): the grouping is right

Anton, by voice: *"109, 116, 099, 104, 110 — correct."* Ruling on the ruler: one story.

## 2026-09-22 — story-099 (#820, #838, #843, #871, #892, #913, #921, #953): the grouping is right

Anton, by voice: *"109, 116, 099, 104, 110 — correct."* Ruling on the ruler: one story.

## 2026-09-22 — story-104 (#866, #917, #926): the grouping is right

Anton, by voice: *"109, 116, 099, 104, 110 — correct."* Ruling on the ruler: one story.

## 2026-09-22 — story-110 (#933, #934): the grouping is right

Anton, by voice: *"109, 116, 099, 104, 110 — correct."* Ruling on the ruler: one story.

## 2026-09-22 — story-100 (#850, #896): the grouping is right

Anton, by voice, after hearing the ruler's doubt:

> "100 correct. The rivalry piece is the context to the quote, gives nothing
> new; the quote itself as O'Malley's opinion is what matters. Parnasse's
> mention is interesting, it's not main … it could also be a reason to lump
> it with some other article that talks more about Parnasse. And I'm sure
> there will be more articles discussing Parnasse and Topuria. So I would
> let this article stay with story 100, focusing only on O'Malley and almost
> ignoring Parnasse."

Ruling on the ruler: one story. **Design rule stated:** an article belongs to
the story of its main news; a side mention that could tie it to another story
does not pull it there, even when that other story is likely to grow.

## 2026-09-22 — design principle: edge articles may land either way

Anton, by voice, during the ruler review:

> "If some article works for both stories, then if the comparison is
> genuinely not sure, then I guess it's okay, and whatever story that article
> joins, let it be. We're not chasing precision here. We're chasing the
> grouping around the core. I would trust outlets that if the news is
> significant enough it will appear more than once and it will resurface as
> its own story. So that same non-determinism will help us group it into the
> core stories. And the articles that are truly on the edge, it doesn't
> matter which story they join, considering that most of it will be
> summarized by the digest agent anyway. This is my idea to work around
> non-determinism while being clear on substance."

Not a ruling on a story; a rule for the join-or-start step on the
whiteboard. Recorded here because it was said while ruling.

## 2026-09-22 — the guard for events: use the classifier's news-kind

Anton, by voice: *"To prevent results riding on the back of a fight
announcement, we should leverage classification results from the classifier
to put those apart. The classifier is a high-level model that read the whole
article, so it should be able to tell — of course we should test it — but I
would think it should be able to tell announcement from results."*

Tested on the spot, Donchenko–Soriano, classifier consensus pass 16: the 24
result articles all answer `result`; the 3 August booking articles all
answer `announcement`; the 5 weigh-in pieces `preview`; the 9 fight-week
previews split `preview` / `prediction` / one `announcement`. Zero result
articles read as a booking, zero bookings as a result. One fight, 42
articles — enough to say the guard is worth building, not enough to say it
never fails.

The ruler's own eight low-confidence pair rulings are in
`clusters.json` under `low_confidence_rulings` and flagged in `REPORT.html`
under "the ruler was unsure".
