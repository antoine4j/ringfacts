# Labelling guide for the answer key

You are labelling MMA news articles for one **watched fighter** each. You
answer nine questions per article, the way a careful human editor would,
reading the whole saved text. Your answers become a provisional answer key
that a classifier is scored against; Anton (the project owner) confirms or
corrects them later. Answer what the article **is**, not what a reader
would want.

The definitions below are the approved axes (golden/axes.md, with the
changes approved up to 2026-09-27). Where a boundary is not covered, give
your best answer, mark it `unsure`, and say why in the note.

**What you know about the fighter: only his name.** Recognise "his
manager", "his team" or "opponent side" only where the article itself says
who the person is.

**The unit:** judge by what the article is about, by its lead and body, not
by its first sentence alone. Page furniture (menus, "read also" links,
sidebars, other headlines) is not the article's content.

## 1. centrality — how central is he to the article?

Judge by how much of the article is about him — not by whether it carries
news about him (other questions ask that).

| value | means |
|---|---|
| `not_in_content` | he appears only in links, navigation, a sidebar or "read also" — not in the article's own text |
| `only_mentioned` | a line, a name in a list, card, ranking, results page or comparison; his past fight retold as background in someone else's story; him talking about another fighter or the sport, not about himself, even at length |
| `one_of_several` | he shares the article with others and gets real content: a preview or feature on a fight of his covering both fighters; attention shared between him and one or two others; another fighter's own news that the article itself ties to a fight between the two (booked, or already fought and being discussed) — a fighter only rumoured or calling him out does not count |

**Between `only_mentioned` and `one_of_several`, judge what is new about him, not how long his part is** (Anton, 2026-09-28). If his part only retells what is already known (his last fight, his injuries, his record), it is `only_mentioned`, however long, even a whole paragraph in a roundup. It is `one_of_several` only when the article adds something new about him while sharing the stage with others. Example: a year-in-review of Spanish fighters built around two debutants, where he gets a paragraph recalling his June loss and fractures and one line saying he has posted a couple of messages, is `only_mentioned`.
| `main_subject` | the article is about him: something he did, or said about himself or his own career, or something someone said, reported or predicted about him |

## 2. source — whose words or act is the new information about him?

Where the person spoke, never the outlet that relayed it. If the article
carries nothing new about him, answer for its main content.

| value | means |
|---|---|
| `himself` | he speaks or posts |
| `his_team` | people who work on his fighting: coaches, trainers, physio, doctor |
| `his_manager` | his manager or agent |
| `opponent_side` | a fighter the article itself says is booked against him (a date, an event, "will face") or has already fought him, or that fighter's coach or manager. A champion who is also his last or next opponent is opponent side (e.g. Gaethje for Topuria): the relationship to him beats the title. **Booked or fought only** (Anton, 2026-10-02): a callout, a wish from either man, a rivalry, a rumour or "the UFC has not confirmed" does not make him an opponent; he is `other_fighter_side` until an article reports the fight as booked |
| `promotion` | the UFC and its officials (Dana White, matchmakers), commissions, official records |
| `other_fighter_side` | any other fighter not linked to a fight with him, or that fighter's coach, manager or team: champions of other divisions, friends and teammates included (Anton, 2026-09-28: another fighter's manager had no value) |
| `media` | journalists, pundits, podcasters, analysts, commentators, the outlet's own writer, none of whom fought. A journalist's leak is media. **A fighter is a fighter, active or retired** (Anton, 2026-10-02): a former fighter on a podcast or at the commentary desk is `other_fighter_side` (or `opponent_side`), not media; the venue does not change who he is, and the text rarely says who has retired |
| `fans` | social media reaction, the crowd |
| `no_one` | an event reported with nobody speaking: a result, a weigh-in, a booking announcement |
| `none_of_these` | none fits; say what would |

## 3. act — what does the source do regarding him?

When he himself is the source, the act is `speaks_of_himself`, except a
reply to an attack on him, which is `answers_for_him`. `speaks_of_himself`
is only possible with source `himself`.

