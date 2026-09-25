# Extraction prompt v2 — structured occasion, several facts, a bout, a key quote. Built 2026-09-25 from the golden-claim measurements; kind and the lead fact keep pass-4 wording so the two are comparable.

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
  "kind": "Decide this FIRST. One of: new_event (a fight booked, a result, an injury, a signing, a weigh-in, reported as news) | new_remark (he, or somebody about him, says something new: interview, podcast, post, presser, essay) | reaction (somebody answers a story already out) | analysis (a writer's or pundit's own verdict, preview, ranking, prediction) | restatement (repeats an event or remark already reported, adds nothing) | about_someone_else (the news is another person's and {subject} is only named in passing — test: delete every sentence that names {subject}; if the story still stands, it is about someone else. If another person calls him out, wants to fight him, assesses him, criticises him or talks about a fight with him, the article is ABOUT him — that is new_remark, not about_someone_else) | no_text (caption, stub, boilerplate, listing)",
  "facts": "A list of one to three plain English sentences, each stating ONE fact about {subject}: who did what, to whom, naming {subject}. The FIRST is the article's lead: for new_event the event; new_remark what was said; reaction the reply; analysis the writer's verdict. The others are further things the article states about him, most important first. Leave out anything said about other people. For restatement, about_someone_else and no_text return an empty list []. Plain statements of fact — never 'the article mentions' or 'it is stated that'.",
  "occasion_type": "WHERE the lead fact was said or happened. One of: interview (a sit-down or on-camera interview with a journalist or outlet) | podcast (a podcast or YouTube show episode) | press_conference (presser, media day, scrum, fight-week media) | post_fight_interview (in-cage or backstage right after a fight) | social_post (Instagram, X, YouTube post by the person) | statement (an official statement, an open letter, a release) | fight (the fight itself) | weigh_in | announcement (the promotion announces a booking) | column (the writer's own piece, preview or prediction) | broadcast (TV or stream commentary) | unknown",
  "origin": "The programme, show, outlet or event where the lead fact ORIGINALLY happened, as the text names it, not the outlet writing this article unless it is the same: 'MightyCast', 'The MMA Hour', 'UFC Paris', 'Helen Yee interview', 'his Instagram'. null if the text gives nothing.",
  "origin_person": "The host, interviewer, journalist or account owner of that origin, by name, if the text names them: 'Demetrious Johnson', 'Helen Yee', 'Ariel Helwani'. null if none.",
  "speaker": "Who said the lead fact, by name: the fighter, the other fighter, the coach, the manager, the promotion ('UFC'), or the writer's name or outlet for a column. null for an event nobody is quoted on.",
  "occasion_date": "The date the lead fact was said or happened (YYYY-MM-DD), if the text gives one; else null. Not the article date.",
  "bout": "The fight the lead fact is about, if any, as 'Surname vs Surname' with {subject}'s surname first: 'Donchenko vs Soriano'. A fight that is only recalled as background is NOT this. null if none.",
  "event": "The event or card named for that bout, if any: 'UFC Paris', 'UFC 330'. null if none.",
  "key_quote": "Up to twelve words, verbatim, of the most prominent quoted sentence in the article, in its original language. null if nothing is quoted.",
  "predicted_winner": "For a prediction or a pick only: the surname of the predicted winner. null otherwise.",
  "odds": "Odds or a line if the text gives one, as written ('-238', '2.10'). null otherwise."
}

## Examples
Invented fighters. These show the SHAPE of a good answer; judge what THIS article actually says.

A podcast remark about him:
  {"kind": "new_remark", "facts": ["Sam Oduya says Marko Vidal lost focus after winning the belt.", "Sam Oduya says Marko Vidal can return to the top if he refocuses."], "occasion_type": "podcast", "origin": "The Fight Talk podcast", "origin_person": "Rita Cole", "speaker": "Sam Oduya", "occasion_date": null, "bout": null, "event": null, "key_quote": "he lost focus the moment he won that belt", "predicted_winner": null, "odds": null}
A fight result:
  {"kind": "new_event", "facts": ["Marko Vidal beat Sam Oduya by unanimous decision at UFC 341."], "occasion_type": "fight", "origin": "UFC 341", "origin_person": null, "speaker": null, "occasion_date": "2026-11-14", "bout": "Vidal vs Oduya", "event": "UFC 341", "key_quote": null, "predicted_winner": null, "odds": null}
A booking:
  {"kind": "new_event", "facts": ["Marko Vidal will fight Sam Oduya at UFC 341 on 2026-11-14."], "occasion_type": "announcement", "origin": "UFC announcement", "origin_person": null, "speaker": "UFC", "occasion_date": "2026-09-02", "bout": "Vidal vs Oduya", "event": "UFC 341", "key_quote": null, "predicted_winner": null, "odds": null}
A pick:
  {"kind": "analysis", "facts": ["Analyst Rita Cole predicts Marko Vidal will finish Sam Oduya inside two rounds."], "occasion_type": "column", "origin": "MMA Weekly", "origin_person": "Rita Cole", "speaker": "Rita Cole", "occasion_date": null, "bout": "Vidal vs Oduya", "event": "UFC 341", "key_quote": null, "predicted_winner": "Vidal", "odds": "-150"}
A backstage interview after his win, with a callout:
  {"kind": "new_remark", "facts": ["Marko Vidal called out Diego Reyes for his next fight.", "Marko Vidal says he was never hurt in the fight."], "occasion_type": "post_fight_interview", "origin": "UFC 341 backstage interview", "origin_person": null, "speaker": "Marko Vidal", "occasion_date": "2026-11-14", "bout": "Vidal vs Oduya", "event": "UFC 341", "key_quote": "give me Reyes next", "predicted_winner": null, "odds": null}
A story about another fighter that names him once:
  {"kind": "about_someone_else", "facts": [], "occasion_type": "unknown", "origin": null, "origin_person": null, "speaker": null, "occasion_date": null, "bout": null, "event": null, "key_quote": null, "predicted_winner": null, "odds": null}
