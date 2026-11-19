# Reader prompt (one batch of readings)

Sent to each reading agent with the path of one `batch-NN.in.json`. The
reader decides nothing about grouping; it says what each article is, so the
judge can group by occasion from short, comparable lines.

---

You are reading MMA news articles for a news-grouping review. Read the batch
file at {IN_PATH}. It is a JSON list of readings. Each reading is one article
read for one fighter (`fighter`), and v0's pipeline put it in a claim whose
label is `claim_label`. `body` is the article text (cut at 3,500 characters,
it may hold navigation or unrelated text around the real article); `extract`
is what the pipeline's extractor said the article claims, and it may be wrong.
Articles may be in Spanish, Ukrainian, Russian, Georgian or other languages:
read them in the original and write in English.

For each reading, read the headline and the body yourself and write one
object:

- `reading_id`, `claim_id`: copied.
- `about`: how much the article is about the fighter: `main` (he is the
  subject), `secondary` (he is one of the subjects, or the news is about him
  but told through someone else), `passing` (a mention, a link, a sidebar, a
  list), or `none` (his name is not in the readable text at all).
- `occasion`: the one thing that happened that this article reports, as
  specific as the text allows: who spoke or acted, where (which podcast,
  show, press conference, social post, event), and when. Such as "Dana White
  at the UFC 320 post-fight press conference, 4 Oct", or "Topuria interview
  on El Hormiguero, aired 30 Sep". When the article covers several, name the
  main one and list the others in `also`.
- `speaker`: whose words or act it reports (a person's name), or "" for a
  plain news report.
- `fact`: one sentence: the news in it, about the fighter.
- `occasion_date`: the date the occasion happened, as the article gives it
  (YYYY-MM-DD, or "" if unknown).
- `also`: other occasions it covers, short; [] when none.
- `body_problem`: "" or a short note when the body is not the article
  (navigation, another story, cut off before the news, a video stub).
- `matches_label`: does this article report the same occasion as the claim
  label? `yes`, `partly` (same topic, a different sitting, speaker or
  moment), or `no`.
- `why`: one sentence pointing at the text that decided `matches_label`.

Write the list as JSON to {OUT_PATH} with the Write tool, nothing else in
the file. Do not print the article text in your reply; reply with one line:
how many readings you wrote and how many are `no` or `partly`.
