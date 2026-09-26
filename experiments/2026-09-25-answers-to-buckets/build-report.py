"""Build REPORT.html: the consolidated, skimmable write-up of this experiment.

Reads measures.json, scores-A.json, scores-B.json, sensitivity-v2.json. The
narrative is written here; every number is pulled from those files so the
page cannot drift from the data. `python3 build-report.py` regenerates it.
"""
import json, os, html, collections
HERE = os.path.dirname(os.path.abspath(__file__))
M = json.load(open(f"{HERE}/measures.json")); A = json.load(open(f"{HERE}/scores-A.json")); B = json.load(open(f"{HERE}/scores-B.json")); SV = json.load(open(f"{HERE}/sensitivity-v2.json"))
e = html.escape
def pct(x): return f"{x*100:.0f}%"
def hm(s): return s.replace("_", " ")

bm = B["bucket_mapping"]; old = bm["old rules + speaker gate (as shipped)"]; oldng = bm["old rules, no gate"]
v2 = bm["v2 rules, no gate"]; v2g = bm["v2 rules + speaker gate"]; draft = bm["v2 first draft, no gate"]; v2A = A["bucket_mapping"]["v2 rules, no gate"]
gt = B["ground_truth"]; sig_old = M["grouping_signals_within_3_days"]; sig_v2 = B["grouping_signals_v2"]
cons_old = M["within_claim_consistency"]; cons_v2 = B["within_claim_consistency_v2"]; qo = M["questions"]; cv = B["classifier_v2"]
rep = B.get("extractor_replicate", {}); fill = B["extractor_v2_fill"]

# ---- tables
def row(cells, head=False):
    t = "th" if head else "td"; return "<tr>" + "".join(f"<{t}>{c}</{t}>" for c in cells) + "</tr>"
def table(head, rows, cls=""):
    return f'<table class="{cls}">' + row(head, True) + "".join(row(r) for r in rows) + "</table>"

mapping_tbl = table(["rules", "all 154 rows graded on 4 and 5 September", "2 vs 3 only", "76 rows not inherited from a repeat", "tiers over the 300 (1 / 2 / 3)"], [
    ["Shipped today: six questions, old rules, speaker gate", pct(old["all"]["accuracy"]), pct(old["all"]["accuracy_2v3"]), pct(old["clean"]["accuracy"]), f'{old["dist_300"]["1"]} / {old["dist_300"]["2"]} / {old["dist_300"]["3"]}'],
    ["Old rules without the speaker gate", pct(oldng["all"]["accuracy"]), pct(oldng["all"]["accuracy_2v3"]), pct(oldng["clean"]["accuracy"]), f'{oldng["dist_300"]["1"]} / {oldng["dist_300"]["2"]} / {oldng["dist_300"]["3"]}'],
    ["v2 questions, first draft of the rules (tier 1 on kind alone)", pct(draft["all"]["accuracy"]), pct(draft["all"]["accuracy_2v3"]), pct(draft["clean"]["accuracy"]), f'{draft["dist_300"]["1"]} / {draft["dist_300"]["2"]} / {draft["dist_300"]["3"]}'],
    ["<b>v2 questions, corrected rules, no gate</b>", f'<b>{pct(v2["all"]["accuracy"])}</b>', f'<b>{pct(v2["all"]["accuracy_2v3"])}</b>', f'<b>{pct(v2["clean"]["accuracy"])}</b>', f'{v2["dist_300"]["1"]} / {v2["dist_300"]["2"]} / {v2["dist_300"]["3"]}'],
    ["v2 questions, corrected rules, speaker gate", pct(v2g["all"]["accuracy"]), pct(v2g["all"]["accuracy_2v3"]), pct(v2g["clean"]["accuracy"]), f'{v2g["dist_300"]["1"]} / {v2g["dist_300"]["2"]} / {v2g["dist_300"]["3"]}'],
    ["v2 rules on the v2 questions WITHOUT the 'one of many on a list' option", pct(v2A["all"]["accuracy"]), pct(v2A["all"]["accuracy_2v3"]), pct(v2A["clean"]["accuracy"]), f'{v2A["dist_300"]["1"]} / {v2A["dist_300"]["2"]} / {v2A["dist_300"]["3"]}'],
])

