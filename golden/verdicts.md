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

On story-059, Anton, by voice: *"We need to record it — what if there's more
than one fact? And if we change the prompt, how is grouping going to change?
Grouping might get more difficult if the extract is bigger. So it's an open
question that we'll need to test."* Recorded under README item 9b.

## 2026-09-25 — story-063 (#533, #540): correct

## 2026-09-25 — story-068 (#572, #592): correct

## 2026-09-25 — story-065 (#551, #556, #560, #585): correct

## 2026-09-25 — story-074 (#601, #613, #625): correct

Anton, by voice: *"63, 68, 65, 74 (fight story, official weigh-in) —
correct."* Story-074 is the UFC Paris official weigh-in, the event's own
occasion, kept apart from the ceremonial weigh-in and face-off (story-084,
ruled correct 2026-09-23).

## 2026-09-25 — story-097 (#798, #803, #807, #828, #833, #862): correct

Anton, by voice: *"Story 97 is correct. Interesting that article #798 is
declared as a new event, and the extract does not reference Jon Anik. But in
the article it says 'according to Jon Anik'."*

Checked. #798 (Yahoo Sports) got the whole body, 3,200 characters, of which
the first 1,900 are Yahoo's navigation and ad furniture; "According to UFC
commentator Jon Anik" is at character 1,928. Both runs returned
`new_event`, "the UFC is having internal conversations about a rematch",
no occasion. The other five all returned `new_remark` with Anik as speaker
and the Anik Bros YouTube channel as occasion. So the extractor had the
attribution and dropped it, on two runs with the same input — not a
truncation. The headline ("being strongly considered") states the rumour
as fact, and the extractor followed the headline over the body's "according
to". One misread in six; the grouping is right.

## 2026-09-26 — claim-046 (#373) and claim-047 (#385): two claims, as built — singleton pass

Anton, on the first pair Fable could not call: *"46 vs 47, podcast with
Rogan happened in 2025, and Pimblett/BSD fight was this year, so 46 recaps
old podcast and 47 is this year's news."*

So #373 is an old Joe Rogan podcast clip recirculated in August 2026, and
#385 is Topuria's reply to Pimblett's callout after the Pimblett–BSD fight.
Different occasions; both stay singletons. Fable's pass-2 note had half of
it ("these may be old recirculated clips"). Its "clipped at almost the same
moment" came from the two X posts embedded in the articles: X post numbers
carry their posting time, and these decode to 05:29 and 05:41 UTC on
25 August 2026, twelve minutes apart, from two different accounts. Posting
time says when a clip was shared, not when it was recorded.

Anton, correcting the note above: *"the two X attachments are different —
385 is not even a video, it does not refer to a podcast."* So only #373
embeds a clip. #385 embeds a post with Topuria's reply, and nothing in it
points to the Rogan appearance. The captured text shows each embed only as
"X post, will render as live embed", so Fable guessed both were clips from
one recording; the page itself says otherwise.

Anton, further: *"385 doesn't explain the source — where he voiced his
response."* The text says only "Topuria said" before the quote, then
embeds a post from @theufcentral, a fan account that relays quotes. Where
he actually said it is not in the article. The pass-4 extractor left the
occasion empty on both runs; the v2 extractor wrote "social post, X /
Twitter", taking the relaying embed for the source — a guess the text does
not support.

## 2026-09-27 — claim-067 (#565): JOINS claim-054 — singleton pass

Anton: *"I think this opinion piece directly quoting Sports Illustrated
should join claim 54."*