| value | means |
|---|---|
| `reports_an_event` | nobody speaks; something happened (he fought, weighed in, was booked) |
| `speaks_of_himself` | only with source himself: his situation, plans, past, life, how he rates himself, what he wants next |
| `assesses_him` | his level, chances, condition, performance, place in the division |
| `predicts_his_fight` | a pick or a forecast for a fight of his |
| `calls_him_out` | asks to fight him, challenges him, trash talk aimed at him |
| `answers_for_him` | replies on his behalf (or his own reply) to an attack, a callout or a claim aimed at him |
| `steers_him` | what he should do next: who to fight, rematch or not, weight class; includes demands made on his behalf |
| `gives_news_of_him` | someone else's factual update on him: his condition, whereabouts, training, plans |
| `none_of_these` | none fits, e.g. he is only mentioned and nobody does anything regarding him; say what would |

## 4. fact — what new fact about him does the article carry?

A fact is something that happened or is set to happen, not an opinion.
Choose by the article's **main news about him**. A past fight or injury only recalled as background is not the article's fact. Pick the specific value first: result, `next_fight`, `fight_week_event`, health, `career_move` or `personal_life`. If it is not one of those six, ask whether it is news of where he stands as a fighter (ready, available, training, back in public): that is `status_update`. Use `none_of_these` only for a new fact that is neither one of the six nor about where he stands as a fighter. Use `no_fact` when there is no new fact at all.

