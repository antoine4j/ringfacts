# The axes — approved for the first experiment (2026-09-27)

**Status:** Anton approved this draft as the questions of classifier run v3
(verdicts.md, 2026-09-27). It is a hypothesis until that run and his
corrections on its map confirm each boundary.

What a claim **is**, on four axes and one modifier. Labels record these,
never what a reader wants; tiers come from a per-fighter settings table
that reads them. Each axis answers one question, and every claim takes
exactly one value on each. Nothing here is ruled until Anton approves it;
his decisions go to `verdicts.md`, and this file is rewritten to match.

**The unit is the claim, judged by what it is about** (Anton's rule,
2026-09-25/27: an article goes with its lead, not its first sentence). The
source is **where the person spoke, never the outlet that relayed it**.

## Gate: is the claim about him?

| value | means | boundary |
|---|---|---|
| **yes** | he is the subject, or the one being talked about; the new information is about him | |
| **partly** | he is one of several subjects and gets real content: a card preview, a two-fighter feature | *proposed:* the opponent's own news that bears on his fight (Gaethje's hands, Gaethje not fighting until 2027) is **partly** |
| **no** | he is named in passing, as background, in a list or only in links; the news is someone else's | "mentioned near him is not about him" (goals.md); him speaking about someone else is **no** (goals.md, 2026-09-04) |

Claims at **no** take no value on the other axes.

## Source: whose words or act is the new information?

| value | means | boundary |
|---|---|---|
| **himself** | he speaks or posts | |
| **his team** | people who work on his fighting: coaches, trainers, physio, doctor | |
| **his manager** | his manager or agent | *proposed:* split from his team, because your 22 Sept ruling treats managers differently |
| **opponent side** | a fighter booked against him or publicly linked to a fight with him, or that fighter's coach or manager | *proposed:* a champion who is also his last or next opponent is **opponent side** (Gaethje); the relationship to him beats the title |
| **promotion** | the UFC and its officials (Dana White, matchmakers), commissions, official records | |
| **other fighter** | any other fighter, including champions of other divisions and friends or teammates | Makhachev is **other fighter** unless linked to a fight with him; Merab is **other fighter** |
| **media** | journalists, pundits, podcasters, analysts, the outlet's own writer | *proposed:* a journalist's leak ("the UFC is discussing a rematch") is **media**, with firmness **rumoured** |
| **fans** | social media reaction, the crowd | |
| **no one** | an event reported with nobody speaking: a result, a weigh-in, a booking announcement | |

## Act: what does the source do regarding him?

| value | means |
|---|---|
| **reports an event** | nobody speaks; something happened (he fought, weighed in, was booked) |
| **speaks of himself** | only with source **himself**: his situation, plans, past, life |
| **assesses him** | his level, chances, condition, performance, place in the division |
| **predicts his fight** | a pick or a forecast for a fight of his *(proposed as its own value: predictions are a genre you already group by type, and a setting may want them out)* |
| **calls him out** | asks to fight him, challenges him, trash talk aimed at him |
| **answers for him** | replies on his behalf to an attack, a callout or a claim aimed at him |
| **steers him** | what he should do next: who to fight, rematch or not, weight class; includes demands made on his behalf |
| **gives news of him** | someone else's factual update on him: his condition, whereabouts, training, plans |

## Fact asserted: what new fact about him does it carry?

| value | means |
|---|---|
| **booking** | a fight of his being set, offered, discussed or cancelled |
| **result** | the outcome of a fight of his |
| **fight-week event** | weigh-in, face-off, open workout, press conference, card details |
| **health** | injury, medical, recovery |
| **return** | when he will fight again, availability |
| **career move** | retirement, contract, weight class, team change |
| **personal life** | family, childhood, home, hobbies, a lesson from life |
| **none** | opinion or talk only; no new fact |

## Modifier: how firm (only for booking, return, career move)

| value | means |
|---|---|
| **official** | the promotion or his own account says it (goal G4) |
| **reported** | a named outlet reports it with sources |
| **rumoured** | unnamed sources, a leak, "discussions", "plans" |

## Not labelled now

- **Depth** (a full breakdown or one line): the tier sample shows whether it needs an axis.
- **Novelty** (new, a reaction, a restatement): a grouping question, not a claim property.
- **Where it was said** (podcast, post, press conference): kept from the extractor, shown on the map, not labelled.

## What this fixes in the current answers (claim level, from the map)

- "He fought" and "fight week" sat on two axes; now they are **act: reports an event** with **fact: result / fight-week event**.
- "Quote" as a kind only said that someone spoke (it was the kind of 72 of 116 "assessing" articles); it is gone, the act and source say it.
- "Naming him in passing" was an act; it is now **gate: no**.
- The current classifier has **no option for "gives news of him"**, and never used "steering him elsewhere": neither can show up until the questions are re-asked.
- His coach and his manager shared one option; they are split.

Pre-fill from today's answers, claim level: fact **none** 86, fight-week
event 14, booking 10 (6 rumoured, 2 reported, 2 official), result 6, career
move 6, personal life 4, health 2; act assesses 38, speaks of himself 26,
reports an event 13, predicts 9. Three claims name a manager in their first
extract (claim-003, 008, 012).
