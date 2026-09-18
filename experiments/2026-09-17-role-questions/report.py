"""Build a browsable HTML report of how all 300 articles were sorted.

Self-contained: data is embedded, no server, no network. Regenerate any time
with `python3 report.py`.
"""
import json, collections, html

C     = json.load(open("consensus-p10.json"))
B     = json.load(open("buckets-p10.json"))
FINAL = json.load(open("buckets-final.json"))      # after Anton's speaker ruling
arts  = {str(r["id"]): r for r in json.load(open("data/articles.json"))}

QLABEL = {
 "role":            "What is he in this article?",
 "whose_judgement": "Who is speaking about him?",
 "what_is_done":    "What is being done to him?",
 "news_kind":       "What kind of news is it?",
 "sourcing":        "How firm is the claim?",
 "novelty":         "Is any of it new?",
}
VLABEL = {
 "the_subject":"The article is about him", "one_of_several_subjects":"Shares it with others",
 "the_one_being_talked_about":"Someone else is talking about him", "a_bystander":"A bystander",
 "background":"Only backdrop in someone else's story", "mentioned_only":"Named once, nothing said",
 "not_in_the_article_body":"Not in the article at all",
 "himself":"Himself", "his_camp":"His camp \u2014 coach, manager, doctor",
 "an_opponent_or_their_camp":"An opponent, or their camp",
 "the_champion_or_a_top_authority":"The champion, or the UFC",
 "a_pundit_or_commentator":"A pundit or commentator", "another_fighter":"Another fighter",
 "the_article_author":"The journalist, in their own voice", "no_one_judges_him":"Nobody judges him",
 "calling_him_out":"Calling him out", "assessing_him":"Assessing him", "defending_him":"Defending him",
 "steering_him_elsewhere":"Steering him elsewhere", "he_tells_his_own_story":"He tells his own story",
 "he_gives_his_view":"He gives his view on someone else", "covering_his_event":"Covering his weigh-in or faceoff",
 "naming_him_in_passing":"Naming him in passing", "nothing_of_the_sort":"Nothing of the sort",
 "announcement":"A fight is booked", "result":"A fight result", "injury":"An injury",
 "negotiation":"A fight being negotiated", "quote":"Somebody said something", "prediction":"A forecast",
 "preview":"Preview of a known fight", "other_career_fact":"Another career fact",
 "lifestyle":"Personal life", "no_news_about_him":"No news about him",
 "official":"The promotion announced it", "reported":"An outlet states it as fact",
 "rumored":"Hedged \u2014 rumoured or in talks", "only_a_quote_no_event":"Only a quote, no event",
 "no_factual_claim":"No factual claim at all",
 "new_and_substantial":"Yes \u2014 new and substantial", "small_new_detail":"A small new detail",
 "restates_known_facts":"No \u2014 restates what was known", "filler_no_information":"No \u2014 filler",
 "nothing_about_him":"Nothing about him at all",
 "not_in_this_list":"None of the options fitted",
}

RUNS  = {n: {str(r["id"]): r for r in json.load(open(f"results-p{n}.json")) if r.get("answers")}
         for n in (10,11,12)}
QS    = ["role", "whose_judgement", "what_is_done", "news_kind", "sourcing", "novelty"]
FOLLOW_ALL = {"Daniil Donchenko", "Yaroslav Amosov"}

anton = {"838"}
fable = set()
for g, d in json.load(open("fable-verdicts.json")).items():
    if not g.startswith("_"): fable |= set(d)
for k in ["735","16","368","807","208","490","794","778","327","817","1076","625",
          "224","247","937","560","743","520","609","605","1200","457"]: fable.add(k)

OPTS = {q: sorted({k for n in (10,11,12) for a in RUNS[n]
                   for k in RUNS[n][a]["answers"][q]["probabilities"]}) for q in QS}

rows = []
for a in sorted(C, key=lambda x: arts[x]["published_at"], reverse=True):
    r = arts[a]
    rows.append({
        "id": a, "d": str(r["published_at"])[:10], "f": r["subject"],
        "o": r["source"], "t": r["title"], "u": r.get("url") or "",
        "b": B[a]["bucket"], "fb": FINAL[a], "why": B[a]["why"],
        "st": B[a]["stable"], "chars": r["body"].__len__(),
        "ans": {q: [C[a][q]["choice"], C[a][q]["agree"], C[a][q]["conf"]] for q in QS},
        "all": {q: [round(sum(RUNS[n][a]["answers"][q]["probabilities"].get(o, 0)
                              for n in (10,11,12))/3, 3) for o in OPTS[q]] for q in QS},
        "judged": "anton" if a in anton else ("fable" if a in fable else ""),
        "prod": r.get("digest_tier") or ("posted" if r.get("posted") else ""),
    })

