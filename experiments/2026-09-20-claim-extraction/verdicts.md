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

Anton, on hearing the 42 was the complete set for that fight: *"If 42
articles were just ruled with no mistakes, I think it's firm enough. Even if
one article is mistaken, no biggie — we still have distinct piles:
announcement, result, etc."* **Ruled firm.** The guard is a design
decision now, not a hypothesis; a single misread article lands in the wrong
pile, it does not silence a story.

## 2026-09-23 — story-105 (#879, #901, #905): the grouping is right

Anton, by voice: *"105, 107 — correct."* Ruling on the ruler: one story.

## 2026-09-23 — story-107 (#887, #909): the grouping is right

Anton, by voice: *"105, 107 — correct."* Ruling on the ruler: one story.

## 2026-09-23 — story-105 (#879, #901, #905): the grouping is right

Anton, by voice: *"105, 107 — correct."* Ruling on the ruler: one story.

## 2026-09-23 — story-107 (#887, #909): the grouping is right

Anton, by voice: *"105, 107 — correct."* Ruling on the ruler: one story.

## 2026-09-23 — story-073.4 (#731, #732, #733, #735, #736, #747, … +18): the grouping is right

Anton, by voice, from headlines: *"073.4 is clearly about a fact of Donchenko
winning over Soriano."* One story: the result.

## 2026-09-23 — story-073.5 (#817): the grouping is right