#565 is Ben Fowlkes's Yahoo/Uncrowned column, 3 September. It quotes
Gaethje's Sports Illustrated interview ("I still can't punch anything",
"enjoy being the champion for the rest of the year"), the same lines five
of claim-054's six write-ups carry, then analyses what it means for the
division. It has no connection to the Paramount+ interview (claim-065):
its text names only Sports Illustrated. Fable linked them because Sports
Illustrated is the interviewer in 054 and only an outlet writing up the
Paramount+ interview in 065 (#556).

Read beside story-073.5 (#817, 2026-09-23): a column whose news is the
writer's own verdict on a fight stands alone; a column built on quotes
from one interview goes with that interview. Applied at the rebuild after
the singleton pass.

Anton, further: *"565 is basically a division analysis on the back of
Gaethje's status, based on his quote from the interview. Let's keep this
ruled as we just did for now."* Kept, and marked his words "for now": a
division analysis resting on one quote sits between the two column rules
above, and may be revisited.

## 2026-09-27 — claim-101 (#852) and claim-124 (#1125, #1129): different occasions, as built — singleton pass

Anton: *"852 is a quote from Donchenko's Instagram. His analysis of his
performance in the fight with Soriano and his look ahead, basically. 1125
and 1129 is the same article and it appears to quote Donchenko from some
interview; they don't seem to provide the source, but his phrasing is like
he is answering a question in a live conversation. So I'm ruling 852
(claim 101) vs 1125 and 1129 (claim 124) are different occasions."*

Both stay as built. A note on the source: #1125's text says once, "in a
comment to Champion", which matches his reading of a live answer to a
journalist. #852's post names no setting in its text; Instagram is his
reading of the page.

Anton, correcting the note above: *"852 actually says 'Про це він розповів
в Інстаграм'"* ("He said this on Instagram"). The live page names the
source. The saved body of #852 (1,714 characters) does not contain that
line: the body extraction dropped the one sentence that sources the quote,
so every station reading the saved text saw no setting.

## 2026-09-27 — claim-121 (#1089) and claim-113 (Jim Rome, 10 articles): different occasions, as built — singleton pass

Anton: *"For 1089, unless quotes overlap, to me these are different
occasions: a UFC event interview, and the Jim Rome show."*

Checked: no quote in #1089 appears in any of claim-113's ten articles —
not "two sides to this coin", not "money left on the table", not "a great
problem to have". #1089 says White spoke "following a Garcia vs. Benn press
event". Both stay as built. (The board card had called "a great problem to
have" the Jim Rome line; that was an unchecked guess by Claude and is wrong
— the Rome articles quote White as saying both options sound good.)

## 2026-09-27 — claim-012 (#129) and claim-008 (Kawa video, 9 articles): different occasions, as built — singleton pass

Anton, after opening #129 and #71 on the live pages: *"These are two
different occasions. 129 is a repost of Topuria's manager's social media
story, and that's a repost of some outlet on X, and it's about signaling
the rematch. The second article is a direct overview of that manager's
reaction to Abdelaziz's appearance on Kamaru's podcast. So these are
different occasions."*

Both stay as built. His reading adds what the saved text cannot show: the
"Rematch" graphic is a story Kawa reposted from an outlet's X post, not
his own video.

Anton, correcting the note above: *"No, the rematch story is an outlet
reposting Kawa's story from social media."* The direction is the other
way: Kawa posted the "Rematch" story himself, and an outlet on X reposted
it; #129 reports that repost. Still a different occasion from the video.

## 2026-09-27 — claim-039 (#305) and claim-015.1 (Gallo on Jorge Ebro, #152, #412): different occasions, as built — singleton pass

Anton: *"305 is its own claim. It's about Topuria's neighborhood, which
only mentions his recovery perspective for context."*

Both stay as built. #305 opens with two unsourced sentences recapping the
trainer's return timing; the article itself is a profile of his Alicante
neighbourhood and the Climent Club gym. Read beside #402 (2026-09-25): an
article goes with its lead, and the lead is what the article is about, not
the sentence it happens to open with. Also noted: the profile refers to
the Gaethje fight as still to come ("will be held on 14 June 2026"), so it
was written before June and republished on 21 August with a new opening.

## 2026-09-27 — body checks, six articles saved twice: all copies confirmed

Anton: *"these are same exact pages (URL, and page itself - full
duplicates): 13 and 33, #125 and #115, #491 and #490, #540 and #533, #698
and #692."*

Anton, on the sixth: *"#1129 of #1125 are the same text, slightly
different URL ("amp" part). 1129 is a column itself only, and 1125 is a
full page with all furniture, side menu with latest news."*

Recorded as same_page_as: #33 → #13 (claim-000), #125 → #115 (claim-011),
#491 → #490 (claim-055), #540 → #533 (claim-063), #698 → #692
(claim-066), #1129 → #1125 (claim-124). Each pair already sat in one
claim, so no grouping changes. Checked against the stored links: #1129
resolves to `sport-express.ua/amp/inshi/48773-…`, #1125 to the same
address without `/amp/`; the saved text of each pair is identical
(2,570 characters for #1125/#1129). This heading rules the copies only,
not the rest of those six claims.

## 2026-09-27 — body checks, #38 (claim-006): not about him

Anton, reading the live Mundo Deportivo page translated in his browser:
*"When I search the page for Tapuria, it's only mentioned in the link. in
the read, read also section."* ("Tapuria" is his spelling of Topuria.)

The article is Conor McGregor's message after knee surgery. Topuria is
named only in a related-article link beside it, which is how Google News
matched it to him. The saved text is complete and correct; the page is
simply not about him.

## 2026-09-27 — body checks, the last seven: what the live pages show

Anton, on each live page:

- **#134 (claim-013):** *"the whole article is rankings with almost with
  very little text and yes he is in those rankings Tapuria"* — he is one
  row of a rankings table. Our 478 saved characters are the page's intro
  only; the table was not captured.
- **#158 (claim-016):** *"only the links"* — an Ian Garry profile; Topuria
  appears only in links around it.
- **#230 (claim-028):** *"Amosov one time in text in passing, it's a long
  article."* — the one mention falls after our 10,000-character cut.
- **#316 (claim-040):** *"can't find topuria of the page at all"*.
- **#655 (claim-066):** *"real prediction article"* — the page is a real
  Donchenko vs Soriano predictions piece; we saved only its styling code.
- **#937 (claim-111):** *"page opens up with article about tsarukian and
  there topuria is only in headline and links, but when I scroll past
  footer links there is a second article with a headline "Ilia Topuria and
  Ali Abdelaziz, Justin Gaethje's manager, clash on social media: "You know
  perfectly well why I said it"" that mentioned Topuria several time as
  it's an update on the online span with Abdelaziz."* — so our saved text
  is the whole Tsarukyan article, not a partial one; Claude's reading
  "probably partial" was wrong. The Abdelaziz piece is a separate article
  the site chains below the first as the reader scrolls; our fetch never
  sees it (checked: the saved text contains neither "Topuria" nor
  "Abdelaziz").
- **#1161 (claim-126):** *"донченко only in the links"*.

Not about him, by what the page shows: #158, #316, #1161 (and #38 above).
He is a table row (#134) or a passing mention (#230). About him: #655.
#937's own article names him only in its headline.

## 2026-09-27 — axes draft (golden/axes.md): approved for the first experiment

Anton, on the draft's four axes, one modifier and seven proposed
boundaries (the opponent's own news bearing on his fight is "partly";
manager apart from his team; a champion who is also his opponent is
"opponent side"; Makhachev and friends like Merab are "other fighter";
a journalist's leak is "media" and "rumoured"; predictions are their own
act; depth, novelty and place not labelled now): *"Okay I agree with your
hypothesis for next experiment, go ahead I want to see what pans out."*

Approved as the questions of the next classifier run, not as final
rulings: the axes are revised where that run or his corrections show a
boundary that the model or he cannot apply.

## 2026-09-27 — gate label, claim-073.3 (#683, with #714, #737): not "not about him"

Anton, reviewing the v3 claim map: *"I think it's an issue #683 classifier
saying not about him"*.

#683 is MMA Fighting's full UFC Paris results page; Donchenko's entry is one
line, "Daniil Donchenko def. Punahele Soriano via unanimous decision (30-27
x2, 29-28)". The classifier (v3, all three readers) answered "not about him";
the extractor wrote his result as a new event. The classifier followed the
question as written, which put "one entry in a card, ranking or list" under
"not about him" whatever the entry says. His result is a career event (goal
G1), however short the entry.

## 2026-09-27 — design: "about him" is a signal, not a blade

Anton, after #683 (his result, one line on a card results page, answered
"not about him"): *"this about him or not about him ... it's like a blade
that cuts a big potentially useful articles it shouldn't be a blade yes or
no we should judge whether article moves forward on the pipeline probably
from from multiple flags or from some kind of percentages. But there
shouldn't be one blade that cuts unanimously cuts articles away."*