CSS = """
:root{--bg:#fbfaf8;--fg:#1a1917;--dim:#6b6762;--line:#e4e0da;--card:#fff;
--b1:#c2410c;--b1bg:#fff1e9;--b2:#1d4ed8;--b2bg:#eef2ff;--b3:#6b6762;--b3bg:#f2f0ed;--warn:#a16207}
:root:not([data-theme=light]){@media(prefers-color-scheme:dark){
:root{--bg:#171614;--fg:#eceae6;--dim:#9a948c;--line:#302d29;--card:#1f1e1b;
--b1:#fb923c;--b1bg:#3a2314;--b2:#93b4fd;--b2bg:#1b2440;--b3:#9a948c;--b3bg:#27251f;--warn:#d9a441}}}
:root[data-theme=dark]{--bg:#171614;--fg:#eceae6;--dim:#9a948c;--line:#302d29;--card:#1f1e1b;
--b1:#fb923c;--b1bg:#3a2314;--b2:#93b4fd;--b2bg:#1b2440;--b3:#9a948c;--b3bg:#27251f;--warn:#d9a441}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 ui-sans-serif,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:28px 16px 80px}
h1{font-size:23px;margin:0 0 4px;letter-spacing:-.01em}
.sub{color:var(--dim);font-size:13.5px;margin-bottom:22px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:20px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:9px;padding:13px 14px}
.tile .n{font-size:26px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.tile .l{color:var(--dim);font-size:12px;margin-top:2px}
.bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px;
background:var(--card);border:1px solid var(--line);border-radius:9px;padding:11px 13px}
select,input{font:inherit;font-size:13.5px;padding:6px 9px;border:1px solid var(--line);
border-radius:6px;background:var(--bg);color:var(--fg)}
input{flex:1;min-width:150px}
.count{color:var(--dim);font-size:13px;margin-left:auto;font-variant-numeric:tabular-nums}
.art{background:var(--card);border:1px solid var(--line);border-left-width:3px;border-radius:8px;
padding:11px 13px;margin-bottom:7px}
.art[data-b="1"]{border-left-color:var(--b1)} .art[data-b="2"]{border-left-color:var(--b2)}
.art[data-b="3"]{border-left-color:var(--b3)}
.top{display:flex;gap:9px;align-items:baseline;flex-wrap:wrap}
.bdg{font-size:11px;font-weight:600;padding:2px 7px;border-radius:20px;white-space:nowrap}
.bdg[data-b="1"]{background:var(--b1bg);color:var(--b1)} .bdg[data-b="2"]{background:var(--b2bg);color:var(--b2)}
.bdg[data-b="3"]{background:var(--b3bg);color:var(--b3)}
.ttl{font-weight:500;flex:1;min-width:230px}
.ttl a{color:inherit;text-decoration:none} .ttl a:hover{text-decoration:underline}
.meta{color:var(--dim);font-size:12.5px;margin-top:4px;display:flex;gap:9px;flex-wrap:wrap;align-items:center}
.why{font-size:12.5px;color:var(--dim);font-style:italic}
.flag{color:var(--warn);font-size:11.5px;font-weight:600}
.ans{display:none;margin-top:11px;padding-top:11px;border-top:1px solid var(--line);
grid-template-columns:repeat(auto-fit,minmax(255px,1fr));gap:13px 24px}
.art.open .ans{display:grid}
.ans2{display:none;margin-top:11px;padding-top:11px;border-top:1px solid var(--line);
grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:14px 26px}
.art.open2 .ans2{display:grid}
.qfull .qq{margin-bottom:5px}
.orow{display:flex;align-items:center;gap:8px;font-size:12.5px;padding:1.5px 0;color:var(--dim)}
.orow.win{color:var(--fg);font-weight:500}
.orow.zero{opacity:.45}
.orow.hatch .oname{font-style:italic}
.oname{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.obar{flex:0 0 54px;height:4px;border-radius:3px;background:var(--line);overflow:hidden}
.obar i{display:block;height:100%;background:var(--line);border-radius:3px}
.orow.win .obar i{background:var(--b2)}
.orow.hatch .obar i{background:var(--warn)}
.opct{flex:0 0 30px;text-align:right;font-variant-numeric:tabular-nums;font-size:11.5px}
.q{font-size:13px}
.qq{color:var(--dim);font-size:12px;margin-bottom:2px}
.qa{font-weight:500;line-height:1.35}
.qa.lo{color:var(--warn)}
.qm{display:flex;align-items:center;gap:7px;margin-top:4px;font-size:11.5px;color:var(--dim)}
.bar2{flex:0 0 46px;height:4px;border-radius:3px;background:var(--line);overflow:hidden}
.bar2 i{display:block;height:100%;background:var(--b2);border-radius:3px}
.qa.lo+.qm .bar2 i{background:var(--warn)}
.pct{font-variant-numeric:tabular-nums}
.agr{margin-left:auto}
.agr.lo{color:var(--warn)}
.lo{color:var(--warn)}
.tog,.tog2{cursor:pointer;font-size:12px;color:var(--dim);background:none;border:none;padding:0;text-decoration:underline}
.tog2{margin-left:9px}
@media(max-width:640px){.wrap{padding:18px 16px 60px}.count{margin-left:0;width:100%}}
"""

