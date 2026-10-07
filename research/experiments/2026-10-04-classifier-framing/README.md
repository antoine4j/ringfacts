# Telling the classifier what it is reading (2026-10-04)

**Conclusion: no effect.** Adding "this is MMA news, the fighter is in the
UFC" made no measurable difference to classifier v7.7. Adding a line on who
the fighter is made none either. Both changed fewer answers than sending v7.7
again unchanged did. Neither is adopted; v7.7 stays as it is.

**Side finding: language is not what makes articles hard.** Spanish articles
score worst, but every Spanish article is a Topuria article, and Topuria
articles are hard in every language. Within one fighter, the non-English
articles score as well as the English ones or better. The golden set has no
Russian articles.

**Side finding: one pass mark changes between identical runs.** On training,
"every career-event story recognised" found 8 of 9 stories in the stored v7.7
run and 6 of 9 when the same questions were sent again. Two stories rest on
one article each, answered at a probability below 0.5.

## The question

A person classifies faster when told the setting first. Does JEV? JEV judges
every question alone and sees only the article fields it is sent, so the
setting has to be one of those fields. v7.7 sends five: the fighter's full
name, the headline, the outlet, the date and the article text. Nothing says
the subject is MMA.

## Design

Three versions, each sent once per article on the 195 training and
validation articles. The test side was not sent. The questions are v7.7
exactly (`questions-r7.json` in the v7 folder); only the article fields
differ.

| Version | Fields added |
|---|---|
| control | none: v7.7 sent again in the same session, the measure of today's noise |
| sport | `context`: "News articles about mixed martial arts (MMA). The fighter named in `watched_fighter` competes in the UFC (Ultimate Fighting Championship)." |
| profile | `context` as above, and `about_watched_fighter`: one stable line per fighter, e.g. "Daniil Donchenko, a Ukrainian mixed martial artist, UFC welterweight." No record, ranking or title, which go out of date. |

The setting went into new fields, not into the questions' wording. That is
how it would ship: one copy every question sees, with the frozen wording left
alone.

**Pass mark, set before the run:** a version wins only if its training gain
is larger than the gap between the two unchanged runs, and validation does
not get worse. A guard checks it is not simply calling more articles "about
him": among the 49 articles where he is only mentioned or absent, the number
called "one of several" or "main subject" must not rise.

Cost: 585 calls, 3.46 M input tokens, **$0.145** (measured).

## Results

Every number below is out of the same fixed set, so rows compare directly.
"Stored" is the v7.7 round from 3 October; "control" is the same questions
sent again today. The gap between those two rows is the noise.

**1. Articles with all nine answers right, and answers right.** The change
from control is in the last column of each cell.

| Version | Training: all nine (of 155) | Validation: all nine (of 40) | Training answers right (of 1,395) |
|---|---|---|---|
| stored v7.7 | 96 (62%) +4 | 20 (50%) +1 | 1,284 (92%) +7 |
| control | 92 (59%) 0 | 19 (48%) 0 | 1,277 (92%) 0 |
| sport | 94 (61%) +2 | 20 (50%) +1 | 1,280 (92%) +3 |
| profile | 94 (61%) +2 | 19 (48%) 0 | 1,278 (92%) +1 |

Both versions sit between the two unchanged runs. The stored run is ahead of
the control by more than either version.

**2. Training answers that differ from control (of 1,395).**

| Version | Differ | Fixed | Broken | Net |
|---|---|---|---|---|
| stored v7.7 (noise: nothing changed) | 9 | 8 | 1 | +7 |
| sport | 11 | 7 | 4 | +3 |
| profile | 5 | 3 | 2 | +1 |

"Profile" moved 5 answers; rerunning moved 9.

**3. Training answers right per question (of 155).** No question moves by
more than 2 in any version.