So the gate's answer is kept as a probability beside every other answer,
nothing is discarded because of it, and whether an article moves on is
decided downstream from several signals together.

## design: source "other fighter" becomes "other fighter's side" (2026-09-28)

After #10 (Ali Abdelaziz, Usman Nurmagomedov's manager, wanting Topuria for
Usman) left the answer-key readers with no value (none of these / opponent
side / other fighter), Anton: *"It looks like we don't have a good bucket
for another fighter's manager. Maybe we should have like other fighter's
side (fighter, his team, his manager) as one value"*. Applied: the value
covers another fighter not linked to a fight with him, or that fighter's
coach, manager or team; opponent side (the linked fighter and his camp)
stays separate.

## design: centrality, "only mentioned" vs "one of several" is decided by what is new (2026-09-28)

On #856 (MARCA's review of Spain's UFC year, built around debutants Sosa
and Sintes; Topuria gets one paragraph recalling his June loss and
fractures and a line on his recent messages) the readers split two to one
and Anton was on the fence: *"he is both mentioned and he mentioned among
several Spanish fighters"*. Offered two rules (A: judge what is new about
him, not how long his part is; B: judge how many people share the article,
up to three for "one of several"), Anton: *"A, write it into the guide"*.
A part that only retells known things is "only mentioned" however long;
"one of several" needs something new about him while he shares the stage.
#856 is "only mentioned".

## design: "opponent side" means booked or fought, nothing looser (2026-10-02)

The guide said "booked against him or publicly linked to a fight with him",
and the readers read Pimblett's rumoured and denied December fight (#820)
as a link. Offered the camp brief's three rules (booked or fought; reported
as news, which adds talks and rumours; publicly linked, which adds
callouts), Anton: *"I want to go with rule one, booked or fought. It should
be very clear from the article that this is a booked fight, like he is
fighting someone in December. If it's rumored, somebody said something,
somebody disproved it, that shouldn't count as an opponent."* On #820 he
kept fact next fight and how firm rumour (*"the talk might be about
potential next fight, still"*) and changed source to other fighter's side.
Source and fact are separate axes: a rumour is news about his next fight
without making the rumoured man his opponent. The next-fight question is
reworded to say "the state of his next fight" so a rumour or a denial reads
as yes.
Applied the same day to all 43 articles labelled opponent side (a blind
re-read, experiments/2026-09-27-answer-key/overnight/opponent-out.json):
16 flip to other fighter's side (#34, #78, #166, #228, #283, #311, #423,
#442, #820, #838, #843, #871, #889, #892, #913, #921: Pimblett's wishes
and rumours, Méndez and Abdelaziz speaking for Makhachev or Usman
Nurmagomedov, the Donchenko–Rodriguez callout), 27 stay (every Gaethje
article: they fought; the Soriano pre-fight pieces: booked). Anton on
#228, Makhachev's verbal acceptance: *"it was never officially booked…
they would both have to accept for UFC to announce, so it doesn't
count."* On Gaethje: *"too hard to demand the model know whether it's a
future or a past opponent; Gaethje stays."* Written as corrections in the
page's database with the rule as the note, not into readers-v1.json.

## design: rule 3, count only what is new, adopted for every fact and news question (2026-10-02)

