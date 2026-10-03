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
rule 6 here; 2026-10-02), and rule 3, count only what is new, for fact,
firmness and the three news questions (was rules 3 and 5; 2026-10-02).

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

### 4. Content not in the saved text
*Labelling flag. From #740 and #521.*
Where the real content is a video (or otherwise not saved) and our text is
only a caption, flag the article after Anton confirms it on the live page,
as with #655; label what the page is, and leave the classifier unscored on
answers only the video holds.

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

### 11. Watch: facts the list has no value for
*Labelling. 3 of 300, 2026-10-02.* Fact "none of these" was used for a
revealed past negotiation that collapsed (#228, Makhachev's account of
the White House offer and Topuria's pay demands) and for a return to
public view (#572, #592, the same Colmenero story). Two unrelated gaps in
three articles do not earn a value; "none of these" with the reader's
note is right for now. Revisit if the next pull brings more business
facts (offers, pay disputes, failed bookings) or more "back in public"
items.

### 12. A new fact value, "status update" (name open), and a narrower "next fight"
*Labelling: ADOPTED into the guide 2026-10-02, after Anton reviewed the
wording side by side and a blind reader pilot on all 300 (21 articles
where both readers give the same new answer, 16 of them intended;
experiments/2026-09-27-answer-key/status-pilot/). Name: status update.
Health wins over a return date in the same statement; a wish is no fact
whoever makes it. Classifier: not yet, by his choice; the classifier
wording is drafted in wording-proposal.json for v7. What follows is the
record of how it was proposed.*

**The problem.** #998 and nine wire copies: Dana White says "not on the
schedule right now, but Topuria is ready to fight". Labelled next fight,
official, which reads as a booking. Anton: *"it's basically a comment from
the UFC that truly nothing happened, but it will be reported as a new
fight scheduled, with fanfare."*

**The what-if** (one reader, 32 articles, overnight/status/, read-only):
14 would move to the new value (the ten White pieces, #152 and #402 where
his coach gives a return window, #572 and #592 "returns to public view",
which were none of these); 15 stay next fight (three Soriano bookings,
twelve rumour pieces); #412 keeps fact health and loses its next-fight
yes. One reader, all 14 about Topuria, classifier untested.

**Anton's positions (2026-10-02), to build the wording from:**
- The value is meant to be broad, *"a little bit catch-all"*: any update
  that says where he stands. Ready to fight, will not fight before a
  date, a return window, back in public view, **and training camp**:
  starting camp, camp and sparring updates in the months before fight
  week. It fills the gap *"between everything else and no fact"*.
- Risk he named: it may swallow none of these, no fact or fight week.
  Test for it, and reinforce the fight-week line in the prompt.
- **Next fight is for real fight news only.** The current rule (set,
  offered, in talks, cancelled, a rumour with a who, when or where), plus:
  the fighter himself saying a fight exists counts **even before official
  confirmation and even unnamed**. Official confirmation is a name, a
  date, an event, an opponent, or the promotion's own message; when it
  comes, it is reported again.
- Opponents named only as options (White: "Gaethje or Pimblett, both are
  great", #991, #1076) are **not** next fight: *"these are options, not
  even rumours"*. Status update. He does want to hear them, because the
  source is the promotion: that is the decider's ranking, not the label.
- How firm, when the fighter himself says nothing is signed: *"rumour,
  probably."* (Open: Claude suggests "reported", see below.)
- **No yes/no flag** for status update: it is the lowest fact, not worth
  a fourth flag. Losing #412's second fact is fine.
- The name is open; find a sensible one and test it.
- Order of work: align the wording first; he reviews the exact text the
  readers and the classifier will see; then two blind readers; then the
  classifier, as on every major change. No run before that.

**Worked example outside the 300** (not added to the frozen set): Amosov,
sport.nv.ua, 2026-09-29,
https://sport.nv.ua/ukr/mma/yaroslav-amosov-ogolosiv-pro-novogo-supernika-ufc-pidgotovka-do-boyu-50645741.html
He says he knows his next opponent ("who, where and when"), nothing is
signed, he does not name him, and he is easing into camp. It broke the
draft test "is an opponent named?": the test must be whether a specific
fight exists or changes, not whether the text names it. Anton: *"I don't
see a sense to ignore this article now"*; pass it through the classifier
once the wording is settled.

**Open, Claude's pushback for Anton to rule on:**
- "Recovering well" is health today. If status update takes it, health
  empties. Proposed order: the specific values first (result, next fight,
  fight week event, health, career move, personal life); status update
  only when none fits; no fact when it is only opinion.
- How firm for a fighter's own "I have a fight, unsigned": rumour
  (Anton) or reported (a named first-hand source, stronger than Welch's
  "heard rumours")? Underneath: how firm records who vouches, and nothing
  records how far along the fight is.

## Candidate rules from the overnight briefs (2026-10-02, not decided)

Eight briefs, one per boundary of the readers' disagreements
(experiments/2026-09-27-answer-key/overnight/briefs/out-<group>.json;
shown on the correction page above each group). Each offers 2–3 rules
formed from tune/check articles only, with the answer every rule gives
per article. The recommended ones, with the disputed majorities each
would change:

| boundary | recommended rule | changes |
|---|---|---|
| next fight (decided 2026-10-02: rule 3 adopted, this is it written out) | "own news": yes only when a change to his next fight is the article's subject or its own new reporting; a booking that is the premise of a preview, weigh-in or pick, a recalled rumour and a hedged guess are no and no fact | 16 of 30, plus 9 unanimous "yes" on Paris previews |
| health (decided 2026-10-02: adopted, with "a fact inside the main claim belongs to it") | someone named (he, his team, the UFC, a named outlet) states his condition; the writer's recap is background | 2 of 6 |
| result (rule 3 adopted; this brief's 'lead clause' wording not yet ruled on) | yes only when the headline or the first sentence's main clause states he won or lost | 2 of 5 |
| camp (decided 2026-10-02: Anton took the stricter "booked or fought") | — | 3 of 7, plus every Pimblett article labelled opponent side |
| centrality (rule 7) | "whose news": the headline and opening decide; a body-less page is judged on its headline | 0 of 10 |
| act (rule 9) | a plain statement about him; guesses, forecasts and a speaker's own rematch stance are none of these | 1 of 8 |
| firmness (rule 8) | past tense or a named card and date is official or done; otherwise the speaker decides: promotion or he himself official, a named outlet or other person reported, unnamed sources or an open choice rumour | 1 of 4 |
| other (rule 1, 10) | any direct quote is "he speaks"; a post only named as the channel does not make him the source; a fan line quoted by a journalist is fans; a statement with no content is no fact (this is rule 1, parked) | 0 of 5 |

The next-fight brief is the one that matters: its rule is backlog rule 3
written out, and it touches 25 articles. The others are small; act and
firmness rest on two non-test articles each.
