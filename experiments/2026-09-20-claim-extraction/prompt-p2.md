# Extraction prompt — DRAFT for Anton's review. Not run. Examples added 2026-09-20 at his request. Pass 2: 'own news' sharpened + occasion field, from pass-1 errors.

## System
You extract the news from one article about a watched MMA fighter. Write nothing
the text does not state.

## User
WATCHED FIGHTER: {subject}
HEADLINE: {title}
OUTLET: {source}   PUBLISHED: {date}

ARTICLE TEXT:
{body}

Return JSON only:
{
  "claim": "ONE plain English sentence: who did what, to whom, naming {subject}. It must be THIS article's own news — the thing a reader learns here and nowhere earlier. A result, booking or old quote that the article merely recalls to set up its point is NOT the claim; if the article's own contribution is an assessment, a prediction, a list of options or a new remark, THAT is the claim. If the article adds nothing a follower did not already know, write exactly: NO CLAIM",
  "occasion": "WHERE and WHEN the claimed thing was said or happened, as the text gives it: the podcast, interview, essay, press conference, social post, event or date. Two remarks by the same person on different occasions are different news; two outlets covering the same occasion are the same news. null only if the text gives nothing",
  "actor": "who did or said it (a name), or null",
  "opponent": "the other fighter involved, if any, or null",
  "event": "the event or card named, if any, or null",
  "date": "the date of the thing claimed (YYYY-MM-DD), if the text gives one, or null"
}

## Examples
Invented fighters and events, one per kind of news. These show the SHAPE of a good answer and some scenarios you may meet. They are not templates: judge what THIS article actually says, whether or not it resembles any example, and never bend an answer to fit the nearest one.

A fight is booked:
  {"claim": "Marko Vidal will fight Sam Oduya at UFC 341 on 2026-11-14 in Abu Dhabi.", "occasion": "UFC announcement, 2026-09-02", "actor": "UFC", "opponent": "Sam Oduya", "event": "UFC 341", "date": "2026-11-14"}
A fight result:
  {"claim": "Marko Vidal beat Sam Oduya by unanimous decision (30-27, 30-27, 29-28) at UFC 341.", "occasion": "UFC 341, 2026-11-14", "actor": "Marko Vidal", "opponent": "Sam Oduya", "event": "UFC 341", "date": "2026-11-14"}
An injury:
  {"claim": "Marko Vidal broke his right hand in training and is out of UFC 341.", "occasion": "his Instagram post, 2026-10-30", "actor": "Marko Vidal", "opponent": null, "event": "UFC 341", "date": null}
A fight being negotiated:
  {"claim": "The UFC has offered Marko Vidal a fight with Sam Oduya for December, and his manager says terms are not agreed.", "occasion": "manager Rob Perez on The MMA Hour", "actor": "UFC", "opponent": "Sam Oduya", "event": null, "date": null}
Somebody said something about him:
  {"claim": "Sam Oduya says Marko Vidal quit on his stool and does not deserve a rematch.", "occasion": "post-fight press conference, UFC 341", "actor": "Sam Oduya", "opponent": null, "event": null, "date": null}
He speaks about himself:
  {"claim": "Marko Vidal says he will return in early 2027 after surgery on both eye sockets.", "occasion": "interview with ESPN", "actor": "Marko Vidal", "opponent": null, "event": null, "date": null}
A forecast about him:
  {"claim": "Analyst Rita Cole predicts Marko Vidal will finish Sam Oduya inside two rounds.", "occasion": "Rita Cole on the Fight Talk podcast", "actor": "Rita Cole", "opponent": "Sam Oduya", "event": null, "date": null}
Another career fact:
  {"claim": "Marko Vidal has moved his training camp to Kill Cliff FC under coach Henri Hooft.", "occasion": "reported by MMA Junkie", "actor": "Marko Vidal", "opponent": null, "event": null, "date": null}
Personal life:
  {"claim": "Marko Vidal says he was bullied as a child in Tbilisi and that it shaped him as a fighter.", "occasion": "the Long Road podcast", "actor": "Marko Vidal", "opponent": null, "event": null, "date": null}

And the cases that carry NO news about him — the claim is exactly "NO CLAIM" and every field is null:
- a preview that only restates a booking announced months ago
- a card preview or weigh-in list where he is one line among many
- an article about somebody else that mentions him in passing, or recalls an old fight as background
- a photo caption, a rankings table, a video stub with no text, site boilerplate
  {"claim": "NO CLAIM", "occasion": null, "actor": null, "opponent": null, "event": null, "date": null}

Two shapes that are easy to get wrong:
A next-day column about a fight already reported — the news is the writer's verdict, not the result it discusses:
  {"claim": "Sport columnist Ana Ruiz argues Marko Vidal should have finished Sam Oduya and lacks a killer instinct.", "occasion": "column, the day after UFC 341", "actor": "Ana Ruiz", "opponent": "Sam Oduya", "event": "UFC 341", "date": null}
A piece listing who he might fight next, built on an old result — the news is the options, not the result:
  {"claim": "MMA Weekly lists Oduya, Reyes and Kang as Marko Vidal's likeliest next opponents after his UFC 341 win.", "occasion": "MMA Weekly analysis piece", "actor": "MMA Weekly", "opponent": null, "event": null, "date": null}

## Notes for review
- The sentence is the thing under test. The four fields cost almost nothing
  and enable a later test of matching on fields instead of similarity.
- "NO CLAIM" is deliberate: the extractor must be allowed to say nothing
  rather than invent. Those rows are excluded from the similarity arms.
- Hedging is left OUT of the sentence on purpose ("accused", not "reportedly
  accused") — sourcing is already a classifier answer. Say if you disagree.
