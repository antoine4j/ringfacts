# The storyboard

A small private web app that reads v0's database live, so every station's
answer can be seen, questioned and corrected. Design: section 11 of
[the v0 spec](../../docs/superpowers/specs/2026-10-04-v0-design.md).

Next.js; each page is built on the server straight from the database with
`pg` (no API layer, no ORM). Filters live in the address, so any view can be
bookmarked or pasted to Claude. Times are Pacific.

## Pages

| Page | Shows |
|---|---|
| `/` Claims | Every claim, newest activity first: current label (and first label when it differs), fighter, readings, outlets, first and last date, posted or not. Each opens to its readings in date order, with tier, cell, JEV's pick confidence and extract sentence; a pick under 50% is flagged ⚠. Filters: fighter, day, outlet, tier, posted, and any classifier answer. |
| `/claims/[id]` | One claim, both labels, its readings, feedback on it. |
| `/readings` | Every reading, newest first, v0's tier beside production's outcome. Filters: fighter, day, outlet, tier, posted, stage (`waiting` = classify, extract, group or decide), archive, and any classifier answer, e.g. `/readings?fact=next_fight&firmness=rumour`. |
| `/readings/[id]` | One reading: the article, then every row of every station (Classifier, Claim extractor, Semantic dedup with its shortlist and pick, Decider), newest first, each with a feedback form; production's outcome; feedback given. |
| `/settings` | The tier map: Post, Digest, Drop. Each "what new fact · how firm" is a card with its count of readings and three headlines; drag it (or use its buttons) to make a draft. Before saving, the page says how many readings would move, by running the Decider's own code (`../pipeline/settings/tiers.ts`) on them. Below: each fighter's digest schedule, and the version history. Saving adds a settings row. |
| `/digests` | Each digest: its text, the items the writer listed, the claims it used and left out, feedback. |
| `/runs` | Where every reading is now (stage × fighter), and every run with its headline counts, failures, tokens and cost. |
| `/compare` | Production's outcome × v0's tier, and the readings where one posted and the other did not. |
| `/replay` | Placeholder for the golden replay's scores: its runs and what the `replay` schema holds. |

Every page also reads the golden replay's copy of the tables with
`?schema=replay` (the switch is in the top bar).

## Writes

Only two, both adding a row, never changing one: a feedback note
(`feedback`) and a new settings version (`settings`). The database role
`v0_editor` can do nothing else. A settings save is refused if another
version was saved after the page was opened.

## Run it locally

From `v0/`, once: `npm install`. Then, from `v0/storyboard/`, against the
development branch (the address is read from the file, never printed):

```bash
DATABASE_URL=$(grep '^V0_DEV_EDITOR_DATABASE_URL=' ../../.env.v0 | cut -d= -f2-) npm run dev
```

Open http://localhost:3000. `npm run build` checks the types and builds;
`npm test` runs the unit tests of `lib/` (offline, no database).

## Deploy (Vercel)

| Setting | Value |
|---|---|
| Root Directory | `v0/storyboard` (with "include files outside the root directory" on, the default: the settings page imports `../pipeline/settings/`) |
| Ignored Build Step | none: every push builds, and a redeploy always builds (a variable changed in Vercel reaches only builds made after it; see docs/decisions.md#storyboard-builds-every-push) |
| Environment variable | `DATABASE_URL` = the `v0_editor` address (`V0_EDITOR_DATABASE_URL` in `.env.v0`) |
| Deployment Protection | Vercel Authentication on all deployments: the database holds other outlets' article text |