JS = r"""
const D=DATA, box=document.getElementById('list');
const f={fighter:'',bucket:'',speaker:'',q:''};
function render(){
  const out=D.filter(r=>
    (!f.fighter||r.f===f.fighter)&&(!f.bucket||String(r.fb)===f.bucket)&&
    (!f.speaker||r.ans.whose_judgement[0]===f.speaker)&&
    (!f.q||(r.t+' '+r.o+' '+r.id).toLowerCase().includes(f.q.toLowerCase())));
  document.getElementById('count').textContent=out.length+' of '+D.length+' articles';
  box.innerHTML=out.map(r=>{
    const moved=r.b!==r.fb?`<span class="flag">speaker rule moved ${r.b}&rarr;${r.fb}</span>`:'';
    const unst=!r.st?'<span class="flag">unstable</span>':'';
    const j=r.judged==='anton'?'<span class="flag">Anton ruled</span>':(r.judged==='fable'?'<span class="flag">spot-checked</span>':'');
    const prod=r.prod?`<span class="why">production: ${r.prod}</span>`:'';
    const why=r.why.replace(/^(\w+) by (\w+)$/,(m,a,b)=>`${(VL[a]||a).toLowerCase()} — by ${(VL[b]||b).toLowerCase()}`)
                   .replace(/^(\w+) \+ (\w+)$/,(m,a,b)=>`${(VL[a]||a).toLowerCase()}, ${(VL[b]||b).toLowerCase()}`)
                   .replace(/^nothing new: (\w+)$/,(m,a)=>`${(VL[a]||a).toLowerCase()}`)
                   .replace(/^(mentioned_only|not_in_the_article_body|background)$/,(m,a)=>`${(VL[a]||a).toLowerCase()}`)
                   .replace(/^he is only backdrop$/,'only backdrop in someone else\u2019s story');
    const qs=Object.entries(r.ans).map(([k,v])=>{
      const pct=Math.round(v[2]*100), weak=v[2]<0.6;
      const agree=v[1]===3?'all 3 runs agreed':(v[1]===2?'2 of 3 runs':'all 3 runs differed');
      return `<div class="q"><div class="qq">${QL[k]||k}</div>
        <div class="qa ${weak?'lo':''}">${esc(VL[v[0]]||v[0])}</div>
        <div class="qm"><span class="bar2"><i style="width:${pct}%"></i></span>
        <span class="pct">${pct}% sure</span><span class="agr ${v[1]<3?'lo':''}">${agree}</span></div></div>`;}).join('');
    const full=Object.entries(r.all).map(([k,opts])=>{
      const rows=opts.map((p,i)=>({name:OPTS[k][i],p:p}))
        .sort((a,b)=>b.p-a.p).map(o=>{
        const win=o.name===r.ans[k][0], hatch=o.name==='not_in_this_list', zero=o.p<0.005;
        return `<div class="orow ${win?'win':''} ${hatch?'hatch':''} ${zero?'zero':''}">
          <span class="oname">${esc(VL[o.name]||o.name)}</span>
          <span class="obar"><i style="width:${Math.round(o.p*100)}%"></i></span>
          <span class="opct">${o.p<0.005?'0':(o.p*100).toFixed(0)}%</span></div>`;}).join('');
      return `<div class="qfull"><div class="qq">${QL[k]||k}</div>${rows}</div>`;}).join('');
    return `<div class="art" data-b="${r.fb}">
      <div class="top"><span class="bdg" data-b="${r.fb}">bucket ${r.fb}</span>
      <span class="ttl">${r.u?`<a href="${r.u}" target="_blank" rel="noopener">${esc(r.t)}</a>`:esc(r.t)}</span></div>
      <div class="meta"><span>#${r.id}</span><span>${r.d}</span><span>${esc(r.f)}</span>
      <span>${esc(r.o)}</span><span class="why">${esc(why)}</span>${prod}${moved}${unst}${j}
      <button class="tog">answers</button><button class="tog2">all options</button></div>
      <div class="ans">${qs}</div><div class="ans2">${full}</div></div>`;}).join('') || '<p style="color:var(--dim)">Nothing matches.</p>';
}
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}
box.addEventListener('click',e=>{
  const c=e.target.classList, art=e.target.closest('.art');
  if(c.contains('tog')){art.classList.remove('open2');art.classList.toggle('open');}
  if(c.contains('tog2')){art.classList.remove('open');art.classList.toggle('open2');}});
['fighter','bucket','speaker'].forEach(k=>document.getElementById(k).addEventListener('change',e=>{f[k]=e.target.value;render()}));
document.getElementById('q').addEventListener('input',e=>{f.q=e.target.value;render()});
render();
"""

