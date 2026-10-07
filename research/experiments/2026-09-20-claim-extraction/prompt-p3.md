# Extraction prompt — DRAFT for Anton's review. Not run. Examples added 2026-09-20 at his request. Pass 2: 'own news' sharpened + occasion field. Pass 3: `kind` decided first, one fact per claim, about-someone-else → NO CLAIM.

## System
You extract the news from one article about a watched MMA fighter. Write nothing
the text does not state.

## User
WATCHED FIGHTER: {subject}
HEADLINE: {title}
OUTLET: {source}   PUBLISHED: {date}

ARTICLE TEXT:
{body}

Return JSON only, fields in this order:
{
  "kind": "Decide this FIRST. One of: new_event (a fight booked, a result, an injury, a signing, reported as news) | new_remark (he, or somebody about him, says something new: interview, podcast, post, presser, essay) | reaction (somebody answers a story already out) | analysis (a writer's or pundit's own verdict, preview, ranking, prediction) | restatement (repeats an event or remark already reported, adds nothing) | about_someone_else ({subject} is only mentioned; the news is another person's) | no_text (caption, stub, boilerplate, listing)",
  "claim": "ONE plain English sentence stating ONE fact: who did what, to whom, naming {subject}. It follows from `kind`: new_event → the event; new_remark → what was said (the remark, not the event it refers to); reaction → the reply; analysis → the writer's verdict or prediction, never the result or booking it discusses; restatement, about_someone_else, no_text → write exactly NO CLAIM. When an article carries an already-reported event AND something new (a callout after a win, a reaction after a booking), the NEW thing is the claim and the event is left out. Write it as a plain statement of fact — never 'the article mentions', 'a report says', or 'it is stated that'.",
  "occasion": "WHERE and WHEN the claimed thing was said or happened, as the text gives it: the podcast, interview, essay, press conference, social post, event or date. Two remarks by the same person on different occasions are different news; two outlets covering the same occasion are the same news. null only if the text gives nothing",
  "actor": "who did or said it (a name), or null",
  "opponent": "the other fighter involved, if any, or null",
  "event": "the event or card named, if any, or null",
  "date": "the date of the thing claimed (YYYY-MM-DD), if the text gives one, or null"
}

## Examples
Invented fighters and events, one per kind of news. These show the SHAPE of a good answer and some scenarios you may meet. They are not templates: judge what THIS article actually says, whether or not it resembles any example, and never bend an answer to fit the nearest one.

A fight is booked:
  {"kind": "new_event", "claim": "Marko Vidal will fight Sam Oduya at UFC 341 on 2026-11-14 in Abu Dhabi.", "occasion": "UFC announcement, 2026-09-02", "actor": "UFC", "opponent": "Sam Oduya", "event": "UFC 341", "date": "2026-11-14"}
A fight result:
  {"kind": "new_event", "claim": "Marko Vidal beat Sam Oduya by unanimous decision (30-27, 30-27, 29-28) at UFC 341.", "occasion": "UFC 341, 2026-11-14", "actor": "Marko Vidal", "opponent": "Sam Oduya", "event": "UFC 341", "date": "2026-11-14"}
An injury:
  {"kind": "new_event", "claim": "Marko Vidal broke his right hand in training and is out of UFC 341.", "occasion": "his Instagram post, 2026-10-30", "actor": "Marko Vidal", "opponent": null, "event": "UFC 341", "date": null}
A fight being negotiated:
  {"kind": "new_event", "claim": "The UFC has offered Marko Vidal a fight with Sam Oduya for December, and his manager says terms are not agreed.", "occasion": "manager Rob Perez on The MMA Hour", "actor": "UFC", "opponent": "Sam Oduya", "event": null, "date": null}
Somebody said something about him:
  {"kind": "new_remark", "claim": "Sam Oduya says Marko Vidal quit on his stool and does not deserve a rematch.", "occasion": "post-fight press conference, UFC 341", "actor": "Sam Oduya", "opponent": null, "event": null, "date": null}
He speaks about himself:
  {"kind": "new_remark", "claim": "Marko Vidal says he will return in early 2027 after surgery on both eye sockets.", "occasion": "interview with ESPN", "actor": "Marko Vidal", "opponent": null, "event": null, "date": null}
A forecast about him:
  {"kind": "analysis", "claim": "Analyst Rita Cole predicts Marko Vidal will finish Sam Oduya inside two rounds.", "occasion": "Rita Cole on the Fight Talk podcast", "actor": "Rita Cole", "opponent": "Sam Oduya", "event": null, "date": null}
Another career fact:
  {"kind": "new_event", "claim": "Marko Vidal has moved his training camp to Kill Cliff FC under coach Henri Hooft.", "occasion": "reported by MMA Junkie", "actor": "Marko Vidal", "opponent": null, "event": null, "date": null}
Personal life:
  {"kind": "new_remark", "claim": "Marko Vidal says he was bullied as a child in Tbilisi and that it shaped him as a fighter.", "occasion": "the Long Road podcast", "actor": "Marko Vidal", "opponent": null, "event": null, "date": null}

And the cases that carry NO news about him — the claim is exactly "NO CLAIM" and every field is null:
- a preview that only restates a booking announced months ago
- a card preview or weigh-in list where he is one line among many
- an article about somebody else that mentions him in passing, or recalls an old fight as background
- a photo caption, a rankings table, a video stub with no text, site boilerplate
  {"kind": "restatement", "claim": "NO CLAIM", "occasion": null, "actor": null, "opponent": null, "event": null, "date": null}

Two shapes that are easy to get wrong:
A next-day column about a fight already reported — the news is the writer's verdict, not the result it discusses:
  {"kind": "analysis", "claim": "Sport columnist Ana Ruiz argues Marko Vidal should have finished Sam Oduya and lacks a killer instinct.", "occasion": "column, the day after UFC 341", "actor": "Ana Ruiz", "opponent": "Sam Oduya", "event": "UFC 341", "date": null}
A win report that ends with a callout — the callout is the new thing, so it is the claim; the win is left out:
  {"kind": "new_remark", "claim": "Marko Vidal called out Diego Reyes for his next fight.", "occasion": "post-fight interview, UFC 341", "actor": "Marko Vidal", "opponent": "Diego Reyes", "event": null, "date": null}
A story about another fighter that names him once — no claim, whatever he is called in passing:
  {"kind": "about_someone_else", "claim": "NO CLAIM", "occasion": null, "actor": null, "opponent": null, "event": null, "date": null}
A piece listing who he might fight next, built on an old result — the news is the options, not the result:
  {"kind": "analysis", "claim": "MMA Weekly lists Oduya, Reyes and Kang as Marko Vidal's likeliest next opponents after his UFC 341 win.", "occasion": "MMA Weekly analysis piece", "actor": "MMA Weekly", "opponent": null, "event": null, "date": null}

## Notes for review
- The sentence is the thing under test. The four fields cost almost nothing
  and enable a later test of matching on fields instead of similarity.
- "NO CLAIM" is deliberate: the extractor must be allowed to say nothing
  rather than invent. Those rows are excluded from the similarity arms.
- Hedging is left OUT of the sentence on purpose ("accused", not "reportedly
  accused") — sourcing is already a classifier answer. Say if you disagree.