**Rule 3: count only what is new (Anton, 2026-10-02).** All nine answers
describe the article's one main claim. Something mentioned on the way (a
recap of his injuries, his last result, a booking restated as the premise
of a preview, pick, weigh-in or card list, a rumour recalled in a closing
line, anyone's guess at his timing) is background: it does not set the
fact, and it does not turn a yes/no question to `yes`. Decide from the
article alone: dates, tense, "after his June loss", "cabe recordar",
where the line sits. When the fact is `no_fact`, firmness is `none` and
the three news questions (result, next fight, health) are `no`. When
there is a fact, several news questions can still be `yes` (a fight
report that also names his next opponent). **Background is what the writer adds around the main claim; a fact
stated inside the main claim belongs to it** (Anton, 2026-10-02). Health
is `yes` when someone the article names (he himself, his team, the
promotion, a named outlet) states his condition as a statement of its
own, in the words the article is built on: Topuria's essay that lists his
fractures (#723) is fact `health`, official, though the essay is mainly a
reflection; act carries the message, fact the one hard fact in it. The
writer's recap or inference ("he seems recovered", "cabe recordar"), an
older report recalled in one line (#627), and a line that only says when
he will be ready are `no`. Worked examples: #856
(fractures recapped in a year-in-review: health no), #462 (Gaethje
guesses he won't fight until next year: no fact), #1002 (Pantoja's
message; the rematch rumour is a closing line: no fact, next fight no).

| value | means |
|---|---|
| `next_fight` | news that a specific fight of his exists or has changed: a fight is set, announced, offered, in talks, moved or cancelled. It counts when he himself says he has a fight, even before the promotion confirms it and even if he does not name the opponent ("I know who, where and when"). Not when he will be ready, that he is ready, that nothing is booked, or opponents named only as options with no talks ("Gaethje or Pimblett, both make sense"): those are `status_update`. Not a wish or an opinion about who he should fight (a callout, a pundit's pick): that is `no_fact`. A rumour about his next fight reported from a third party (a coach, an outlet, "reports suggest"), even when its subject denies it, is `next_fight` at firmness `rumour`; the speaker's own wish with no reported rumour or talks is `no_fact` (Anton, 2026-10-02: #820 vs #843). A rumour counts only when the article gives it substance: who said it, or a date or event. "Amid rumours" framing with no who, when or where is a wish piece (#871) |
| `result` | the outcome of a fight of his, as the news (a fight report, his bout on a results page). An account of the fight itself; a statement, interview or callout after it takes the value of what is said, or `no_fact` |
| `fight_week_event` | the routine of a fight of his, and nothing more: weigh-in, face-off, open workout, card order, start times. Training camp and sparring in the weeks or months before fight week are `status_update`. An interview, press conference or media day is a place where things are said, not a fact: what is said there takes its own value, or `no_fact` |
| `health` | injury, medical issue, surgery, recovery, as news, including how the recovery is going. When someone named says how he is or how the recovery is going, however briefly, the fact is health, even if the headline and most of the text are about when he will be back. If the article only says when he will be ready and describes no injury or recovery, it is `status_update` |
| `career_move` | retirement, a contract, a move of weight class or team, a title vacated, stripped or awarded |
| `personal_life` | his life outside the cage: family, childhood, home, hobbies, money, a life lesson |
| `status_update` | (Anton, 2026-10-02) news of where he stands as a fighter, when no specific fight exists or changes: he is ready to fight, or will not fight before a date; a return window ("ready by December"); nothing is booked yet; opponents named only as options; he starts training camp, or a camp or sparring update; he is back in training; his return to public life after time away is itself announced or reported. A post, a letter or an interview of his takes the value of what it says, not `status_update` for the mere fact that he spoke again: a message to his son is `personal_life`, a reflection with no fact is `no_fact`. Someone must state it as a fact: he himself, his team, the promotion, or a named report. Not a guess or an opinion about his timing (Gaethje thinks he will not fight until next year, #462): that is `no_fact`. Not how his injury or recovery is going: that is health. Not the weigh-in, face-off, open workout or card order of a fight: that is `fight_week_event`. Not family, home or money: that is `personal_life`. |
| `no_fact` | opinion or talk only; no new fact about him. Wishes, demands, callouts, picks and guesses at his timing are all `no_fact`, whoever makes them, his own manager included (#129) |
| `none_of_these` | a new fact of a kind not listed; say which. Check `status_update` first: `none_of_these` is for a fact that is not about where he stands as a fighter (a past negotiation revealed, #228) |

## 5. firmness — how established is the main fact the article asserts about him?

Of the main fact whatever its kind; `none` when question 4 is `no_fact`.

| value | means |
|---|---|
| `none` | no fact about him is asserted: only opinion, analysis or talk |
| `wish` | a wish or a demand: someone wants it or says it should happen |
| `rumour` | unnamed sources, a leak, "talks", "discussions", "plans" |
| `reported` | a named outlet or journalist states it, citing sources; or a person other than him or the promotion states it (e.g. his coach says he'll be ready in December); or he himself says a fight exists but nothing is signed or announced ("I was told who, where and when") |
| `official_or_done` | the promotion or he himself states it, or it has happened (a fight result). One exception: when he says he has a fight but it is not signed or announced, that is reported |

## 6–9. Four yes/no questions (answer `yes` or `no`)

Each is about the watched fighter only, never about another fighter in
the article.

**The three news questions (result, next fight, health) say whether that
kind of news is part of the article's main claim: as the main fact, or as
a second fact stated beside it** (Anton, 2026-10-02). When `fact` is
`result`, `next_fight` or `health`, its question is always `yes`. A
question can also be `yes` while `fact` is a different kind, when the same
statement carries both (a fight report that also names his next opponent: fact `result`, next fight `yes`). When `fact` is `no_fact`, all
three are `no`. They never mean "is it mentioned": see rule 3 under
question 4.

- **reports_his_result** — does the article report, as its news, the outcome
  of a fight of his? `no` when his past fight is only recalled as background
  to other news. **Yes only
  for an account of the fight itself** (Anton, 2026-10-03): a fight report,
  his bout on a results page. A statement, interview or callout after a
  fight is `no`, however recent the fight and however much of it is retold,
  even when the first sentence restates the win before the interview begins
  (#1172, #851, #778).
- **reports_his_next_fight** — does it carry news that a specific fight of his exists or has changed: set, announced, offered, in talks, rumoured or denied, moved or cancelled, including his own word that he has a fight? (A rumour is a fact at low firmness, not an opinion.) `no` for only wishes and opinions (callouts, pundit picks), for when he will be ready or that nothing is booked, for opponents named only as options, for training and recovery news, and for another fighter's next fight that does not involve him.
- **reports_his_health** — does it report, as its news, an injury, illness,
  procedure or recovery of his, including an update on how he is? `no` when a
  past injury is only recalled as background, or it only says when he will be
  ready.
- **he_speaks** — do his own words appear in the saved text (a quote, an
  interview answer, a post of his)? `no` when only others speak, including
  about him.

An article can say `yes` to several of these (a fight report that also
names his next opponent).

## Output

For each article, one JSON object:

```json
{"id": "0000",
 "centrality": "main_subject", "source": "his_team", "act": "gives_news_of_him",
 "fact": "health", "firmness": "reported",
 "reports_his_result": "no", "reports_his_next_fight": "no",
 "reports_his_health": "yes", "he_speaks": "no",
 "unsure": [],
 "note": "(made-up example) His coach says the hand surgery went well and he could be back by spring.  'Back by spring' is not news of a specific fight, so next fight is no."}
```

`unsure` lists the questions where a careful editor could reasonably pick
another value; `note` is one or two sentences, and must explain every
`unsure` and every `none_of_these`.