*"073.5 is about assessment of how he did that. So it's kind of post-result
analysis, not the declaration of the result."* One story, its own occasion.
(This is #817, the article the extractor reads as the result in every pass;
Anton's reading confirms it is a column, so that extraction is wrong.)

## 2026-09-23 — story-073.3 (#683, #714, #737): the grouping is right

*"073.3 is about the whole event results, where Donchenko's result is still
mentioned there."* One story, the card-wide results. *"Donchenko's fight is one occasion inside
a different occasion that is a UFC event, so they are reported separately in
terms of a core story, but one includes another."* — **an observation about
reality, not a domain-model rule**, he clarified straight after: *"I didn't
really mean that in our domain model one story should nest inside another."*

On 073.5 vs 073.4: *"I wouldn't be upset if 073.5 was grouped together with
073.4, which is the result itself, but it's a neat bonus that Fable discerned
the difference, including by date."* So: separate is right, merged would be
acceptable — an edge case under the "let it land" principle.

**The overarching span, for the storyboard / digest — his words:** *"All of
these stories might be under the same overarching span, which would be
Donchenko's fight with Soriano … announcement, speculations, result,
analysis, octagon interview, backstage interview, it's all about this fight.
There probably should be this overarching story. But it doesn't mean we
necessarily need to reflect it on the storyboard — if the reporting agent is
able to stitch a coherent story together and say, well, this fight happened
and there was analysis, he gave an octagon interview and a backstage
interview, just put it all in one sentence — that would effectively mean
binding it into the same overarching story."* Recorded as a design thought:
the arc may live in the digest agent's prose rather than in the data model.

## 2026-09-23 — story-095 (#746, #778): the grouping is right

*"095 is the octagon interview and a callout of Rodriguez."* One story.

## 2026-09-23 — story-093 (#740, #789, #794, #797, #813, #851): the grouping is right

*"093 is a post-fight backstage interview, which is another occasion."* One
story, separate from 095: two sittings, two occasions, though the callout is
the same. *"These seem to be all stories post-fight, and I think they are
correctly [split] by occasion."*

On the story headers in REPORT.html (Fable's one-line descriptions, written
when it grouped): *"describes what the story is about pretty well."*

## 2026-09-23 — story-073.0, 073.1, 073.2 — the pre-fight side: genuinely unsure; Fable's grouping stands

Anton, by voice, in two steps.

First, on 073.0: *"It definitely looks like two of the same articles, but
#605 does not rewrite those two articles … 112.ua seems to be just a
standalone article that announces this event."* (Checked: #605 does open
"Як повідомляє Sport.ua", but it is a 715-char fixture note, not a rewrite of
the 10,000-char column that #599/#619 are.) On 073.2: *"One article from
112.ua is a very simple announcement with tournament details, and another
one from Sport.ua is an announcement of the entire UFC event and where to
watch."* On the ruler's low-confidence pair #687 ↔ #683: *"#687 still talks
about the fight that will happen. It doesn't have any results in it … 073.3
is already results. So if the ruler thinks #687 was the same as #683, I
think that's wrong."* — the final ruler already has them apart; the doubt is
retired.

Then, stepping back:

> "I myself genuinely am unsure whether 073.0, 073.1 and 073.2 are different
> stories. These are all announcements of the same thing, with slightly
> different variations of analysis. So I wouldn't be surprised if they all
> would be put in the same story by the pipeline. If we can extract more
> details from that analysis, could be interesting, but ultimately I don't
> know if I even need those details. When the fight is announced, I want to
> see that in the chat. And then in the digest I just want to see that the
> fight is announced across several outlets with different takes on analysis
> of the fight, or something even shorter. But I see how Fable tried to
> group it by occasion — the first analysis of what awaits him in Paris, then
> a second pre-fight column with a slightly different take, then the fight-day
> where-to-watch page. I don't know if it makes any difference if it's a
> separate story, but I understand and respect Fable's grouping."

Then, on the articles inside them: *"#605 and #745 are kind of similar in
substance, but I respect Fable's decision that the first one was released
before the fight and the second one is kind of a reminder on the day of the
fight. So I think it's the right grouping again, but I wouldn't be surprised
if in the pipeline they would be added to the same story leading up to the
fight."*

**Ruling: the grouping is right for 073.0, 073.1 and 073.2, as Fable built
them.** Mark them ruled. No split, no merge, no move; the earlier draft that
proposed a split and a merge is withdrawn at his instruction.

**Caveat, his:** *"Because it's late, maybe in the future I will take a fresh
second look, and maybe I will see some more differentiation for articles
leading up to the fight. So this is an open area."* The pre-fight side is
ruled for now and flagged for a second look; the boundary between "the fight
is announced" and "a column about the fight" is one he does not need drawn
for the chat or the digest, so either grouping serves.

## 2026-09-23 — story-073.0 (#599, #619, #605): the grouping is right — see the pre-fight entry above

## 2026-09-23 — story-073.1 (#690): the grouping is right — see the pre-fight entry above

## 2026-09-23 — story-073.2 (#687, #688, #745): the grouping is right — see the pre-fight entry above

## 2026-09-23 — story-090 (#693, #702, #723, #728, #755, #771, #788, #875): the grouping is right

Anton, by voice, after checking #875's quotes against the essay itself
(https://iliatopuriaoficial.com/este-soy-yo/): *"Then I agree with grouping
for 90. In reality I would probably read his essay once and that's it, as a
main source."*

What was checked: #875's headline and spine are verbatim from the essay
(prologue, chapter 1, chapter 2); its quotes on defeat and on street fights
are older, pre-loss lines the article itself calls "manifestaciones previas";
the Alicante remark is "from some other interview". Peg is the essay; the
rest is padding — as Fable's own description said. #728 opens on the Hugo
Instagram post and quotes essay lines attributed to Instagram; a bridge
article between story-080 (the video letter, 4 Sep) and this one (5 Sep).
Both stay where Fable put them. Fable had flagged both #728 and #875 as
uncertain in passes 1 and 2; pass 3 kept them here without recording why.

**Product note, his:** for a primary source like this, one link to the
source itself is the digest; the eight write-ups add nothing he would read.

## 2026-09-23 — story-080 (#620, #627, #632, #636, #647, #651, #659, #666, #675, #682, #697, #717): the grouping is right

Anton, by voice: *"Story 80 is also correctly grouped. It's all about the
message, the video to his son, published on Instagram."* One story, one
artifact: the Instagram video letter to Hugo, 4 Sep. Twelve articles.

## 2026-09-23 — story-084 (#653, #686): the grouping is right

Anton, by voice: *"Story 84 is also correct. It's a ceremonial weigh-in and
face-off. This is a real, separate occasion leading to the fight."*

## 2026-09-23 — stories 066, 081, 088, 089 — predictions of the Soriano fight: MERGE at rebuild, by type of news

Anton, by voice:

> "81, 88, 89 and 66 are all predictions from different outlets and authors
> about the same Donchenko fight. So I would group them probably into the
> same story. I understand why Fable grouped them differently — these are
> truly different occasions, from different outlets, by different authors.
> They all pick Soriano, funny enough … Regardless of that, despite it truly
> being different occasions, I think they should be grouped by the type of
> the news, which is the prediction of a concrete fight. Because I wouldn't
> want multiple mentions of prediction of the same fight — there can be
> potentially endless predictions; every outlet can think they are entitled
> to give predictions, and that's what's going on apparently."

**Ruling:** one story, "predictions of Donchenko vs Soriano", regardless of
outlet or author. **A new grouping rule, the first exception to occasion:**
for a genre that every outlet reproduces at will — predictions, odds,
betting tips — the story is the *type of news about a concrete event*, not
the occasion. Reason: volume, not principle; the same reason as the RF
ruling that forty analyses make a group stop reading.

**Applied at rebuild, not now.** Nothing in clusters.json moves until the
pass is over. Members he named: 066 (#555, #563), 081 (#623), 088 (#673,
#681), 089 (#692, #698). **Six more single-article prediction stories exist
that he did not name** — 072 ClutchPoints (#594), 075 Liontips (#603), 077
Stats Zone (#608), 082 DraftKings best bets (#641), 086 BetMGM (#655, no
text), 091 DraftKings pick (#709). **Ruled 2026-09-23:** *"All these
articles should be part of the same prediction story."* So the merged story
at rebuild is all ten: 066, 072, 075, 077, 081, 082, 086, 088, 089, 091 —
thirteen articles, "predictions of Donchenko vs Soriano". Edges left out on purpose: 058
and 079 are fixture previews with no pick; 073.0's Sport.ua column does pick
Donchenko but is already ruled as-is on the pre-fight side.

Checked, since he asked in passing: of the twelve prediction articles with
a claim, eight pick Soriano (066 ×2, 075, 081, 088 ×2, 089 ×2 — the MMA
media) and four pick Donchenko (072, 077, 082, 091 — the betting side,
matching his memory that Donchenko was the favourite by the odds).

## 2026-09-23 — story-086 (#655): one story with the other Soriano predictions — merge at rebuild

(NO CLAIM here is a scraping failure, not an extraction one — see below.)

Anton, by voice: *"Interesting is that 86 says no claim both times, but in
the article it actually clearly predicts Donchenko winning."*

Checked: the stored body of #655 is 10,000 characters of inline CSS
(`background-origin:content-box; …`) — the body extractor's "paragraphs"
rung caught a stylesheet in a `<p>`. The extractor never saw an article and
answered NO CLAIM correctly. The live page predicts Donchenko. Upstream
defect; recorded in `docs/lessons.md` under unusable bodies. For the ruler,
086 remains a prediction story by its headline and Anton's reading of the
page; still unruled on the merge question.

## 2026-09-23 — predictions: what the extractor should return for them

Anton, by voice: *"Additionally, for predictions we may ask the model to
extract who is the predicted winner in a given prediction, or maybe even
what odds are, so it can be later reported by the digest agent."*

A direction for the extractor prompt, not a ruling on the ruler: for
`kind = analysis` that is a pick, add `predicted_winner` and, where the
text gives them, `odds`. The digest line then writes itself: "eight of
twelve picks went Soriano; the books had Donchenko at −238." Recorded in the
README's next steps beside the multi-fact direction (9b).

## 2026-09-23 — story-066 (#555, #563): one story with the other Soriano predictions — merge at rebuild

## 2026-09-23 — story-072 (#594): one story with the other Soriano predictions — merge at rebuild

## 2026-09-23 — story-075 (#603): one story with the other Soriano predictions — merge at rebuild

## 2026-09-23 — story-077 (#608): one story with the other Soriano predictions — merge at rebuild

## 2026-09-23 — story-081 (#623): one story with the other Soriano predictions — merge at rebuild

## 2026-09-23 — story-082 (#641): one story with the other Soriano predictions — merge at rebuild

## 2026-09-23 — story-088 (#673, #681): one story with the other Soriano predictions — merge at rebuild

## 2026-09-23 — story-089 (#692, #698): one story with the other Soriano predictions — merge at rebuild

## 2026-09-23 — story-091 (#709): one story with the other Soriano predictions — merge at rebuild

## 2026-09-23 — story-094 (#743, #744, #774): SPLIT — #743 comes out; #744 + #774 are the press conference

Anton, by voice: *"The story heading says it's post-fight statements, but
#743 is not really part of the story. It's just basically an empty mention
that he participated in the tournament. So that's one ruling. Then the two
articles #744 and #774 are exactly the same, from the same outlet. It's kind
of a summary of his octagon and backstage interviews, I want to say — but
it's in Ukrainian — maybe it's a third interview, I'm not sure."*

Checked, #744's body past the navigation: it is a **third sitting** — the
post-fight press conference in the media room. Sport.ua's own reporter was
in the press pool, asked the first three questions in Ukrainian, and prints
the Q&A (third round "under control", followed the game plan, heard "Slava
Ukraini" from the arena). It then notes that the Rodriguez callout was said
in the octagon and *repeated* at the presser. So: a different occasion from
095 (in-cage, Bisping) and 093 (backstage, UFC.com). The extractor's
"occasion: press conference in Paris" was right.

#743 (112.ua, 834 chars, "as Sport.ua reports: Donchenko took part in a
tournament in Paris where he showed his skills at the weigh-in, in the
octagon and at the press conference") is a content-farm rewrite with no
fact; the extractor's claim "participated in a tournament in Paris" is
faithful to it. Fable had it at low confidence: *"thin AI-style rewrite with
no concrete event."*

**Ruling:** #744 + #774 stay one story — the Paris post-fight press
conference. #743 leaves it and stands alone (an empty mention; bucket 3
territory for the classifier, not a story that needs a home). Applied at
rebuild.

The ruler's own eight low-confidence pair rulings are in
`clusters.json` under `low_confidence_rulings` and flagged in `REPORT.html`
under "the ruler was unsure".

## 2026-09-25 — story-062 (#529, #532, #609): correct

Anton, by voice: *"I agree with story 62 grouping because the two UFC
articles is the same article for different UFC domains — one of them is
jp.ufc, is it like a Japanese domain? — and the third article, MiddleEasy,
that's basically citing the same interview, exactly the same quotes from
Soriano."*

One occasion: the UFC.com feature interview with Soriano ("Happiest In The
Background"). #529 and #532 are the same piece served from two UFC domains
(published 2026-09-01); #609 is MiddleEasy's write-up of that interview
three days later, same quotes. Coherent at the core story level.

## 2026-09-25 — story-004 (#16, #17, #18): correct

## 2026-09-25 — story-003 (#10, #34, #78): correct

## 2026-09-25 — story-000 (#1, #2, #4, #13, #14, #33, #96): correct

## 2026-09-25 — story-011 (#115, #125): correct

## 2026-09-25 — story-008 (#51, #55, #71, #84, #90, #97, #102, #119, #193): correct

Anton, by voice, on the five above in one breath: *"004, 003, 000, 011,
008 — correct."* Story-008 is the Kawa reply to Abdelaziz; it stays apart
from story-003 (Abdelaziz's original Pound 4 Pound remark), which he ruled
correct in the same breath — a reply and what it replies to are two
occasions.

On #102 in story-008, the pair the ruler marked low-confidence (#102 vs
#78), Anton, by voice: *"#102 contains the reply, and it kind of recaps what
the reply was to. But ultimately it's the reply, and it belongs to story
eight."* The ruler's low-confidence placement stands: it was the right call.

## 2026-09-25 — story-014 (#138, #144, #148, #170, #174, #244): correct

Anton, by voice: *"014 is correct. The quotes or the extracts are slightly
different, which is fine, because different outlets may feature different
quotes in different order, or they may focus on different aspects of that
podcast — especially it was like an hour-long podcast. So this is something
to keep in mind. The silver thread here is that it's the same podcast with
Demetrious Johnson. But I'm curious — maybe we'll have to test — does the
model understand that Demetrious Johnson is the same guy as Mighty Mouse,
and that MightyCast is Demetrious Johnson's podcast? The when-and-where
source is cited slightly differently in different extracts, but it's
ultimately the same source."*

What the extractor wrote for the occasion, across the six articles: "Interview
with Demetrious Johnson ahead of UFC 330", "MightyCast podcast", "Demetrious
Johnson's podcast", "Interview with Demetrious Johnson", "Interview with
Demetrius Johnson", "Conversation with Demetrious Johnson". Same on both
runs. Six spellings of one occasion. Whether a matcher joins "MightyCast
podcast" to "Interview with Demetrious Johnson" without being told they are
the same thing is an open test for the matching stage.

## 2026-09-25 — story-035 (#273, #283): correct

Anton, by voice: *"035 is correct. Again, extracts are worded slightly
differently, but I can clearly see that the source is the same, Green Light
podcast."*

## 2026-09-25 — story-033 (#256, #269, #287): correct

## 2026-09-25 — story-022 (#203, #208, #298, #300, #301, #320, #321, #322): correct

Anton, by voice: *"022 is genuinely interesting. Almost all of the extracts
are different — these are completely different quotes or facts from the
interview. Even I myself couldn't find a full version of that interview, or a
recorded video version. And it's all published by the same outlet that
reportedly took the interview. So if that's true, it's interesting how they
reaped that interview across several articles. I would much rather love to
see that one interview as a single article or video. And I applaud Fable
that it was able to piece it into one story. I'm curious how — did Fable
decide to piece it into one story based on the source and the date range, or
is there anything in the text itself that points to the fact that these are
excerpts from the same interview?"*

Fable's own stored reason (pass 1, confidence medium): *"All eight are Q&A
excerpts credited to the same NV journalist and cross-reference each other,
so I treated them as one interview, but they span three publication dates
and could be more than one sitting."* Pass 2 kept it with a split candidate
noted (UFC topics on Aug 21 vs biography on Aug 22 might be two sittings) and
two pair rulings of "cannot tell". Eight pieces, one story, one interview —
the digest's primary-source rule (story-090) applies: link the interview
once, not eight write-ups.

On story-022, a caveat, Anton, by voice: *"Ideally they are all caught as
the same interview, but I recognize that for a lower-level model that doesn't
have access to all articles at the same time and just processes them as they
arrive, comparing the extracts, it might be difficult to link them in the
same story. This is one genuine case where the fact evidence might be more
upfront than the occasion evidence, and that may lead to different stories.
But these are not fake news. In the new design all of this should be in the
digest, summarized. This should be documented as an interesting case to test
for a digest agent — to see if the digest agent can actually piece it
together as one story, because the digest agent will have access to all
articles to date at the same time, and all the extraction details and
classification flags."* Recorded as a digest-agent test case under TODO
item 7.

## 2026-09-25 — story-032 (#249, #339): correct

## 2026-09-25 — story-015 (#152, #327, #349, #368, #397, #402, #412): SPLIT by occasion — Merab on Helen Yee (#327, #349, #368, #397, #402) apart from Gallo on Jorge Ebro's YouTube (#152, #412)

Anton, by voice: *"It seems like all the articles are about general
recovery, background information on Topuria. But a couple of them feature
his conditioning coach, and most of them feature another fighter and his
friend Merab."* Then, after Fable's rationale (two piles through pass 2,
merged in pass 3 through #402, a two-story article): *"I think we should
split it by occasion. And the Infobae article #402 should be in Merab's pile
because that account comes first in the article, and the physical trainer's
account comes second."* Checked: Merab's quotes fill the first 2,700 of
4,450 characters of #402; Gallo appears in the last third, introduced as
"a few weeks ago". Main news places the article (the story-100 rule).

At rebuild: two stories — Merab / Helen Yee: #327, #349, #368, #397, #402;
Gallo / Jorge Ebro YouTube: #152, #412.

**Caveat he asked to record, for the architecture:** *"#412 and #152 are
fifteen days apart, which goes against the three-day window, which I
believe is current. So this is something we need to take into account when
architecting the solution."* The two Gallo pieces are the same interview,
same outlet, 2026-08-12 and 2026-08-27; #402 itself dates the interview
"a few weeks ago". A three-day candidate window never sees the pair. Any
join-or-start-a-story stage that looks back only a few days will start a
second story for a late write-up of an old interview.

## 2026-09-25 — story-048 (#408, #431, #435): correct

## 2026-09-25 — story-036 (#279, #311, #442): correct

## 2026-09-25 — story-055 (#490, #491, #494): correct

Anton, by voice: *"Same article, two exact copies and one Japanese domain.
Essentially it's about fighting Soriano, but there are some interesting
quotes in it, and it's also from an official source — it's like an official
interview. So when it's in the digest it would be good to highlight it or
put it first, because it's from an official source. It just looks like a
presentable article. This is not something we necessarily should do, just
something to consider."*

For the digest design, then: a UFC.com feature is the promotion's own
interview with the fighter. Whether the digest ranks an official source
above the outlets rewriting it is his to decide; noted under TODO item 7.

## 2026-09-25 — story-054 (#462, #467, #476, #484, #492, #503): correct

Anton, by voice: *"054 correct — seems to refer to the same interview. But
hurt hands are mentioned in at least #484 and #476, and #476 reports it like
a new event, an injury."*

The extractor's view, both runs: five of six articles carry "Interview with
Sports Illustrated" as the occasion and `new_remark` as the kind; #476
(boxingnews.com) alone comes back `new_event`, "Gaethje suffered hand
injuries... that remain unhealed", with no occasion. Same sitting, one
outlet writing the quote up as an injury event rather than as something
Gaethje said. Grouping right by occasion; the kind label is the outlier,
not the story.

## 2026-09-25 — story-037.0 (#291, #427, #497): correct

## 2026-09-25 — story-037.1 (#380): correct — a different sitting from 037.0

Anton, by voice, having watched the attached videos: *"037.0 and 037.1
appear to be correct. I looked at the posts with attached videos. The two
accounts — where he talks about being bullied, and where he talks about the
lesson from his marriage — appear to be different podcasts. He is dressed
differently, and the camera angle is different."*

The ruler had cut these apart in pass 3 (the 037.x children of one
cluster). Confirmed by evidence no text extract carries: the video itself.

## 2026-09-25 — story-059 (#516, #525): correct — same Deep Waters sitting, confirmed by a shared quote

Anton, by voice: *"059 is kind of interesting too. It appears to be the same
podcast, but #516 has a video of that podcast attached — I think it's in a
tweet — so I could watch it, and #525 doesn't have an attachment, and it
seems to have different quotes. But I don't think Tsarukyan is on the same
podcast twice around the same time. So it's got to be the same one, just by
podcast. Unless you can read the articles and spot any overlap."*

Overlap found, in the text. #525 (MMA Fighting) leads with the title-defence
quote but its last two paragraphs are the Pimblett quote #516 (MMA Mania)
is built on, near word for word: *"Topuria vs. Paddy Pimblett. The fight
makes sense, but they're not going to do this fight because they need both,
they don't want Paddy to lose, they don't want again Ilia to lose, so
they're going to give to Ilia someone easy... I think he can beat Max
Holloway. If you see Max's wrestling, it's nothing... Paddy at least has a
takedown."* Both credit the Deep Waters podcast. One sitting; each outlet
led with a different part of it, and the extractor's one-sentence claim
kept only each outlet's lead.