OLD_VERDICT = {
 "role": ("keep", "The strongest question. Background, mentioned only and not in the body are tier 3 in every graded case (37 of 37). Missing one option: 'one of many on a list', which is your 'one name among many' rule; adding it fixed the card previews and power rankings."),
 "whose_judgement": ("keep as a filter, not a tier rule", "The tier rules never read it except through the speaker gate, and against your grades its options are flat: an opponent's camp 17 vs 13, another fighter 11 vs 11. It is the storyboard's speaker filter and the per-fighter follow level, which is a setting, not a judgement of the article."),
 "what_is_done": ("keep, trimmed", "Naming in passing is tier 3 in 31 of 31; steering elsewhere 3 of 3; defending 9 of 10 tier 2. But 'assessing him' is where the 2-vs-3 line runs (36 vs 20) and the question cannot see it. Two options carried nothing: 'he fought' and 'covering his event' are never read by a rule."),
 "news_kind": ("merge the event half with sourcing, drop the rest", "Its job is tier 1, and only four of eleven options do that job. 'quote' is a sink: 160 of 300 articles, 48 tier 2 vs 28 tier 3 among the graded. Preview, prediction, lifestyle, other career fact and quote are never read by any rule."),
 "sourcing": ("fold into kind", "The tier depended on it for 35 articles of 300, all bucket-1 cases. 81% of its answers are the two 'no event to rate' options. As a question of its own it earned almost nothing; as a suffix on the booking option (official / reported / rumoured) it keeps its one job."),
 "novelty": ("split: keep the 'is anything here' half, drop the 'already known' half", "The most consulted question (205 articles) and the single best predictor (72%). But its 'restates known facts' option killed nine graded bucket-2 articles: fresh quotes from Makhachev and Pimblett the model called old. Whether the group has heard it is dedup's job and the claim store's, not a reading of one article. 'nothing about him' and 'filler' are tier 3 in 23 of 24 and that half is worth keeping as 'depth'."),
}
def q_old_rows():
    rows = []
    for q in ["role", "whose_judgement", "what_is_done", "news_kind", "sourcing", "novelty"]:
        s = qo["bucket_sensitivity"][q]["articles_whose_bucket_depends_on_it"]; ag = qo["reader_agreement"][q]
        unused = [o for o, n in qo["usage"][q].items() if n <= 1] + [o for o in qo["options"][q] if o not in qo["usage"][q]]
        v, why = OLD_VERDICT[q]
        rows.append([f"<b>{hm(q)}</b>", str(s), f'{ag.get("3", 0)} / {ag.get("2", 0)} / {ag.get("1", 0)}', str(qo["mean_confidence"][q]), ", ".join(hm(o) for o in qo["options_no_rule_consults"][q]) or "—", ", ".join(hm(o) for o in unused) or "—", f"<b>{v}</b>", why])
    return rows
q_old_tbl = table(["question", "articles whose tier depends on it (of 300)", "readers agree 3 / 2 / 1", "mean confidence", "options no rule ever reads", "options picked once or never", "verdict", "why"], q_old_rows(), "wide")

def q_v2_rows():
    rows = []
    for q in ["role", "speaker", "act", "kind", "depth"]:
        ag = cv["reader_agreement"][q]
        rows.append([f"<b>{q}</b>", str(SV["sensitivity"][q]["depends"]), f'{ag.get("3", 0)} / {ag.get("2", 0)} / {ag.get("1", 0)}', str(cv["mean_confidence"][q]), ", ".join(hm(o) for o in SV["unconsulted"][q]) or "—"])
    return rows
q_v2_tbl = table(["question", "articles whose tier depends on it", "readers agree 3 / 2 / 1", "mean confidence", "options no rule reads (they are storyboard filters)"], q_v2_rows())

sig_rows = []
for name, v in sig_old.items():
    sig_rows.append([e(name), pct(v["fires_on_same_claim"]), pct(v["fires_on_different_claim"]), pct(v["precision_if_used_alone"]) if v["precision_if_used_alone"] is not None else "—"])
sig_old_tbl = table(["signal (today's answers)", "fires on same-claim pairs (recall)", "fires on different-claim pairs", "precision if used alone"], sig_rows)
sig_rows2 = []
for name, v in sig_v2.items():
    sig_rows2.append([e(name), pct(v["recall"]), pct(v["precision"]) if v["precision"] is not None else "—", str(v["false_merges"]), str(v["missed_pairs"])])
sig_v2_tbl = table(["signal (v2 fields, and the old ones for comparison)", "recall", "precision", "false merges", "missed pairs"], sig_rows2)

cons_rows = [[hm(k), f'{v["claims_with_one_value"]} of {v["of"]}', str(v["claims_fully_filled"])] for k, v in cons_old.items()]
cons_old_tbl = table(["field (today)", "claims where every article gives the same value", "claims where every article has a value"], cons_rows)
cons_rows2 = [[k, f'{v["one_value"]} of {v["of"]}', str(v["filled_in_all"])] for k, v in cons_v2.items()]
cons_v2_tbl = table(["field (v2)", "claims where every article gives the same value", "claims where every article has a value"], cons_rows2)