On #1002 (Pantoja's message to Topuria; the saved text recaps his injuries
and ends on a UFC-sourced rematch rumour; the readers' majority had fact
next fight, how firm rumour, reports his next fight yes), Anton: *"The
problem is that we're applying these fields to different claims in the
article. The article is about Pantoja sending a message to Topuria. For
that message the fact should be no fact, how firm none, reports his next
fight no. If there's a possible fight announcement from Jon Anik, I'm sure
there are articles that directly talk about that, and they should be
assessed. In this article we should not be paying attention to all this
background stuff. We should be focusing on assessing the one main claim of
the article."* Then: *"adopt rule 3."* Backlog rule 3 (and 5, a guess at
his timing, which it covers) is written into the guide under question 4,
with #856, #462 and #1002 as the worked examples. The classifier keeps
answering each question on its own; the contradiction stays a doubt flag
there, as decided on 2026-10-02 (the blade question).
Applied the same day: six blind readers re-answered fact, how firm and
the three news questions on the 134 articles the rule can touch
(experiments/2026-09-27-answer-key/overnight/rule3/). 76 change: reports
his next fight yes → no on 57 (fight-week previews, picks and card lists
where the booking is the premise; interviews with a boilerplate "fights
Soriano on 5 Sept" closer; reaction pieces where the rematch rumour is
premise or closing line), fact next fight → no fact on 25, health → no
fact 6, result → no fact 6, reports his health yes → no on 13 (the
fractures recapped), result yes → no on 8. Anton's calls on the three
open clusters: the day-after callout pieces (#774, #789, #794, #797,
#813, #852) keep source himself and act speaks of himself, fact no fact
(*"it's a callout, basically"*); #510 and #616 are fight week event, not
no fact (*"announcements of the fight week after the fight was already
booked"*); the seven low-confidence reads (#605, #745, #852, #1045,
#1066, #1089, #1172) applied as read, cards left unchecked for him to
read. Written as corrections in the page's database with the rule and the
reader's one-line main claim as the note.

## #843 and the rule A moves: a callout is nothing new about him (2026-10-02)

On #843 (Pimblett's return timeline and hit list, Topuria prominent in
it) Anton was on the fence between only mentioned and one of several:
*"Topuria is not just one of them, he's prominent, because Pimblett is
talking about him mainly."* Shown rule A (what is new about him: only
that Pimblett wants the fight), the guide's own line (a fighter only
calling him out does not count) and both blind rule A re-readers' move
to only mentioned, Anton: *"I agree only mentioned is objectively about
the article, and he's not at the same level as Pimblett perhaps. I'll
buy this interpretation."* Of the 9 articles both re-readers moved, #34,
#843 and #856 already stood at only mentioned; #342, #588, #820, #871,
#892 and #921 are corrected to only mentioned in the page's database. On
#820 Anton had first kept one of several, then: *"if the same rule
changes 820 to only mentioned, I can be fine with it."* All 9 moves stand.

## #619: a two-fighter preview is one of several, whatever brought it to us (2026-10-02)

Anton: *"By context Donchenko should be the main one, because we observe
him; Sport.ua wouldn't write about Soriano, this article is there because
of Donchenko. But from pure article context it makes sense to say one of
several, because it explores Donchenko and Soriano in equal measure."*
Confirmed as the guide's line: the label describes the article, and must
be decidable from its text alone; why the article reached us is for the
decider and the settings, not the label. Applies to #599 and the other
Paris previews the centrality brief flagged as "arguably main subject".

## A reported rumour is a fact at rumour firmness; a wish alone is no fact (2026-10-02)

