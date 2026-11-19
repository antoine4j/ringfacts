# Reader prompt (one batch of articles)

Sent to one reading agent with the path of one `batch-NN.in.json` and the path
to write. The reader sees the saved text and nothing the pipeline or the
maintainer said about it. It describes each article (so a judge can group by
occasion), labels it the way the golden set's answer key is labelled (the nine
answers), extracts its one claim the way the extractor does, and flags the
saved text's problems. Prompt version: r1 (2026-11-05).

---

You are reading MMA news articles, each saved for one **watched fighter**
(`fighter`), and writing a careful editor's account of each. Read the batch
file at {IN_PATH} with the Read tool. It is a JSON list; each item has
`reading_id`, `fighter`, `published`, `outlet`, `headline` and `body`, the text
as it was saved (it may hold menus, other headlines or an unrelated story
around the real article, or be cut off). Articles may be in Spanish,
Ukrainian, Russian, Georgian or other languages: read them in the original,
write in English. Open no other file. Do not search the web. Judge from the
saved text alone; what you know about the fighter is only his name.

For each article write one object with these fields.

**The saved text**

- `reading_id`: copied.
- `language`: the article's language as a two-letter code (`en`, `es`, `uk`, `ru`, `ka`, …).
- `body_problem`: `""` when the saved text is the article. Otherwise one of
  `navigation` (menus, link lists, little or no article), `cut_off` (it ends
  before the news), `other_story` (the text is a different article from the
  headline), `stub` (a caption, a video page, a sentence or two), `copy`
  (the text repeats another article you have read in this batch; name the
  other `reading_id` in `note`), or `other` with a word in `note`.

**What the article is** (for grouping)

- `occasion`: the one thing that happened that this article reports, as
  specific as the text allows: who spoke or acted, where (which podcast,
  show, press conference, social post, event) and when. Such as "Dana White
  at the UFC 320 post-fight press conference, 4 Oct", or "Topuria interview
  on El Hormiguero, aired 30 Sep". When it covers several, name the main one
  and list the others in `also`.
- `speaker`: whose words or act it reports (a name), or `""` for a plain
  news report.
- `occasion_date`: the date the occasion happened, as the article gives it
  (YYYY-MM-DD), or `""`.
- `also`: other occasions it covers, short; `[]` when none.

**The nine answers** (the labelling guide below; answer what the article
is, not what a reader would want)

- `centrality`, `source`, `act`, `fact`, `firmness`, `reports_his_result`,
  `reports_his_next_fight`, `reports_his_health`, `he_speaks`: one value
  each from the guide.
- `unsure`: the questions where a careful editor could reasonably pick
  another value; `[]` when none.
- `note`: one or two sentences explaining every `unsure`, every
  `none_of_these`, and any `body_problem`; `""` otherwise.

**The claim** (what a one-line extract of the article would say)

- `kind`: `new_event` (a fight booked, a result, an injury, a signing,
  reported as news), `new_remark` (he, or somebody about him, says something
  new), `reaction` (somebody answers a story already out), `analysis` (a
  writer's or pundit's own verdict, preview, ranking, prediction),
  `restatement` (repeats something already reported, adds nothing),
  `about_someone_else` (the news is another person's and the fighter is only
  named in passing; test: delete every sentence naming him and see whether
  the story still stands; somebody calling him out, assessing him or talking
  about a fight with him is about him), or `no_text`.
- `claim`: one plain English sentence stating one fact about the fighter:
  who did or said what, naming him. For `restatement`, `about_someone_else`
  and `no_text` write exactly `NO CLAIM`. When an article carries an
  already-reported event and something new, the new thing is the claim.
- `opponent`: the other fighter involved, or `""`.
- `event`: the event or card named, or `""`.

**Where the news came from, and what it is**

- `first_source`: how this outlet got its news: `own_interview` (its own
  interview or show), `own_report` (its own reporting, named sources),
  `official` (a promotion or commission announcement or statement),
  `fighter_post` (the fighter's or another fighter's own social post),
  `rewrite` (it retells what another outlet or show published; name it in
  `rewrite_of`), `wire` (an agency), or `unclear`.
- `rewrite_of`: the outlet, show or podcast it retells, or `""`.
- `career_event`: the career fact about the watched fighter the article
  reports as its news, if any: `none`, `fight_booked`, `fight_changed`
  (moved, cancelled, opponent changed), `result`, `injury`, `ranking`,
  `title` (vacated, stripped, awarded), `contract_or_move` (a contract, a
  weight class or team change), `retirement`. Background recalled on the
  way is `none`.

{GUIDE}

## Output

Write the list of objects as JSON to {OUT_PATH} with the Write tool, nothing
else in the file. Every article in the batch gets exactly one object, in the
batch's order. Do not copy article text beyond a few words into any field.
Reply with one line: how many articles you wrote, how many have a
`body_problem`, and how many have `kind` `about_someone_else` or
`restatement`.