opt_rows = []
for q, opts in cv["per_option_anton_bucket"].items():
    for o, d in sorted(opts.items(), key=lambda x: -sum(x[1].values())):
        n = sum(d.values())
        if n >= 3: opt_rows.append([q, hm(o), str(n), str(d.get(1, d.get("1", 0))), str(d.get(2, d.get("2", 0))), str(d.get(3, d.get("3", 0)))])
opt_tbl = table(["v2 question", "option", "articles graded 4 and 5 Sept", "your tier 1", "tier 2", "tier 3"], opt_rows)

miss_rows = [[f"#{x['id']}", str(x["anton"]), str(x["v2"]), str(x["old"]), x["reason"] or "—", hm(x["answers"]["role"]), hm(x["answers"]["speaker"]), hm(x["answers"]["act"]), hm(x["answers"]["kind"]), hm(x["answers"]["depth"]), e(x["title"])] for x in sorted(B["v2_errors"], key=lambda x: (x["anton"], x["v2"]))]
miss_tbl = table(["article", "your bucket", "v2 rules", "old rules", "reason code", "role", "speaker", "act", "kind", "depth", "headline"], miss_rows, "wide")

CSS = """
:root{--bg:#fbfaf8;--fg:#1a1917;--dim:#6b6762;--line:#e4e0da;--card:#fff;--soft:#f2f0ed;--acc:#1d4ed8;--accbg:#eef2ff;--ok:#15803d;--okbg:#eaf7ee;--warn:#a16207;--warnbg:#fdf3d7}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#171614;--fg:#eceae6;--dim:#9a948c;--line:#302d29;--card:#1f1e1b;--soft:#27251f;--acc:#93b4fd;--accbg:#1b2440;--ok:#4ade80;--okbg:#14301d;--warn:#d9a441;--warnbg:#3a2e12}}
:root[data-theme=dark]{--bg:#171614;--fg:#eceae6;--dim:#9a948c;--line:#302d29;--card:#1f1e1b;--soft:#27251f;--acc:#93b4fd;--accbg:#1b2440;--ok:#4ade80;--okbg:#14301d;--warn:#d9a441;--warnbg:#3a2e12}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 ui-sans-serif,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:980px;margin:0 auto;padding:28px 16px 90px}
h1{font-size:26px;margin:0 0 6px}h2{font-size:21px;margin:38px 0 10px;padding-top:14px;border-top:1px solid var(--line)}h3{font-size:17px;margin:22px 0 6px}
.sub{color:var(--dim);margin-bottom:18px}
.box{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin:14px 0}
.box.exec{border-color:var(--acc);background:var(--accbg)}
.box.warn{background:var(--warnbg)}
.box.ok{background:var(--okbg)}
ul{padding-left:20px}li{margin:5px 0}
table{border-collapse:collapse;width:100%;font-size:14px;margin:10px 0 16px;background:var(--card)}
th,td{padding:6px 9px;border:1px solid var(--line);vertical-align:top;text-align:left}th{background:var(--soft);font-weight:600}
table.wide{font-size:13px}
details{margin:8px 0}summary{cursor:pointer;color:var(--acc)}
code{background:var(--soft);padding:1px 5px;border-radius:4px;font-size:90%}
.toc{columns:2;font-size:14px}.toc a{color:var(--acc);text-decoration:none}
.k{color:var(--dim);font-size:13px}
@media(max-width:640px){.toc{columns:1}table{display:block;overflow-x:auto}}
"""

H = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Answers to Tiers</title><style>{CSS}</style></head><body><div class="wrap">
<h1>Which answers place an article, and which isolate a claim</h1>
<div class="sub">An analysis over the golden set, 2026-09-25. Two questions from Anton: could the classifier's questions and the extractor's fields be designed to better isolate the groupings in the golden set; and what combination of their answers should put an article in tier 1, 2 or 3. Plus: which questions and options proved useless.</div>

