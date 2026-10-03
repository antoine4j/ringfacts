# Rule backlog

The working list for the next rounds of labelling and prompting: proposed
rules for labelling and for the classifier that Anton has not decided yet,
with the notes from the reviews that raised them. Nothing here is applied. When he rules on one, it moves out:
an adopted rule goes into the labelling guide
(experiments/2026-09-27-answer-key/key-guide.md), golden/axes.md and, for
the classifier, its questions or its composing script; his words go to
verdicts.md. A rejected rule is deleted here with one line in verdicts.md.

Decided so far (not in this list): "other fighter's side" (2026-09-28),
centrality judged by what is new, not by length (rule A, 2026-09-28),
"where" stays unlabelled, taken from the extractor (2026-10-01), and
"opponent side" means booked or fought, never a callout or rumour (was
rule 6 here; 2026-10-02).

## Parked by Anton, to review later

### 1. A vague mention with no details is not a fact
*Labelling. From #856, 2026-10-01.*
"He has made a couple of statements", with no content, date or place, is
no fact. Anton kept #856's fact as "no fact" on this reasoning and asked
to park the general rule. Would settle other articles with one-line,
detail-free mentions the same way.

### 2. When he does not speak, the source is not "himself"
*Classifier, composed in code. From #856, 2026-10-01.*
If the classifier's "he speaks" answer is no, drop "himself" from its source
answer and take its next most likely option (consolidate.py; the questions
do not change). On stored answers against the readers' labels: 8 tune-side
answers changed, all 8 for the better (fight reports become "no one", a
writer's article "media"). Breaks video pages whose words are not in the
saved text (#521). Anton: review once more articles carry his labels.

## Proposed, not yet discussed

### 3. Count only what is new: next fight, health and result
*Labelling. Boundary #1 of the reader disagreements, about 85 of 134.*
Rule A applied to facts: a booked fight, an injury or a result restated as
context (a preview, a weigh-in report, a card list, a recap) is background,
so "no fact" and "no" on the yes/no question. Examples #608, #609, #614,
#500, #856. Worked example, #856 (2026-10-01): Anton read
"does this article report, as its news, an injury…" and saw why a reader
said yes (the fractures are mentioned), then answered no: the injuries are
old news, the only new thing is his return to the public eye, and the
article is not about him. The question only works if "as its news" is read
strictly.

**Constraint (Anton, #462, 2026-10-02):** he judges "old news" from the
backstory he knows; a model reading the article cold weighs every fact the
same. Any rule here must be decidable from the article alone (dates, past
tense, "after his June loss", "Gaethje guesses"). #462 is the second worked
example: Gaethje's article recaps the fractures and guesses Topuria will not
fight until next year; the readers split three ways on fact (next fight /
health / no fact), Anton chose no fact.

**Consequence to adopt with it:** fact "no fact" means the article carries
no news about him, so the yes/no news questions (result, next fight,
health) are all "no", and how firm is "none" (already set in code). Fact
picks the main news only; when there is news, several yes/no answers can
be yes (a fight report that also names his next opponent).

**Labels, not the classifier (Anton's blade question, 2026-10-02).** In the
labels "no fact means no on the news questions" is a definition: it keeps
one article's answers coherent. In the classifier it would be a blade: one
wrong "no fact" would wipe out three answers that may be right, the #683
problem again. So the classifier keeps answering each question on its own,
and a contradiction stays a doubt flag (the claim map's "fact answer and its
yes/no question disagree", 29 claims in v6), not a rule applied in code.
Anton's argument for tolerating misses near "no fact": a significant fact
is reported more prominently by other articles of the same claim, which
carry it. Caveat: 81 of 128 claims are one article (most Donchenko news is
a single Ukrainian outlet), so for small fighters a missed fact may be
missed everywhere.

**Wording alone did not settle it.** The classifier's yes/no questions went
from "does it report" (v4: result yes on 224 of 300, read as "mentions") to
"as its news" with background defined as no (v5), before the Fable readers
labelled; the readers had the strict wording from the start and still split
on #462 and #856. The line between "reports as news" and "mentions" needs
the rule above and examples, not more rewording.

### 4. Content not in the saved text
*Labelling flag. From #740 and #521.*
Where the real content is a video (or otherwise not saved) and our text is
only a caption, flag the article after Anton confirms it on the live page,
as with #655; label what the page is, and leave the classifier unscored on
answers only the video holds.

### 5. Someone's guess about when he will fight again
*Labelling. Boundary #2, about 6.*
Gaethje's "probably not until next year" (#462, #503), an outlet's
"expected back in early 2027": news of his next fight (a timeline, rumour or
reported) or opinion ("no")?

### 7. Main subject or one of several
*Labelling. Boundary #4, 4.*
Two-fighter articles where he is arguably the lead (#269, #625, #687).

### 8. Reported or official
*Labelling. Boundary #5, 4.*
A booking the UFC announced, relayed by another outlet (#605, #342).

### 9. Act: gives news of him vs steers him vs only mentioned
*Labelling. Boundary #6, about 12, scattered.* (#484, #883, #975)

### 10. Media or fans
*Labelling. Boundary #7, 2.* A fan tweet quoted inside a journalist's
article (#654, #883).

## Candidate rules from the overnight briefs (2026-10-02, not decided)

Eight briefs, one per boundary of the readers' disagreements
(experiments/2026-09-27-answer-key/overnight/briefs/out-<group>.json;
shown on the correction page above each group). Each offers 2–3 rules
formed from tune/check articles only, with the answer every rule gives
per article. The recommended ones, with the disputed majorities each
would change:

| boundary | recommended rule | changes |
|---|---|---|
| next fight (rule 3, 5) | "own news": yes only when a change to his next fight is the article's subject or its own new reporting; a booking that is the premise of a preview, weigh-in or pick, a recalled rumour and a hedged guess are no and no fact | 16 of 30, plus 9 unanimous "yes" on Paris previews |
| health (rule 3) | someone named (he, his team, the UFC, a named outlet) states his condition; the writer's recap is background | 2 of 6 |
| result (rule 3) | yes only when the headline or the first sentence's main clause states he won or lost | 2 of 5 |
| camp (decided 2026-10-02: Anton took the stricter "booked or fought") | — | 3 of 7, plus every Pimblett article labelled opponent side |
| centrality (rule 7) | "whose news": the headline and opening decide; a body-less page is judged on its headline | 0 of 10 |
| act (rule 9) | a plain statement about him; guesses, forecasts and a speaker's own rematch stance are none of these | 1 of 8 |
| firmness (rule 8) | past tense or a named card and date is official or done; otherwise the speaker decides: promotion or he himself official, a named outlet or other person reported, unnamed sources or an open choice rumour | 1 of 4 |
| other (rule 1, 10) | any direct quote is "he speaks"; a post only named as the channel does not make him the source; a fan line quoted by a journalist is fans; a statement with no content is no fact (this is rule 1, parked) | 0 of 5 |

The next-fight brief is the one that matters: its rule is backlog rule 3
written out, and it touches 25 articles. The others are small; act and
firmness rest on two non-test articles each.
