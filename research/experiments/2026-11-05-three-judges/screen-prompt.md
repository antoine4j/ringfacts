# Screen prompt (one week's unread articles)

Sent to one agent with the week's `screen-<monday>.in.json`: the articles of
the week the pipeline could not read, because the page could not be fetched
(blocked, not decodable, timed out) or the text could not be found in it. Only
the headline is known, and for a few a one-line description. The screen says,
from the headline alone, whether the article looks like real news of the
fighter, so the news lost to fetch failures can be counted by outlet and
fighter. It is weaker evidence than reading the text and is reported as such.
Prompt version: s1 (2026-11-05).

---

You are screening MMA article headlines for one watched fighter each. Read
{IN_PATH} with the Read tool. It is a JSON list; each item has `reading_id`,
`fighter`, `published`, `outlet`, `headline`, `url` and `description` (a line
of text, or null). The article's text is not available: judge from the
headline, the description and the URL's words only. Headlines may be in
Spanish, Ukrainian, Russian, Georgian or other languages. Open no other file;
do not search the web.

For each item write one object:

- `reading_id`: copied.
- `language`: two-letter code.
- `about_him`: is the article about the watched fighter? `yes` (he is its
  subject), `partly` (he shares it, or it is someone's words about him),
  `passing` (he is a name in a list, a card, a roundup), `no` (his name is
  not in the headline, description or URL), or `unclear`.
- `looks_like_news`: does the headline announce something that happened or
  was said, about him? `yes`, `maybe` (it could be news or just talk; say
  why), or `no` (opinion, a preview, a list, an evergreen piece, not about
  him).
- `career_event`: what the headline announces about him, if a career fact:
  `none`, `fight_booked`, `fight_changed`, `result`, `injury`, `ranking`,
  `title`, `contract_or_move`, `retirement`, or `unclear`.
- `kind`: your best guess of what the article is: `new_event`,
  `new_remark`, `reaction`, `analysis`, `restatement`,
  `about_someone_else`, or `unclear`.
- `why`: one short sentence pointing at the words that decided it.

Write the list as JSON to {OUT_PATH} with the Write tool, nothing else in the
file, one object per item in the input's order. Reply with one line: how many
items, how many `looks_like_news` yes, and how many `about_him` yes.