Seven Pimblett pieces from the same two days split under rule 3: #820
and #838 report a third-party rumour (Tim Welch, "rumoured for UFC 335")
that Pimblett answers, so fact next fight at rumour, reports his next
fight yes; #843, #892, #913, #921 carry only his wish ("I'd love to smash
his head in", a hit list), so no fact. #871 was first put with the rumour
pair on its headline ("Rumored ... Grudge Fight"); Anton asked *"do we
have a third-party rumour in 871 though?"* and the body has none, only
the interviewer's question and Pimblett's wish, so it was put with the wishes. The body does carry one unsourced line ("with rumors
swirling that Topuria could make his UFC return against Pimblett");
Anton, shown the choice (any asserted rumour counts, or only one with a
who, when or where): *"go with no for this one."* A rumour needs
substance; "amid rumours" framing alone is a wish piece. Anton saw the disparity, was shown
the line and the alternative (collapse all seven to no fact), and kept
the line: *"let's keep A, if there's real article content that makes the
model go one way or another, like the third-party rumour."* The test is
in the text: is a rumour or talks reported by someone other than the
speaker.

## #913: the same quote, framed as his options, is next-fight news (2026-10-02)

ABC's piece (paywalled live; the saved text is the full article) lays out
Topuria's two next-fight paths, the Gaethje rematch that Anik says will
happen or the Pimblett rivalry, recalls the UFC's failed January attempt,
and quotes Pimblett's wish as one input. The rule 3 reader took it as a
Pimblett wish piece (no fact); Anton, on the translation: *"based on how
it's written from Topuria's view on two options, I agree"* that the fact
is next fight at rumour and reports his next fight is yes. The same Anik
line is background in #1002 (a closing sentence under Pantoja's message)
and the spine here. Anton: *"It's interesting how the writing style can
differ. It's the same thing, but written differently, and it causes
different flags."* That is by design: the label describes the article as
written; the claims layer is where the same event is recognised across
articles.

## design: a retired fighter speaking as a pundit is still a fighter (2026-10-02)

Matt Brown, retired, on a podcast, was labelled media on #879 and #905
("speaks as a pundit") and other fighter's side on #901; Masvidal,
Alvarez and McCann on podcasts were other fighter's side throughout.
Offered rule A (a fighter is a fighter, active or retired; 2 flips) and
rule B (speaking as a pundit makes you media; 6 flips, and a judgement
about the role), Anton: *"Retired fighters become kind of pundits, they
can also be podcasters, so the line is blurred. If we could make a clean
line… but then the model has to know who's retired and who's not, and I
don't want to introduce that complexity again. So another fighter is
fine."* Rule A: #879 and #905 corrected to other fighter's side.

## design: a fact stated inside the main claim belongs to it; health follows who states it (2026-10-02)

On #723 (heavy.com on Topuria's essay; rule 3's re-read had turned the
readers' fact health into no fact, the fractures being "a line inside the
reflection") Anton: *"He genuinely mentions health details that are
nowhere else, for example the broken foot. The main opinion is about his
motives and his state of being, and the health is wrapped in that, but
it's still part of the same opinion. It's not a separate news. Can we
consider health as a flag that goes on the back of the main message?"*
Yes, through the axes as they are: act speaks of himself carries the
message, fact health the one hard fact in it. The test, from the health
brief's rule C: health is yes when someone the article names states his
condition as a statement of its own; the writer's recap is background.
A blind re-read of the 27 articles where health was in play
(overnight/health/) changes five, applied on his "apply": #693, #723,
#755 (the essay pieces) and #1172 (Donchenko on his arm infection, in his
own interview) return to the readers' fact health, official, health yes;
#129 goes to health no (the writer reading photos). #627 stays no, where
the brief's own reading of rule C had yes: its "no surgery" line is an
older MMA Fighting report recalled by the writer, not what the article is
built on. #148 (a trainer's line in an appended section) and #1058
(readiness only) stay no, low confidence.

## design: the three news questions are the main fact or a second fact, never a mention (2026-10-02)

