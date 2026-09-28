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

**What the classifier knows about the fighter: only his name.** No profile
(division, last fight, manager, coach) is given. Anton, 2026-09-27: *"if we
use it, we need then a mechanism to keep it updated autonomously: fighter
may change weight class, a manager, or a coach. So I would hold off for
now."* So "his manager", "his team" and "opponent side" can be recognised
only where the article itself says who the person is; read those values'
scores with that in mind.

## Gate: is the claim about him?

| value | means | boundary |
|---|---|---|
| **yes** | he is the subject, or the one being talked about: something he did, or said about himself or his own career, or something said or reported about him | |
| **partly** | he is one of several subjects and gets real content: a preview or feature on a fight of his covering both fighters | another fighter's own news counts only when the article itself ties it to a fight between the two, booked or already fought and being discussed; a fighter only rumoured or calling him out does not (Anton, 2026-09-27: no named storyline in the rule) |
| **no** | he is named in passing, as background, in a list or only in links; the news is someone else's | "mentioned near him is not about him" (goals.md); him speaking about someone else is **no**, even at length (goals.md, 2026-09-04) |

**The gate is a signal, not a blade** (Anton, 2026-09-27, after #683: his
result, one line on a results page, answered "not about him"). Every axis
is answered and kept whatever the gate says; the gate's probabilities sit
beside them, and whether an article moves on is decided downstream from
several signals together.

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

When he himself is the source, the act is **speaks of himself** (how he
rates himself, his own forecast, what he wants next), except a reply to an
attack on him, which is **answers for him**. So act depends on source: some
cells are impossible by definition, and a source/act contradiction in the
answers is a reliability signal (Anton, 2026-09-27: *"we embed part of Q3
into Q5, which may be fine since we can see a correlation then"*).

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
| **fight-week event** | the routine of a fight of his, and nothing more: weigh-in, face-off, open workout, card order, start times. An interview, press conference or media day is a place where things are said, not a fact: what is said there takes its own value, or none (Anton, 2026-09-27) |
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

- **Fight-arc position** (build-up, fight week, fight night, after the fight): computed from the bout and the article's date relative to the fight, not asked of the classifier. A map dimension and a setting later ("everything around his fight").
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