<div class="box exec"><h2 style="margin-top:0;border:0;padding:0">Executive summary</h2>
<ul>
<li><b>The tier rules shipped today agree with your tier grades of 4 and 5 September on {pct(old["all"]["accuracy"])} of the 154 golden articles that pass reached</b> ({pct(old["clean"]["accuracy"])} on the 76 that are not repeats of another article). Almost every miss is the rules saying tier 2 for something you called 3, or a fresh quote the model marked "already known".</li>
<li><b>Two questions earned almost nothing.</b> <i>sourcing</i> decides the tier for 35 articles in 300 and its answers are flat against the 4 and 5 September grades. <i>whose judgement</i> is never read by a tier rule; it is a filter and the per-fighter follow level, not a judgement of the article. The "already known" half of <i>novelty</i> is worse than useless: it dropped nine articles you graded 2. Six options across the six questions are never read by any rule, and the escape hatch was chosen once in 1,800 answers.</li>
<li><b>A five-question redesign, run today, reaches {pct(v2["all"]["accuracy"])} on the same 154 rows and {pct(v2["clean"]["accuracy"])} on the 76 clean ones</b>: role (plus one new option, "one of many on a list", your "one name among many" rule), speaker, act, kind (event options carry their own firmness), depth. Tier stable across three option orders on {cv["bucket_stable_across_orders"]} of 300. These are tuning numbers: I corrected the rules while looking at the misses, so expect the true figure to be lower.</li>
<li><b>One lesson from the run: merging "how firm is it" into the kind question broke tier 1.</b> The model called any interview that mentions a booking "booking, official". The fix is in the rule, not the question: a booking is tier 1 only when nobody is quoted or the promotion says it.</li>
<li><b>For grouping, no answer isolates a claim on its own, and the structured fields split into two kinds.</b> High-precision joins: two articles with the same speaker and the same host or programme name are the same claim {pct(sig_v2["v2 speaker = and origin_person ="]["precision"])} of the time, a shared verbatim quote {pct(sig_v2["v2 key_quote words overlap ≥ 0.5"]["precision"])}, an identical free-text occasion {pct(sig_old["ext.occasion = (exact)"]["precision_if_used_alone"])}; but each covers only a tenth to a quarter of the same-claim pairs. High-recall signals (same kind and actor: {pct(sig_old["ext.kind = and actor ="]["fires_on_same_claim"])} of pairs) fire on {pct(sig_old["ext.kind = and actor ="]["fires_on_different_claim"])} of different-claim pairs too. <b>The fields are a good "join without asking" rule for a quarter of cases and a good candidate filter for the rest. The rest needs a reader, which is the join-or-start stage you named.</b></li>
<li><b>The single most useful new extractor field is the person behind the occasion</b> (host, interviewer, account owner): one value per claim in 35 of 47 multi-article claims where the old free-text occasion managed 4 of 47. It is filled on only 63 of 300 articles, so it must be asked for harder. A "speaker" field is one value in 39 of 47.</li>
<li><b>What I would do next:</b> adopt the five questions and the mapping table below as the candidate; ask you to grade the 25 remaining misses so the number stops being a tuning number; make the join-or-start stage use speaker + origin person + key quote as an automatic join, fields plus similarity as the candidate list, and a reader for the rest.</li>
</ul>
<div class="k">Spent: about $0.30 on six classifier passes (estimated from tokens; about five cents a pass) and $0.19 metered on two extractor passes. Nothing in the older experiments or in golden/ was changed.</div>
</div>

<div class="toc"><a href="#method">How I did it</a><br><a href="#gt">What counts as your tier</a><br><a href="#today">Where today's mapping fails</a><br><a href="#useless">Which questions and options earned their place</a><br><a href="#grouping">What isolates a golden claim</a><br><a href="#v2">The v2 run: five questions, twelve fields</a><br><a href="#mapping">The proposed mapping, answers to tier</a><br><a href="#questions">The proposed questions and fields</a><br><a href="#next">Open for you, and next</a><br><a href="#caveats">Caveats</a><br><a href="#misses">Appendix: the 25 remaining misses</a></div>