Anton asked whether the yes/no questions can be independent of fact, and
if not, why they exist. Measured on all 300 with the day's corrections:
whenever fact is result, next fight or health its question is yes (69 of
69); a question is yes beside a different fact on 4 articles (#152, #402:
a return date with a recovery update; #412 the mirror; #203), never beside
no fact. Before rule 3, 57 next-fight answers were yes on mentions. Kept,
with the definition written into the guide: they carry the second fact
that the single fact value cannot, and in the classifier, where each
question is answered blind to the others, a disagreement between fact and
its question is the doubt signal.

## design: "status update" approved for a reader pilot, with three rulings (2026-10-02)

Backlog item 12. Anton reviewed the wording side by side (what the readers
see, what the classifier sees) and ruled on the three open points before
any run:

- **The name is status update.** *"I will go with your pick, status
  update. That's fine."*
- **Recovery and return date in one statement: health.** #152, #402 and
  #412 are three write-ups of one interview with his coach; the readers had
  given two of them next fight and one health by headline. Ruled with
  doubt: *"I don't know which one's better ... maybe I'm making this more
  complicated ... let's go question two A."* The return date is then in no
  label. Revisit if a return date is ever missed because of it.
- **A wish is no fact, whoever makes it; next fight stays strict.** On his
  manager's rematch demand (#129), the only "next fight, wish" in 300:
  *"we can be opening Pandora box here ... there can be too many articles
  falling into next fight if we're not strict about it"*, then *"I agree
  with question three on being strict."* Source (his manager) and act
  (steers him) still carry it. The "wish" level of how firm is now unused.
- **The classifier stays out for now**: readers first; he returns to
  labelling before any v7.

Not yet adopted into key-guide.md: the wording is in
experiments/2026-09-27-answer-key/wording-proposal.json and is being tested
by blind readers (status-pilot/).

## review: the five articles the status-update readers moved that nobody predicted (2026-10-02)

Both blind readers gave a new answer on five articles outside the intended
moves (status-pilot/result.json). Anton went through them on the page:

- **#913 changes to no fact**, replacing his ruling of the same morning
  (next fight, rumour). *"This is something we agreed to avoid, because
  everything will become rumor about next fight then."* A rumour with a
  who, when or where is still next-fight news (#820, a December date); here
  Anik's rematch claim is a passing line, as in #1002, #879, #901, and the
  article is Pimblett's wish and the writer's analysis. Four blind readings
  and the overnight brief's rule had all said no fact.
- **#851 changes to no fact.** Donchenko calls out Rodriguez two days
  after his Paris win. Anton first kept result (*"it also gets on the back
  of his win result"*), then reconsidered: *"I may agree if it's a no fact,
  because the main thing here is a call out of Donchenko for Rodriguez and
  not the win ... I would guess that there were articles before that only
  spoke about win."* There were: 29 on 5 and 6 September; this one ran on
  the 7th with the callout as headline and lead and the win as a recap
  paragraph. Rule 3 as written, and what both re-readers said. He also
  noted the list has no fact value for the watched fighter calling someone
  out; it is carried by act (speaks of himself: what he wants next).
- **#1089, #620, #342 stay as they were** (no fact; personal life;
  personal life), against the readers' status update, status update and no
  fact. #1089: White's line about Topuria is the frame of a Gaethje piece.
  #620: the same video letter to his son as #627 and #651, under a headline
  that says he announces his return.

The 16 intended moves were then written to the page as corrections with a
note each (status update: #958, #972, #991, #998, #1008, #1020, #1031,
#1036, #1058, #1076, #572, #592; health: #152, #402, with #412 losing its
next-fight yes; no fact: #129). None of the 16 cards was marked checked
before, and the health corrections already on five of them were kept.

## rule: "reports his result" is yes only for an account of the fight itself (2026-10-03)

Anton finished the result group (#44, #778, #779, #797, #1172) and asked
whether he had been following the brief's recommended rule. The brief
recommended "lead clause" (yes when the headline or the first sentence's
main clause states the outcome); his five answers match it on four and
match "fight account only" on all five. The one that tells them apart is
#1172, a long interview ten days after the Paris win whose first sentence
restates the win before the interview begins: lead clause says yes, he
answered no. *"I thought we already had rule two, but yes, add it to the
guide."* It is rule 3 in this question's terms, and it agrees with #851
(a callout two days after the win is no fact). Written into the guide on
the question and on the `result` fact value.

## review: the opponent-or-other-side group is done; "booked or fought" confirmed (2026-10-03)

Anton checked the seven cards (#148, #283, #423, #588, #889, #896, #953)
and asked whether he had been following the brief's recommended rule,
"reported as news". Both rules give his answers on all seven; they differ
only when a rumour with a date exists and the rumoured opponent speaks,
which is #820, where he had set Pimblett to other fighter's side. *"Okay,
I agree with the booked or fought then."* No guide change: that rule has
been in the guide since 2026-10-02. On the way he kept `calls_him_out` on
#953 (Pimblett's "would love to fight him" is only in the writer's words;
the quote is "nothing yet") and on #889 (backlog 14), and kept #896 as
next fight, rumour (a December Pimblett fight, named by Tim Welch).

## rule: "talking about another fighter" is only mentioned when nothing comes back to him (2026-10-03)

#373: on a podcast Topuria says he was never a fan of Demetrious Johnson
because he took "Mighty Mouse" for "Mickey Mouse"; Johnson jokes back at
him. Two of three readers had applied the guide's line (him talking about
another fighter is only mentioned, even at length). Anton: *"Why in 373
it's only mentioned and not one of several?"* Of the 58 articles where he
is the one speaking, only two are not main subject: #1260 (Donchenko
comparing Makhachev's streak with Silva's; nothing comes back to him) and
#373, where the story is his own slip and the reply is aimed at him. By
rule A there is something new about him. Ruled one of several, and the
guide's line gains "when nothing in the article comes back to him".

## design intent: fact and firmness together route an article; neither is a blade (2026-10-03)

After the rumour audit (11 articles next fight at rumour, 6 with a rumour
but no fact), Anton on why the fact stays "next fight" for a rumour:
*"with this rule that we can have a fact there is a fight, but it's a
rumor, then we avoid having a blade and we can still have ... officially
reported fights, bookings, and rumors going to digest, for example. And
that would be a realistic outcome."* The label records the kind of news
and, separately, how settled it is; the decider routes by the pair (and by
who said it): official at once, rumour to a digest. Nothing is dropped by
a label. Consequence for the classifier: "how firm" becomes a routing
answer, so its accuracy (about 79% in v6) matters more than before.
"We'll need to test it."

## rule: a callout article is the other fighter's story, never "main subject" (2026-10-03)

On #273 (Pimblett wants Topuria or Tsarukyan next) Anton noticed the
readers split between the two ends, main subject and only mentioned, and
that their notes say the guide excludes the middle: *"Is there some tension
here that should be resolved?"* The cause: "main subject" includes
"something someone said about him", which a callout literally is, while
"one of several" excludes a fighter only calling him out. He also objected
to a rule that leans on the first paragraph (*"sometimes first paragraph is
just the opening and the real substance comes ... after a paragraph or
two"*), so the rule is stated by the article's main claim, judged on the
whole text; no adopted rule depends on position. He found the exclusion on
"one of several" harsh and asked for pushback; the softer version is parked
(backlog 15) and he took the recommendation: *"okay, go with your
recommendation."* The guide's main-subject line gains one sentence; the
callout line stays; #273 stays only mentioned. No card changes.

## rules for "what the source does": a taunt is a callout; another fighter on himself is none of these (2026-10-03)

#492 (a Gaethje video interview about his own sore hands; the readers
split three ways): Anton asked whether an opponent can "speak of himself",
and settled on none of these: the article *"says nothing about Topuria. It
talks about Gaethje."* The two passing lines about Topuria are a hedge and
a guess at his timing. #287 (Tsarukyan: "Chandler must be next for
Topuria, he really needs an easy fight", which the article calls ironic
and a provocation): he first read it as steers him, since it names an
opponent, then kept the readers' majority: *"I agree with your
interpretation. Call out is not just a literal call out."* The guide's
lines for both values now say so. Reading the words as written would have
made #492 "steers him" as well.

## #484 and #462: one text, one act; six write-ups of one Gaethje interview (2026-10-03)

#484 (MMA Fighting) and #462 (the Yahoo copy, word for word) carried
different acts from the readers: steers him and gives news of him. Anton on
#484: *"the only material thing is Gaethje's guess that Topuria maybe won't
fight until next year ... it's Gaethje's opinion, and it's a little bit of
steering, but I wouldn't be mad at none of these."* Both set to none of
these: the article is Gaethje's own news, the guess is not news of him
(#462's own ruling on fact), and the hedged "not my next fight, in my gut"
is about Gaethje's fight (as on #492, the video of the same interview).
The six write-ups now read: #462, #484, #492, #476 none of these; #503
steers him, because its headline is the rematch itself; #467 steers him,
unchecked, to look at in a later step.

## rule: an act needs a plain statement about him (2026-10-03)

With the eight cards of the "what the source does" group checked, Anton
asked: *"are we basically going with the recommended firm and aimed at him
or not?"* Yes: his cards match that rule on all eight (the brief's own
table had #1045 wrong, giving "gives news of him" to a card whose fact is
no fact, against the rule's text). Against the other two candidates they
match on one of eight (words as written) and four of eight (framing sets
tone, hedges still count). Five of the eight ended as none of these (#457,
#484, #492, #975, #1045); #287 calls him out, #516 steers him, #883 gives
news of him. *"Yes, add it to the guide and rules file."* The readers had
split on six of the eight for want of this rule.

## Step 1 finished: the last cards (2026-10-03)

All 75 cards of step 1 ("readers differed") are checked. The last rulings:

- **#1089 stays no fact**, against both re-readers' status update. Anton:
  *"I will keep no fact, coz I'm not sure what is even the update on status
  that we are getting... White says he is considering these fights
  basically."* The article itself calls White's Gaethje-or-Pimblett line
  last week's talk, the frame of a Gaethje retirement piece.
- **#1089 and #856: act set to none of these.** Both carried "gives news of
  him" beside "no fact", which the rule from #1045 forbids. Anton first
  agreed with "gives news" on #1089, then with none of these when the
  collision was shown. Three more cards carry the same pair and are not
  checked yet: #327, #762, #1066.
- **#647 left as the readers' majority has it (no fact).** The saved text
  is one line plus the site's comment policy. Anton: *"Let's not spend too
  much time on this since this is a junk article with no body."* The
  personal-life reading (the same letter to his son as #620, #627, #651)
  was not taken up.
- **#654 keeps source "fans".** The only thing said of Donchenko is the
  site's readers' vote ("Readers 148-65: ... Donchenko (71%)"); the staff
  picks were not saved.
- **#823: he speaks is no.** Anton: *"There is barely a quote, only
  paraphrasing what he talked about."* The Instagram post is only
  mentioned, and the two quoted words are recalled from after his previous
  fight. New rule: "He speaks only when his words are there".

The copy check after step 1 is clean: 33 near-identical pairs, 30 with
identical labels, and the 3 that differ are different UFC.com video pages
(#521, #740, #746).

## The blind re-read after step 1, and what it changed (2026-10-03)

Two blind readers on 35 articles under the guide as it stood after step 1
(experiments/2026-09-27-answer-key/reread-1003). Both gave the key's
answer on 161 of 175 answers. Five of the six rules decided on 3 October
are carried by the wording. The sixth was half written: the guide said a
callout article is "never main subject" and did not say a callout alone
leaves him only mentioned; one reader of two gave one of several on all
five Pimblett callouts. The sentence was added.

- **#913: main subject becomes one of several.** Both readers: the piece
  is built on Pimblett's quote and half of it weighs Topuria's two
  options. Anton: *"I'm okay to go with readers."* The rule now reads: a
  callout alone is only mentioned; when the article itself adds something
  new about him, one of several.
- **#516: steers him becomes none of these.** Both readers applied the
  sentence "a forecast of what the matchmakers will do" is not an act.
  Anton: *"okay with none of these."* This corrects the count in the
  section above: of the eight cards in the group, six end as none of
  these.
- **#1089 stays no fact**, with both readers again at status update.

- **#148: no fact becomes health again.** Anton: *"I still think it's not
  health because health is old news, and these injuries reverberate
  through all news, but I get that maybe from isolated context, for the
  model it's not clear so maybe health is fine"*, then *"yes to health on
  148"*. A named trainer "ha revelado" that his recovery is ahead of
  schedule, under its own subheading: "health follows who states it", and
  a second fact beside the main claim counts. The correction to no fact
  of 2 October had applied "only what is new" too hard; the three original
  readers and both re-readers all said health.
- **Rerun of the callout rule**, with the added sentence and the callouts
  spread across batches: both readers, 95 of 95 answers as the key has
  them. The rule is now carried by the wording.

## After the full re-read: 19 unchecked cards confirmed by group (2026-10-03)

Two blind readers re-read all 300 articles on all nine questions under the
guide with the 27 rules (experiments/2026-09-27-answer-key/full-reread).
On 244 articles both gave the key's answer on all nine. On 21 cards Anton
had not checked, both gave the same answer, different from the key. 19 of
them were put to him in seven groups, each tied to a rule already in
force. Anton: *"Agree on all A, B, C, D, E, F, G."* Written as corrections
with a note each; the cards are not marked checked.

- **What the source does becomes none of these** (an act needs a plain
  statement about him): #467, #533, #540, #861, #238; #510 also to source
  media and no fact (he is one line in a card list).
- **He speaks becomes no**: #933, #934 (two words recalled from the
  post-fight interview).
- **A taunt is a callout**: #408, assesses him to calls him out.
- **A callout is the other fighter's story**: #78, main subject to only
  mentioned.
- **How central, one step**: #762 (also act: gives news of him to assesses
  him), #833, #1146 main subject to one of several; #1160 only mentioned to
  one of several; #688 one of several to main subject.
- **Whose words**: #187 opponent side (booked or fought), #247 other
  fighter's side (a fighter is a fighter), #655 media (the saved text is
  page styling only).
- **Health follows who states it**: #327 to health, reported.

Held for the next step with the checked cards: #745 (a booking notice,
the twin of #605) and #1101.

**A second kind of check mark (2026-10-03).** Anton, on the 19 cards
above: *"Mark them checked, I did not open but your summary was clear ...
Maybe we should mark them as checked by summary? A different kind of
check?"* The card record now carries `how: "summary"` beside
`reviewed: true` when he confirmed a card from a grouped summary without
opening it. The page shows "checked by summary" and counts them
separately; marking the card himself turns it into a plain check. Checked
after this: 96 cards, 19 of them by summary.

## After the full re-read: the cards where both readers disagreed with a ruling (2026-10-03)

Ten checked cards and the two held ones, put to Anton in four groups.
*"H, I, J"* agreed as proposed; on K he ruled card by card.

- **H, a later rule reaches an earlier check.** #283 and #423 (Pimblett
  callouts): one of several becomes only mentioned. #503: steers him
  becomes none of these, so all six write-ups of the Gaethje interview
  agree. #342 (a roundup of athletes in the army): none of these, no fact,
  he speaks no; this reverses his "personal life" of 2 October.
- **I, the article's whole content is the booking.** #605 and #745, two
  short notices that he fights Soriano on 5 September: next fight,
  official. This reverses his "no fact" on #605. The booking is background
  when it is the premise of a preview or a pick; when nothing else is in
  the article it is the main claim. That it is old news is for the
  grouping station to catch.
- **J.** #820: only mentioned becomes one of several; an article that
  carries a new rumour about him says something new about him.
- **K.** #1089 becomes status update. Anton: *"I'm open to status update
  if readers never say no fact. Seems like Topuria is ready to fight in
  the article makes it read as status."* Checked: eight readings since the
  value exists, all eight status update. Act returns to gives news of him.
  #1101: *"Same on 1101, if readers never take no fact, we can set status
  update."* Checked: three of four readings say status update, one says no
  fact, none says the key's personal life. Set to status update and
  recorded as a coin flip with no fact, since his condition was missed by
  one reading. #913: *"agree with a flip"* (one of several; main subject
  accepted). #588: *"agree flip"* (only mentioned; one of several
  accepted). #625: *"it's written a bit more about Donchenko, so agree on
  a flip, but if latest readings are main, can be main, but genuinely can
  be a flip"*: main subject, one of several accepted.

