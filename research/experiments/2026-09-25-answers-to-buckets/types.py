"""What types of news the 129 golden claims are: a bottom-up taxonomy, assigned by hand
after reading every claim's description, its articles' extractor and classifier answers,
and Anton's ruling where there is one. Writes TYPES.html and types.json.

The assignment is one reader's (Fable's) and is stated as such; Anton has not ruled on it.
"""
import json, os, html, collections
HERE = os.path.dirname(os.path.abspath(__file__)); G = f"{HERE}/../../../golden"
claims = {c["key"]: c for c in json.load(open(f"{G}/claims.json"))["claims"]}
arts = {str(r["id"]): r for r in json.load(open(f"{G}/articles.json"))}
e = html.escape

# family -> type -> (one-line definition, [claim keys])
T = {
 "A. The fight arc — news tied to one bout, in the order it happens": {
  "A1 Booking, official or reported": ("The promotion or an outlet says a fight is set.", ["claim-004"]),
  "A2 Fight-week furniture: card, start times, how to watch, live pages": ("The event exists and he is on it. No new fact about him.", ["claim-058", "claim-073.2", "claim-079", "claim-094.1"]),
  "A3 Pre-fight interview or feature, by the promotion or an outlet": ("He, or his opponent, talks before the fight; UFC.com features.", ["claim-055", "claim-061", "claim-062", "claim-071", "claim-087"]),
  "A4 Journalist's pre-fight column": ("The writer's own preview of his fight.", ["claim-073.0", "claim-073.1"]),
  "A5 Predictions and picks for his fight": ("Who wins, odds, tips; every outlet has one; one story by type (your ruling).", ["claim-066", "claim-085"]),
  "A6 Official weigh-in, ceremonial weigh-in, faceoff": ("Made weight; the staredown; a photo or a video.", ["claim-074", "claim-084", "claim-078"]),
  "A7 The result": ("He won or lost, how, scorecards; event-wide results pages.", ["claim-073.4", "claim-073.3"]),
  "A8 Straight after the fight: in-cage, backstage, press conference, his message": ("His first words after the fight, in each of its settings.", ["claim-095", "claim-093", "claim-094.0", "claim-101", "claim-007"]),
  "A9 Next-day analysis column": ("The writer grades the fight the day after.", ["claim-073.5"]),
  "A10 What next: callout, the reply, his reasons, next-opponent lists": ("The matchmaking that follows a fight.", ["claim-108", "claim-124", "claim-110", "claim-103"]),
 },
 "B. Voices about him — someone else speaks, and he is the subject": {
  "B1 A rival or peer assesses him": ("Another fighter judges his loss, his game, his chances.", ["claim-000", "claim-014", "claim-032", "claim-048", "claim-059", "claim-063", "claim-076", "claim-112", "claim-125", "claim-033"]),
  "B2 The next-fight debate: rematch or not, who should he fight": ("Pundits, fighters and the champion argue over his next booking.", ["claim-104", "claim-105", "claim-107", "claim-116", "claim-122", "claim-113", "claim-121", "claim-117"]),
  "B3 A friend or teammate gives news of him": ("How he is doing, from someone close.", ["claim-015.0", "claim-045", "claim-115"]),
  "B4 The opponent's coach on him": ("Mendez on Topuria: standing, but the other corner.", ["claim-017", "claim-036"]),
  "B5 A callout or trash talk aimed at him": ("Somebody wants him next, or insults him.", ["claim-035", "claim-050", "claim-099", "claim-003"]),
  "B6 His camp replies, or demands, on his behalf": ("His manager answers a callout or calls for a rematch.", ["claim-008", "claim-012", "claim-047"]),
  "B7 Matchmaking rumour and leak": ("An insider says the promotion is considering a fight for him.", ["claim-097", "claim-100"]),
  "B8 Fan reaction": ("Social media reacts to a rumour about him.", ["claim-106", "claim-118"]),
  "B9 The opponent's own news that bears on him": ("Gaethje's hands, Gaethje's plans, Gaethje's manager: about the other man, but it decides his rematch.", ["claim-054", "claim-065", "claim-067", "claim-069", "claim-002", "claim-027", "claim-044"]),
 },
 "C. His own voice — he speaks, and the news is about him": {
  "C1 Return to the public eye: statement, letter, essay, message": ("He breaks a silence; a long personal text; a message to fans.", ["claim-080", "claim-090", "claim-109", "claim-068"]),
  "C2 His life story: childhood, family, home, a lesson": ("Long-form personal interview or profile.", ["claim-022", "claim-037.0", "claim-037.1", "claim-039", "claim-123"]),
  "C3 His career talk: where he stands, who he compares to": ("He talks about his path, rankings, peers.", ["claim-127"]),
  "C4 He speaks of others or the sport": ("His words, someone else's subject (your rule: not about him).", ["claim-046", "claim-129"]),
  "C5 His camp on his condition: recovery, training, return date": ("Coach, physio, doctor, strength coach.", ["claim-015.1", "claim-064", "claim-096", "claim-041"]),
  "C6 Lifestyle feature by an outlet": ("Where he eats; a profile of his neighbourhood.", ["claim-005"]),
 },
 "D. Not about him — he is in the text, the news is someone else's": {
  "D1 Passing mention in another fighter's story": ("A name in a sentence, a comparison, a sidebar.", ["claim-009", "claim-018", "claim-019", "claim-021", "claim-024", "claim-025", "claim-026", "claim-034", "claim-038", "claim-040", "claim-042", "claim-049", "claim-052", "claim-053", "claim-056", "claim-060", "claim-070", "claim-092", "claim-098", "claim-111", "claim-114", "claim-119", "claim-120", "claim-126", "claim-010", "claim-020", "claim-028", "claim-016", "claim-030", "claim-011", "claim-128", "claim-083", "claim-031", "claim-006", "claim-023"]),
  "D2 Rankings, roundups, year reviews": ("Power rankings, title-picture pieces, a year in review, a champions-at-war feature.", ["claim-029", "claim-057", "claim-051", "claim-102", "claim-043"]),
  "D3 No usable text": ("A caption page, site furniture, a rankings stub.", ["claim-001", "claim-013"]),
 },
}
assigned = [k for fam in T.values() for _, ks in fam.values() for k in ks]
missing = sorted(set(claims) - set(assigned)); dup = [k for k, n in collections.Counter(assigned).items() if n > 1]
assert not missing and not dup, (missing, dup)