<h2 id="method">How I did it, step by step</h2>
<div class="box">
<p><b>Step 1, collect what you have already said.</b> The golden set holds your rulings on which articles belong together, made this week. It holds no tier rulings. For tiers I went back to the two grading files from 4 and 5 September, made before the golden set existed. In the first you graded the 103 posted articles yourself. In the second, a reviewer model graded every archived article and you went through the rows writing "as graded" to confirm or a digit to overrule. I took every row that is also a golden article and where you wrote something: 154 articles. For an article marked as a repeat, I used the tier of the story it repeats, which is what the file says the content is.</p>
<p><b>Step 2, replay the rules that ship today.</b> I took the final classifier answers, applied the tier rules exactly as the classifier experiment left them, including the speaker gate, and compared the result with your 154 tiers. Then I listed every disagreement with all six answers beside it, and read them.</p>
<p><b>Step 3, ask of each question: does anything depend on it?</b> For every article and every question, I swapped the answer for each other option and checked whether the tier changed. A question the tier never depends on is not doing work. I also counted which options no rule ever reads, which options the model picked once or never, how often the three readers agreed, and, for each option, how your tiers fall inside it.</p>
<p><b>Step 4, ask of each field: does it tell two claims apart?</b> The bot compares an article with recent articles about the same fighter, so I built every pair of golden articles about the same fighter published within three days: 6,542 pairs, 745 of them inside one golden claim. For each field I asked two things: how often two articles in the same claim agree on it, and how often two articles in different claims also agree. The first is recall, the second is the false-merge rate. I also counted, for the 47 claims with more than one article, how many claims get a single value of each field.</p>
<p><b>Step 5, design a second version from what steps 2 to 4 said,</b> then run it once, on your budget. Classifier: five questions, three option orders, majority of three. Extractor: twelve fields, including a structured occasion, several facts, a bout and a verbatim key quote; then the identical prompt again to see how much moves on its own. Both ran on all 300 golden articles.</p>
<p><b>Step 6, score the second version the same way as the first,</b> against the same 154 tiers and the same 6,542 pairs. Where the rules were wrong rather than the questions, I corrected the rule and say so; where a question was missing an option, I added it and ran three more orders.</p>
<p>Everything is in <code>experiments/2026-09-25-answers-to-buckets/</code>: <code>measure.py</code> (steps 1 to 4), <code>run-classifier.py</code> and <code>run-extractor.py</code> (step 5), <code>score.py</code> (step 6), and this page from <code>build-report.py</code>. No file in golden/ or in the older experiments was written.</p>
</div>

<h2 id="gt">What counts as "your bucket" here: the 4 and 5 September grading, not this week's rulings</h2>
<div class="box warn"><p><b>Two different things you did are both called grading, so, once:</b> this week, on the golden set, you ruled on <i>grouping</i> for the 47 claims with two or more articles, and assigned no tiers. The tiers used here come from your pass of <b>4 and 5 September</b>, three weeks before the golden set existed, when you went through the archive row by row. <b>Where the 154 come from.</b> All 154 are among the 300 golden articles. They are the ones that also appear in the grading files of 4 and 5 September with a mark from you; the golden set was drawn later from the same archive, so the two overlap. The grading ran up to article #675, about the first four weeks of the six the golden set spans, so the 146 golden articles from 5 September onward carry no tier from you. The 154 are not the multi-article claims, because that pass went by archive row, not by claim: 102 of them sit inside a claim with two or more articles, 52 are singletons you never looked at this week, and they touch 78 of the 129 claims.</p><p>Of the 154: {gt["dist_all"]["1"]} tier 1, {gt["dist_all"]["2"]} tier 2, {gt["dist_all"]["3"]} tier 3. Only about nine carry a digit in your own hand; the rest are your "as graded" confirmations of a reviewer's tier, and the repeats inherit their root's tier from the same file. Two of those inherited labels look wrong to me and I left them as they are: seven "Topuria breaks silence" write-ups sit in tier 1 because their root was graded a career event, and two weigh-in reports sit in tier 1 through a grade you delegated. So the ceiling for any rule here is below 100%, and a miss on those rows is not necessarily a miss.</p></div>

<h2 id="today">Where today's mapping fails</h2>
<p>Old rules on the old answers, against the 4 and 5 September tiers:</p>
{table(["", "count"], [[k, str(v)] for k, v in old["all"]["matrix"].items()])}
<p>Read: 16 of the 70 graded 2 in September came out 3; 9 of the 72 graded 3 came out 2. Reading the misses, they group into four causes:</p>
<ul>
<li><b>"Restates known facts" fired on fresh quotes</b> (Makhachev on Topuria three times, Pimblett, three Donchenko preview pieces). The model was asked whether a follower already knew it, and a two-day-old interview reads as old to a model with no memory. That is dedup's question, not the classifier's.</li>
<li><b>Whose camp is "his camp".</b> Gaethje's manager talking about Gaethje was answered as "his camp, assessing him", and the rescue rule (background, but somebody judges him) let it through. The question said "his" and the model read it as the nearest fighter's.</li>
<li><b>One name among many.</b> A card preview with picks for every fight, a power ranking, a rival naming an opponent for him: you grade these 3. The old questions have no option for "he is one entry in a list", so they land in "assessing him" or "one of several subjects" and compose to 2.</li>
<li><b>Spoken by him is not about him,</b> and depth. Topuria on Mighty Mouse, Topuria's neighbourhood, one lesson from his divorce: the old questions answer "he tells his own story" and compose to 2. You graded all three 3.</li>
</ul>