def opts(name, vals, lbl):
    o = "".join(f'<option value="{html.escape(str(v))}">{html.escape(str(l))}</option>' for v, l in vals)
    return f'<select id="{name}"><option value="">{lbl}</option>{o}</select>'

n = collections.Counter(r["fb"] for r in rows)
nb = collections.Counter(r["b"] for r in rows)
moved = sum(1 for r in rows if r["b"] != r["fb"])
unstable = sum(1 for r in rows if not r["st"])
fighters = sorted({r["f"] for r in rows})
speakers = [k for k, _ in collections.Counter(r["ans"]["whose_judgement"][0] for r in rows).most_common()]

doc = f"""<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Article Sorting Report</title><style>{CSS}</style></head><body><div class="wrap">
<h1>How 300 articles were sorted</h1>
<p class="sub">Frozen sample, 7 Aug – 17 Sep 2026. Six questions asked of JEV in three option orders,
bucket composed in code, then your speaker ruling applied. Nothing here was posted anywhere —
this is the experiment, not production.</p>
<div class="tiles">
<div class="tile"><div class="n" style="color:var(--b1)">{n[1]}</div><div class="l">bucket 1 — would be posted loudly</div></div>
<div class="tile"><div class="n" style="color:var(--b2)">{n[2]}</div><div class="l">bucket 2 — would go in the digest</div></div>
<div class="tile"><div class="n" style="color:var(--b3)">{n[3]}</div><div class="l">bucket 3 — not sent</div></div>
<div class="tile"><div class="n">{moved}</div><div class="l">moved by your speaker ruling (was {nb[2]} in digest)</div></div>
<div class="tile"><div class="n">{unstable}</div><div class="l">unstable — bucket changed with option order</div></div>
</div>
<div class="bar">
{opts("fighter", [(f,f) for f in fighters], "all fighters")}
{opts("bucket", [("1","bucket 1 — loud"),("2","bucket 2 — digest"),("3","bucket 3 — not sent")], "all buckets")}
{opts("speaker", [(s,s) for s in speakers], "any speaker")}
<input id="q" placeholder="search headline, outlet or id">
<span class="count" id="count"></span></div>
<div id="list"></div>
<p class="sub" style="margin-top:26px">Click <b>answers</b> on any article to see all six questions and
what the classifier replied. <b>&ldquo;3 runs&rdquo;</b> means the same 300 articles were asked three times
with the answer options listed in three different orders &mdash; if all three agreed, the answer is about
the article rather than about the layout. Anything below <b>60% sure</b> is marked in amber: that is the
threshold where this model stops changing its mind, so under it the answer should not be relied on.
Click <b>all options</b> instead to see every option the classifier could have picked and what share each
one got, averaged over the three runs &mdash; including the options that scored nothing, shown faded.
Those shares add up to 100% &mdash; so an option only gains
by taking from another. The italic <i>&ldquo;None of the options fitted&rdquo;</i> row is the escape hatch:
when it carries real weight, the list is missing an answer.</p>
</div><script>const DATA={json.dumps(rows, ensure_ascii=False)},QL={json.dumps(QLABEL)},VL={json.dumps(VLABEL)},OPTS={json.dumps(OPTS)};{JS}</script></body></html>"""
open("REPORT.html", "w").write(doc)
print(f"wrote REPORT.html  ({len(doc)/1024:.0f} KB, {len(rows)} articles)")
print(f"  buckets after your ruling: 1={n[1]}  2={n[2]}  3={n[3]}")