The accepted coin flips are listed in golden/coin-flips.json: on those
answers either value counts as right when anything is scored.

## The third reading: seven changes and three more coin flips (2026-10-03)

Each of the 26 articles where the two full readers differed was read a
third time by a fresh agent that saw only that article. Of 46 disputed
answers, two of three readings gave the key's answer on 32. Anton: *"yes
to L and M"*.

- **L, two of three readings against the key.** #1066: no fact becomes
  next fight at rumour (Dana White's hint at Pimblett), with status update
  accepted. #737: only mentioned becomes one of several (a live blog with
  three rounds of his bout). #740: source no one, act reports an event (a
  video caption with none of his words), replacing his own earlier
  "himself, speaks of himself" and matching #746. #606: he speaks no. #97:
  one of several. #948: other fighter's side. #134: promotion.
- **M, three readings and three answers.** #361 keeps health, personal
  life accepted; #224 keeps media.

With this, every one of the 300 articles is either settled or recorded as
a coin flip (seven answers, golden/coin-flips.json). Checked by Anton: 104
cards, 27 of them by summary.

The spot check is drawn: 20 cards at random (seed 20261003) from the 186
articles on which both full readers gave the key's answer on all nine
questions and which no person had checked
(experiments/2026-09-27-answer-key/spot-check.json).

## The spot check, and the freeze (2026-10-03)

Anton read the 20 spot-check cards (drawn at random from the 186 settled
articles no person had checked) and marked all 20 checked without
changing an answer. The agreed bar was one wrong or none.

The labels are frozen in golden/labels.json: 300 articles, nine answers
each, 240 of them corrections to the first readers' answers. 97 cards
were read by Anton, 27 confirmed by him from a summary, and 176 stand on
the two blind readers of the full re-read. Eight answers are recorded
coin flips. A test guards the file's checksum and the ties between
answers; it was checked by breaking one answer on purpose.
