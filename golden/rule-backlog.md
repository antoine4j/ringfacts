# Rule backlog

Proposed rules for labelling and for the classifier that Anton has not
decided yet. Nothing here is applied. When he rules on one, it moves out:
an adopted rule goes into the labelling guide
(experiments/2026-09-27-answer-key/key-guide.md), golden/axes.md and, for
the classifier, its questions or its composing script; his words go to
verdicts.md. A rejected rule is deleted here with one line in verdicts.md.

Decided so far (not in this list): "other fighter's side" (2026-09-28),
centrality judged by what is new, not by length (rule A, 2026-09-28), and
"where" stays unlabelled, taken from the extractor (2026-10-01).

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

### 6. When a callout makes another fighter his opponent
*Labelling. Boundary #3, 5.*
Pimblett's repeated callouts (#283, #423): the guide says a callout alone is
not "opponent side", yet the readers split.

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