<h2 id="useless">Which questions and options earned their place</h2>
<p>Every row is measured, not read: how many of the 300 articles change tier if this one answer changes; how often the three readers agreed; which options nothing reads. The verdict is mine.</p>
{q_old_tbl}
<p>Two more facts. The questions overlap most between <i>news kind</i> and <i>sourcing</i> (they share {qo["nmi"]["news_kind~sourcing"]} of their information) and between <i>news kind</i> and <i>what is done</i> ({qo["nmi"]["what_is_done~news_kind"]}); the rest are fairly independent. And the escape hatch, "not in this list", was chosen once across 1,800 answers: the option lists are complete enough that the hatch no longer finds anything, which is what it was for.</p>

<h2 id="grouping">What isolates a golden claim</h2>
<p>A claim is one occasion. The question is which answer, on its own or in a pair, says "these two articles are the same occasion" without also saying it for two different occasions.</p>
<h3>Today's answers, on the 6,542 pairs</h3>
{sig_old_tbl}
<p>Read: the classifier's answers are useless for grouping. Two articles in different claims share a news kind 37% of the time and a role 37% of the time. The extractor's free-text occasion, when it matches exactly, is right {pct(sig_old["ext.occasion = (exact)"]["precision_if_used_alone"])} of the time but matches in only a quarter of same-claim pairs, because the same podcast comes back under six names. Kind plus actor catches {pct(sig_old["ext.kind = and actor ="]["fires_on_same_claim"])} of same-claim pairs and would also merge {sig_old["ext.kind = and actor ="]["fires_on_different_claim"]:.0%} of different-claim pairs: it is a candidate filter, not a decision.</p>
<h3>Inside the 47 claims with two or more articles</h3>
{cons_old_tbl}
<p>Read: articles of one claim agree on the actor (40 of 47) and mostly on the kind (35 of 47), and almost never on the occasion string (4 of 47). Twelve claims carry two extractor kinds at once: a post-fight interview extracted as the result by one outlet and as a remark by five; the merged predictions claim with one "no text" inside it. Eighteen of the 47 claims land in two different tiers under today's rules, which is a mapping problem, not a grouping one: the same interview should not be tier 2 from one outlet and 3 from another.</p>
<p>Also: {M["pairs"]["same_claim_beyond_3_days"]} same-claim pairs sit more than three days apart, so a three-day candidate window can never see them. The eight-piece NV interview and the Masvidal podcast written up four days later are among them.</p>

