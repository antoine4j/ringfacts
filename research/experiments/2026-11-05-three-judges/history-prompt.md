# History prompt (one fighter, all weeks)

Sent to one agent per fighter per model after the weekly judging, with the
model's own `history-in-<fighter>.json`: one line per claim (the judge's
`core` line, the fighter, the first and last dates, how many readings), in
date order. The weekly judge cannot see claims outside its week, so this pass
links claims weeks apart, names the larger story each claim belongs to, and
draws up the ledger of the fighter's career events. Prompt version: h1
(2026-11-05).

---

You are reviewing every claim a news pipeline made about one MMA fighter over
three months. Read {IN_PATH} with the Read tool. It holds the fighter's name
and a list of claims: `claim_id`, `core` (one sentence naming the claim's
occasion: the speaker, the sitting or event, the date), `first`, `last` (the
dates of its first and last article), `readings` (how many articles), and
`career_event` when the readers found one (the event type the claim reports).
Open no other file; do not search the web; judge from these lines alone.

**What one claim is.** One piece of news: one occasion and the reports of
it. The rules that matter here:

1. The same sitting written up by many outlets is one claim, even weeks apart.
3. A rumour about a possible fight and the denials and confirmations of that
   same rumour are one ongoing story: link such claims as one.

**Three things to write.**

1. `same_claims`: pairs of claims whose cores are the same occasion or the
   same ongoing rumour story (rules 1 and 3), including pairs weeks apart.
   Link pairs so that a group of three is two links. Each with `why` (one
   sentence), `rule` (1 or 3) and `confidence`.
2. `stories`: the larger stories the claims belong to, each with a short
   `name` (such as "the Gaethje gloves saga" or "the Pimblett feud"), a
   `kind` (`fight_build_up`, `fight_week`, `feud`, `rumour`, `injury_and_return`,
   `career`, `personal`, `other`), and `claim_ids`. A claim belongs to at
   most one story; a claim that is its own thing belongs to none. Do not
   force claims into stories.
3. `career_events`: the fighter's career events the claims report, one entry
   per event, not per claim: `type` (`fight_booked`, `fight_changed`,
   `result`, `injury`, `ranking`, `title`, `contract_or_move`,
   `retirement`), `what` (one sentence), `date` (when it happened, YYYY-MM-DD
   or ""), `first_claim_id` (the earliest claim that reports it), and
   `claim_ids` (all claims that report it, the first included). A fight
   booked and the same fight's result are two events. Background recalled on
   the way is not an event.

Write JSON to {OUT_PATH} with the Write tool:

```json
{"fighter": "…",
 "same_claims": [{"claim_id": "…", "other_claim_id": "…", "why": "…", "rule": 3, "confidence": "medium"}],
 "stories": [{"name": "…", "kind": "feud", "claim_ids": ["…"]}],
 "career_events": [{"type": "result", "what": "…", "date": "2026-10-04", "first_claim_id": "…", "claim_ids": ["…"]}]}
```

Ids are strings. Reply with one line: how many links, stories and events.