def n_art(keys): return sum(len(claims[k]["articles"]) for k in keys)
rows = []; fam_tot = {}
for fam, types in T.items():
    fam_tot[fam] = (sum(len(ks) for _, ks in types.values()), sum(n_art(ks) for _, ks in types.values()))
out = {fam: {t: {"definition": d, "claims": ks, "articles": n_art(ks)} for t, (d, ks) in types.items()} for fam, types in T.items()}
json.dump(out, open(f"{HERE}/types.json", "w"), ensure_ascii=False, indent=1)

def ex(keys):
    return "; ".join(f'<span class="k">{k.replace("claim-", "")}</span> {e(claims[k]["descriptions"][0][:95])}' for k in keys[:3]) + (f' <span class="k">… +{len(keys)-3} more</span>' if len(keys) > 3 else "")
sections = ""
for fam, types in T.items():
    c, a = fam_tot[fam]
    sections += f'<h2>{e(fam)} <span class="k">{c} claims · {a} articles</span></h2><table><tr><th>type</th><th>what it is</th><th>claims</th><th>articles</th><th>examples (claim number and Fable\'s description)</th></tr>'
    for t, (d, ks) in types.items():
        sections += f"<tr><td><b>{e(t)}</b></td><td>{e(d)}</td><td>{len(ks)}</td><td>{n_art(ks)}</td><td>{ex(ks)}</td></tr>"
    sections += "</table>"

CSS = open(f"{HERE}/build-report.py").read().split('CSS = """')[1].split('"""')[0]
H = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Types of News</title><style>{CSS}</style></head><body><div class="wrap">
<h1>What types of news are in the golden set</h1>
<div class="sub">The 129 golden claims, 300 articles, sorted into types by reading them. One reader's sorting (Fable, 2026-09-25), not a ruling; the numbers are counts of that sorting. Companion to <a href="REPORT.html">the answers-to-buckets report</a>.</div>