| Question | stored | control | sport | profile |
|---|---|---|---|---|
| how central | 139 | 140 | 139 | 140 |
| whose words | 145 | 144 | 145 | 144 |
| what the source does | 129 | 128 | 128 | 128 |
| what new fact | 135 | 133 | 134 | 133 |
| how firm | 136 | 135 | 136 | 135 |
| reports his result | 154 | 154 | 154 | 154 |
| reports his next fight | 146 | 145 | 145 | 145 |
| reports his health | 145 | 144 | 145 | 145 |
| he speaks | 155 | 154 | 154 | 154 |

**4. Pass marks** (career-event stories recognised; rumours called official,
mark 0; false alarms, mark 5%).

| Version | Training stories | Training false alarms (of 111) | Validation stories | Validation false alarms (of 38) |
|---|---|---|---|---|
| stored v7.7 | 8 of 9 | 5 (4.5%) | 1 of 2 | 2 (5.3%) |
| control | 6 of 9 | 5 (4.5%) | 1 of 2 | 2 (5.3%) |
| sport | 7 of 9 | 4 (3.6%) | 1 of 2 | 3 (7.9%) |
| profile | 6 of 9 | 5 (4.5%) | 1 of 2 | 2 (5.3%) |

No version called a rumour official.

**5. Guard.** Of the 49 articles where he is only mentioned or absent, every
version, stored and control included, called 3 "about him".

**6. By language** (training and validation together; all nine right / answers right).

| Language | Articles | stored | control | sport | profile |
|---|---|---|---|---|---|
| English | 110 | 59% / 91% | 55% / 90% | 55% / 90% | 58% / 91% |
| Ukrainian | 42 | 76% / 96% | 76% / 96% | 76% / 96% | 74% / 96% |
| Spanish | 42 | 45% / 89% | 43% / 89% | 50% / 90% | 43% / 89% |
| French | 1 | 0% / 67% | 0% / 67% | 0% / 67% | 0% / 67% |

The English framing did not help the Spanish articles beyond noise: "sport"
gets 3 more of the 42 right, about the gap the two unchanged runs show.

## Side finding: language is mixed up with fighter

Stored v7.7, by fighter and language (training and validation):

| Fighter | Language | Articles in claims | All nine right | Answers right |
|---|---|---|---|---|
| Topuria | English | 69 in 25 | 38 (55%) | 90% |
| Topuria | Spanish | 42 in 20 | 19 (45%) | 89% |
| Donchenko | English | 30 in 13 | 18 (60%) | 91% |
| Donchenko | Ukrainian | 39 in 13 | 31 (79%) | 97% |
| Amosov | English | 11 in 5 | 9 (82%) | 98% |
| Amosov | Ukrainian | 3 in 3 | 1 (33%) | 93% |

For Topuria, Spanish is 10 points behind English on all nine. The standard
error, the typical amount a gap between two groups this size moves by chance
alone, is about 10 points here (42 and 69 articles near 50%). So the gap is
about one standard error, within chance. The true standard error is larger
still, because articles of one claim tend to be right or wrong together. For Donchenko, Ukrainian is 19 points *ahead*.
Answers right, the finer measure, differ by one point for Topuria. The data
gives no reason to translate articles before classifying. Language was
guessed from letters and common short words (`framing.py`,
`language_of`); a spot check of three titles per language found no wrong tag.

## Side finding: the "every story" pass mark flips between identical runs

| Article | Story | Key | Stored answer | Control answer |
|---|---|---|---|---|
| #368 | claim-015.0 | health | health (0.47) | status update (0.48) |
| #838 | claim-099 | next fight | next fight (0.47) | no fact (0.48) |

In each of these two stories, a single article carries the career event, and
its "what new fact" answer sits under 0.5 in both runs. So whether v7.7 passes
"every career-event story recognised" on training depends on which run is
scored. The test-set score (task 4.7) will be one run, so the same may
happen there.

## Files

- `framing.py`: the three versions, the calls, and the language guess.
- `report.py`: the tables above, from stored answers, with no calls.
- `raw/`: one answer per article and version (git-ignored; holds no article text).

Rerun the tables with `python3 framing.py report`; the language table alone
with `python3 framing.py languages`.