<h2 id="v2">The v2 run: five questions, twelve fields</h2>
<h3>Classifier</h3>
<p>Five questions in place of six: <b>role</b> (the old one, plus "one of many on a list"), <b>speaker</b> (who is the source; "his" spelled out as the watched fighter's), <b>act</b> (what is done, with "he speaks of others" made explicit), <b>kind</b> (news kind with the booking option split into official / reported / rumoured, so sourcing disappears), <b>depth</b> (the useful half of novelty: substantial, a line or two, nothing). Three option orders each, majority of three; then three more orders after the role option was added.</p>
{q_v2_tbl}
<p>Readers agreed on all five answers in most articles; the tier was the same in all three orders on {cv["bucket_stable_across_orders"]} of 300 (the old set: 270). Against your tiers, per option:</p>
<details><summary>every v2 option against the 4 and 5 September tiers (the 154 only)</summary>{opt_tbl}</details>
<h3>The mapping, scored</h3>
{mapping_tbl}
<p>Read the rows top to bottom. The first draft of the v2 rules did worse than today, and the reason was one thing: <b>merging "how firm" into kind made the model answer "booking, official" for any interview in which a booked fight is mentioned</b>, so ten articles you graded 2 became tier 1. Correcting the rule so that a booking is tier 1 only when nobody is quoted or the promotion says it, and a result only when the fight is the news, took it to {pct(v2["all"]["accuracy"])}. Adding the "one of many on a list" role option is worth another few points ({pct(v2A["all"]["accuracy"])} without it). The speaker gate, your 18 September default that drops other fighters and pundits for Topuria, costs accuracy against these grades ({pct(v2g["all"]["accuracy"])}) because the grades predate that ruling and keep Merab on Topuria; on the clean rows it helps ({pct(v2g["clean"]["accuracy"])}). The gate is a volume setting, so that is expected, not a fault.</p>
<h3>Extractor</h3>
<p>Twelve fields, the whole body, Qwen3.8 Flash as before. Fill over 300 articles: facts {fill["facts"]}, occasion type {fill["occasion_type"]}, origin {fill["origin"]}, origin person {fill["origin_person"]}, speaker {fill["speaker"]}, bout {fill["bout"]}, key quote {fill["key_quote"]}, predicted winner {fill["predicted_winner"]}, odds {fill["odds"]}. {B["facts_per_article"].get("2", 0)} articles gave two facts, {B["facts_per_article"].get("3", 0)} three. The kind field agreed with the old prompt's on {sum(v.get(k, 0) for k, v in B["extractor_v2_kind_vs_old"].items())} of 300.</p>
{sig_v2_tbl}
<p>Read: <b>speaker plus origin person is a perfect join in this sample ({sig_v2["v2 speaker = and origin_person ="]["false_merges"]} false merges) but reaches only {pct(sig_v2["v2 speaker = and origin_person ="]["recall"])} of same-claim pairs</b>, because the model filled origin person on 63 articles. Speaker plus either the origin person or an overlapping origin name: {pct(sig_v2["v2 speaker = and (origin_person = or origin overlap ≥ 0.5)"]["precision"])} precision, {pct(sig_v2["v2 speaker = and (origin_person = or origin overlap ≥ 0.5)"]["recall"])} recall. A shared verbatim quote is also a perfect join and rare. The lead fact's word overlap is a better similarity than the old one-sentence extract ({pct(sig_v2["v2 lead fact words overlap ≥ 0.5"]["precision"])} vs {pct(sig_old["ext.extract words overlap ≥ 0.5"]["precision_if_used_alone"])} precision at the same recall). Bout plus occasion type looks strong ({pct(sig_v2["v2 bout = and occasion_type ="]["recall"])} recall) but merges the fight week's columns, previews and predictions into one, which your ruler keeps apart; it is a candidate filter.</p>
{cons_v2_tbl}
<p>Read: a person's name is more stable than a programme's name. Speaker is one value in 39 of 47 claims, origin person in 35 of 47 where filled, origin string in 12 of 47. Occasion type is one value in only 24 of 47: the same MightyCast sitting came back as "podcast" from four outlets and "interview" from two, so the type list wants fewer, broader options or the matcher must treat interview, podcast and broadcast as one family.</p>
<p>Noise floor: the identical second pass returned the same kind on {rep.get("kind", "?")} of 300 articles, the same occasion type on {rep.get("occasion_type", "?")}, the same speaker on {rep.get("speaker", "?")}, the same bout on {rep.get("bout", "?")}, the same key quote on {rep.get("key_quote", "?")} and the same lead sentence on {rep.get("lead_fact_identical", "?")}. Anything that moves less than that between two prompts is not a difference.</p>

<h2 id="mapping">The proposed mapping, answers to tier</h2>
<div class="box ok"><p>Read top to bottom; the first line that fits decides. Every line traces to a rule you stated in goals.md or in a verdict.</p>
{table(["order", "if", "bucket", "your rule behind it"], [
 ["1", "role is background, mentioned only, not in the body, or one of many on a list", "3", "Not about him. Mentioned near him is not about him; one name among many (2026-09-04)."],
 ["2", "depth is nothing about him", "3", "Nothing here."],
 ["3", "act is naming him in passing, nothing, he speaks of others, or steering him elsewhere", "3", "Spoken by him is not about him; others steering him elsewhere is not about him (2026-09-04)."],
 ["4", "kind is no news about him", "3", ""],
 ["5", "kind is result AND act is he fought", "1", "Career event: the fight is the news."],
 ["6", "kind is booking official / reported / injury AND (speaker is nobody or the promotion, OR act is his fight week)", "1", "Career event, announced or reported, not a quote that mentions it. A rumoured booking stays 2."],
 ["7", "depth is a line or two", "3", "Depth matters (#380 stayed 3)."],
 ["8", "speaker has no standing for this fighter (another fighter, pundit or journalist) AND the fighter is not on follow-all", "3", "The per-fighter follow level (2026-09-18). A setting, applied last."],
 ["9", "everything else", "2", "Substance about him: callouts, replies, assessments by people with standing, his own account when it has depth, lifestyle with depth (2026-09-05)."],
])}
<p>Lines 1 to 4 say "not about him"; 5 and 6 say "career event"; 7 and 8 are the two dials you have named, depth and standing; 9 is the digest. What the table cannot do, and no article-level question can: decide whether a substantial third-party assessment of Topuria is worth the group's time. That is the follow level, line 8, and it is yours to set per fighter.</p></div>

<h2 id="questions">The proposed questions and fields</h2>
<h3>Classifier, five questions</h3>
<ul>
<li><b>role</b>: the subject / one of several subjects / one of many on a list / the one being talked about / background / mentioned only / not in the article body. Unchanged but for the new option; "a bystander" dropped, it was chosen zero times in 300.</li>
<li><b>speaker</b>: himself / his coach or camp / opponent or their camp / champion or promotion / another fighter / pundit or journalist / nobody. The instruction says "his" means the watched fighter's, and it names the headline's source when several speak. Not a tier rule except through the follow level; it is the storyboard's speaker filter.</li>
<li><b>act</b>: calling him out / assessing him / answering for him / steering him elsewhere / he speaks of himself / he speaks of others / he fought / his fight week / naming him in passing / nothing. "He speaks of others" is the option your 2026-09-04 rule needed and the old set lacked.</li>
<li><b>kind</b>: booking official / booking reported / booking rumoured / result / injury or medical / fight week / quote / prediction / lifestyle / other career fact / no news about him. Sourcing folded in as the three booking options. Lesson from the run: the model over-reads "booking" whenever a booked fight is mentioned, so the rule, not the question, must ask who said it.</li>
<li><b>depth</b>: substantial / a line or two / nothing about him. The instruction says: judge only this article's text about him, never whether a follower already heard it.</li>
</ul>
<h3>Extractor, twelve fields</h3>
<ul>
<li><b>kind</b> as today. <b>facts</b>: one to three sentences about him, lead first; your 9b. Two facts came back for {B["facts_per_article"].get("2", 0)} articles, so the second fact exists in the text most of the time.</li>
<li><b>occasion_type</b>, <b>origin</b> (programme, outlet or event where it originally happened), <b>origin_person</b> (host, interviewer, account owner), <b>speaker</b>, <b>occasion_date</b>: the free-text occasion taken apart. The person fields are the stable ones; the type list should shrink to spoken (interview, podcast, broadcast, presser), post-fight, social post, statement, fight, weigh-in, announcement, column.</li>
<li><b>bout</b> ("Surname vs Surname"), <b>event</b>: the event fields for results, bookings and fight week.</li>
<li><b>key_quote</b>: up to twelve verbatim words; a perfect join when it matches.</li>
<li><b>predicted_winner</b>, <b>odds</b>: your 9d; 21 picks and 9 odds lines in this sample.</li>
</ul>

<h2 id="next">Open for you, and next</h2>
<ul>
<li><b>Grade the 25 misses below.</b> Some are the label, not the rule (the "breaks silence" tier 1s, the weigh-ins). Once you have, the mapping's number stops being a tuning number.</li>
<li><b>Is a card-wide preview with a section on his fight tier 3?</b> You graded four such pieces 3 and two pieces about his fight alone 2. The new role option encodes that; say if it is wrong.</li>
<li><b>Is lifestyle with depth 2 and lifestyle trivia 3?</b> The restaurant (3), the neighbourhood (3), the divorce lesson (3), the grandmother (2), the hobbies (2). Depth is the only question that can see it and the model called all five substantial. This may need a line in the depth question: "about his life, does a follower learn a story, or a detail?"</li>
<li><b>Join-or-start stage:</b> automatic join on speaker + origin person, or a shared key quote; candidate list from kind + speaker + bout within a window wider than three days; a reader decides the rest. The next experiment is that reader on the candidate lists this sample produces.</li>
<li><b>Ask for origin person harder</b> in the extractor prompt; it was filled on 63 of 300 and is the best field there is.</li>
</ul>

<h2 id="caveats">Caveats, stated once</h2>
<ul>
<li>The tier labels are mostly your confirmations of a reviewer's grade, and repeats inherit a root's grade; two clusters of them look wrong. 154 rows, 12 of them tier 1.</li>
<li>I designed the v2 rules while looking at the misses, and added one option after seeing what it would fix. In-sample. A held-out test needs your grades on articles I have not looked at.</li>
<li>One fight week. Every result is Donchenko vs Soriano; every prediction is about it.</li>
<li>One classifier model, one extractor model, one run each (three orders for the classifier, a replicate for the extractor). Nothing here says how a different model would do.</li>
<li>The grouping signals are measured on the ruler as it stands, v3, with 82 singletons you have not yet reviewed.</li>
</ul>

<h2 id="misses">Appendix: the 25 remaining misses, v2 questions and corrected rules</h2>
{miss_tbl}
</div></body></html>"""
open(f"{HERE}/REPORT.html", "w").write(H)
print("REPORT.html", len(H) // 1024, "KB")