<div class="box exec"><h2 style="margin-top:0;border:0;padding:0">Executive summary</h2>
<ul>
<li><b>Four families cover everything: the fight arc, voices about him, his own voice, and not about him.</b> {fam_tot[list(T)[0]][0]} claims ({fam_tot[list(T)[0]][1]} articles) are the arc of one bout; {fam_tot[list(T)[1]][0]} ({fam_tot[list(T)[1]][1]}) are other people talking about him; {fam_tot[list(T)[2]][0]} ({fam_tot[list(T)[2]][1]}) are him, or his camp, on himself; {fam_tot[list(T)[3]][0]} ({fam_tot[list(T)[3]][1]}) are someone else's news with his name in it.</li>
<li><b>The fight arc is a fixed sequence of ten steps</b>, and this sample walks through all ten for one bout: booking, fight-week furniture, pre-fight interviews, the journalist's preview, predictions, weigh-ins and faceoff, the result, the first words after (in-cage, backstage, presser, his message), the next-day column, and the matchmaking that follows. It is the "arc above the story" you named on 23 September. Each step is one claim; the bout is the thread.</li>
<li><b>Outside a fight, the news is voices, and the voices sort by who speaks and why.</b> Rivals assessing him and the next-fight debate are the two biggest types (17 claims, 47 articles). Two types the questions do not name today: <b>the matchmaking rumour</b> (an insider says the promotion is considering a fight; the fan reaction it triggers) and <b>the opponent's own news that bears on him</b> (Gaethje's hands, Gaethje's plans: about the other man, but it decides the rematch).</li>
<li><b>His own voice splits into a return to the public eye, his life story, career talk, and his camp on his condition.</b> The recovery arc (statement after the loss, coach's return date, physio, "ready to fight", the rematch debate) is a second thread that runs across families: it is the story of the two months after a title loss, and no single type holds it.</li>
<li><b>Passing mentions are the largest single type: {len(T[list(T)[3]]["D1 Passing mention in another fighter's story"][1])} claims.</b> Nearly all singletons. They are the noise the classifier's role question already removes.</li>
<li><b>What this suggests for the design:</b> the storyboard needs two threads above the claim: the <i>bout</i> (arc steps A1 to A10 hang off it) and the <i>situation</i> (a recovery, a feud, a title picture) that voices attach to. The classifier's kind question could name the arc step directly, since the steps are closed and ordered; the voices need speaker and act, which v2 has; the two unnamed types want one option each.</li>
</ul></div>

{sections}

<h2>Two threads the types reveal, and what they would need</h2>
<div class="box">
<p><b>The bout thread.</b> Every A-type claim names the same bout, Donchenko vs Soriano, UFC Paris. The v2 extractor's <code>bout</code> field was one value across the articles in 30 of 47 multi-article claims and filled on 161 of 300 articles. An arc step is a closed list, so it can be a classifier option: booking / fight week / prediction / weigh-in / result / post-fight words / next-day column / what next. Today's kind question has half of these (booking, fight week, result, prediction) and folds the rest into "quote".</p>
<p><b>The situation thread.</b> Topuria's two months after the loss: his statement (C1), the coach's return date (C5), rivals on the loss (B1), friends on his mood (B3), the rematch leak (B7), the fan reaction (B8), the champion's "ready to fight" (B2), his letter to his son (C1), the debate (B2). Nine types, one story a follower would call "Topuria's road back". No field names it. It is the digest agent's unit, not the extractor's, which matches what you said on 22 September: the fact side lives in the digest agent.</p>
<p><b>What the sorting could not settle</b> and only you can: whether B9, the opponent's own news, is about him (it decides his next fight) or not (he is not in it); whether A2 fight-week furniture is a claim at all or belongs to the bout as a fact; and whether C4, his words on someone else, should surface on his board at all.</p>
</div>

<h2>How the sorting was done</h2>
<div class="box"><p>I printed all 129 claims with Fable's description, the most common extractor kind and occasion type across the claim's articles, and the most common classifier kind, act and speaker, and read the list top to bottom, fighter by fighter, in date order. Types were made from the descriptions, not from the answers; then each claim was placed in exactly one type, and the script checks that every claim is placed once. Where a claim sits on a line (a post-fight interview is both "straight after the fight" and "his own voice"), it went to the more specific type, the arc step. The definitions and the lists are in <code>types.py</code>; the counts in <code>types.json</code>.</p></div>
</div></body></html>"""
open(f"{HERE}/TYPES.html", "w").write(H)
print("TYPES.html", len(H) // 1024, "KB"); [print(f"  {fam[:60]:60} {c:>3} claims {a:>3} articles") for fam, (c, a) in fam_tot.items()]
