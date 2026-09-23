"""Build a browsable HTML report of what the extractor pulled from all 300 articles.

Self-contained: data is embedded, no server, no network, no model calls.
Regenerate any time with `python3 report.py`. Reads the candidate pass (4)
and its byte-identical replicate (5) so every re-worded claim is flagged.
"""
import json, collections, html, re

HERE  = __import__("os").path.dirname(__import__("os").path.abspath(__file__))
arts  = {str(r["id"]): r for r in json.load(open(f"{HERE}/../2026-09-17-role-questions/data/articles.json"))}
P4    = {c["id"]: c for c in json.load(open(f"{HERE}/claims-p4.json"))}
P5    = {c["id"]: c for c in json.load(open(f"{HERE}/claims-p5.json"))}
CL    = json.load(open(f"{HERE}/clusters.json"))
ruler = CL["clusters"]
doubt = collections.defaultdict(list)       # article id -> the ruler's own low-confidence pair rulings naming it
for d in CL.get("low_confidence_rulings", []):
    for a, other in ((d["a"], d["b"]), (d["b"], d["a"])):
        doubt[a].append({"other": other, "ruling": d["ruling"], "why": d["why"]})

# Anton's rulings, parsed from verdicts.md headings of the form
#   ## 2026-09-22 — story-125 (#a, #b): the grouping is right
ruled = {}
for line in open(f"{HERE}/verdicts.md"):
    m = re.match(r"## (\d{4}-\d{2}-\d{2}) — (story-[\d.]+)[^:]*: (.+)$", line.strip())
    if m: ruled[m.group(2)] = {"d": m.group(1), "what": m.group(3).strip()}

KLABEL = {
 "new_event":          "A new event",
 "new_remark":         "Somebody said something new",
 "reaction":           "A reaction to earlier news",
 "analysis":           "A writer’s own verdict",
 "restatement":        "Restates known news",
 "about_someone_else": "About someone else",
 "no_text":            "No usable text",
}
LEAD = 1500     # what production embeds after the headline (hunter.js)
SHOW = 320      # how much of that lead the tile shows before "…"

story_of, story_desc = {}, {}
for c in ruler:
    for a in c["articles"]: story_of[a] = c["key"]
    story_desc[c["key"]] = c["descriptions"][0] if c["descriptions"] else ""

def clean(s):
    return re.sub(r"\s+", " ", s or "").strip()

rows = []
for a in sorted(arts, key=lambda x: arts[x]["published_at"], reverse=True):
    r, c4, c5 = arts[a], P4[a], P5[a]
    lead = clean(r.get("body") or "")[:LEAD]
    rows.append({
        "id": a, "d": str(r["published_at"])[:10], "f": r["subject"], "o": r["source"],
        "t": r["title"], "u": r.get("url") or "", "chars": len(r.get("body") or ""),
        "lead": lead[:SHOW] + ("…" if len(lead) > SHOW else ""),
        "kind": c4["kind"], "claim": c4["claim"] or "", "occ": c4.get("occasion") or "",
        "actor": c4.get("actor") or "", "opp": c4.get("opponent") or "",
        "event": c4.get("event") or "", "date": c4.get("date") or "",
        "rew": (c4["claim"] or "") != (c5["claim"] or ""),
        "kflip": c4["kind"] != c5["kind"],
        "claim5": c5["claim"] or "", "kind5": c5["kind"],
        "story": story_of.get(a, ""),
        "doubt": doubt.get(a, []),
    })

# Where the extractor and the ruler disagree. The extractor's view of "same
# story" is the cosine of its own text (claim + occasion, arm 3o, pass 4) at
# that arm's best single threshold on the ruler's pairs; the ruler's view is
# the cluster. A same-story pair below the threshold is a split the extractor
# would make; a different-story pair above it is a merge it would make. Only
# pairs dedup actually faces are counted: same fighter, within 3 days.
import os, sys; sys.path.insert(0, HERE); import score
VARM = "3o-p4"
vec = {}
for a in arts:
    fp = f"{HERE}/emb-cache/{VARM}/{a}.json"
    if os.path.exists(fp): vec[a] = json.load(open(fp))
same, diff = score.pairs(ruler)
same = [(a, b) for a, b in same if a in vec and b in vec]
diff = [(a, b) for a, b in diff if a in vec and b in vec]
sim = {pr: score.cos(vec[pr[0]], vec[pr[1]]) for pr in same + diff}
THR = min((sum(sim[pr] < t for pr in same) + sum(sim[pr] >= t for pr in diff), t)
          for t in [x / 100 for x in range(60, 99)])[1]
dis = collections.defaultdict(lambda: {"split": [], "merge": [], "pairs": 0})
for a, b in same: dis[story_of[a]]["pairs"] += 1
for a, b in same:
    if sim[(a, b)] < THR: dis[story_of[a]]["split"].append([a, b, round(sim[(a, b)], 2)])
for a, b in diff:
    if sim[(a, b)] >= THR:
        dis[story_of[a]]["merge"].append([a, b, story_of[b], round(sim[(a, b)], 2)])
        dis[story_of[b]]["merge"].append([b, a, story_of[a], round(sim[(a, b)], 2)])

stories = [{"key": c["key"], "dis": (dis[c["key"]] if c["key"] in dis and (dis[c["key"]]["split"] or dis[c["key"]]["merge"]) else None), "desc": story_desc[c["key"]], "n": len(c["articles"]), "ruled": ruled.get(c["key"]),
            "newest": max(str(arts[a]["published_at"])[:10] for a in c["articles"])} for c in ruler]
stories.sort(key=lambda s: s["newest"], reverse=True)

CSS = """
:root{--bg:#fbfaf8;--fg:#1a1917;--dim:#6b6762;--line:#e4e0da;--card:#fff;
--ev:#c2410c;--evbg:#fff1e9;--rm:#1d4ed8;--rmbg:#eef2ff;--an:#6d28d9;--anbg:#f3eeff;
--no:#6b6762;--nobg:#f2f0ed;--warn:#a16207;--ok:#15803d;--okbg:#eaf7ee}
:root:not([data-theme=light]){@media(prefers-color-scheme:dark){
:root{--bg:#171614;--fg:#eceae6;--dim:#9a948c;--line:#302d29;--card:#1f1e1b;
--ev:#fb923c;--evbg:#3a2314;--rm:#93b4fd;--rmbg:#1b2440;--an:#c4b5fd;--anbg:#2a2140;
--no:#9a948c;--nobg:#27251f;--warn:#d9a441;--ok:#4ade80;--okbg:#14301d}}}
:root[data-theme=dark]{--bg:#171614;--fg:#eceae6;--dim:#9a948c;--line:#302d29;--card:#1f1e1b;
--ev:#fb923c;--evbg:#3a2314;--rm:#93b4fd;--rmbg:#1b2440;--an:#c4b5fd;--anbg:#2a2140;
--no:#9a948c;--nobg:#27251f;--warn:#d9a441;--ok:#4ade80;--okbg:#14301d}
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
.story{margin:22px 0 8px;padding-bottom:5px;border-bottom:1px solid var(--line);
display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
.story{cursor:pointer;user-select:none;position:sticky;top:0;background:var(--bg);z-index:1;padding-top:6px}
.story .car{font-size:12px;color:var(--dim);width:12px;flex:0 0 12px}
.story .k{font-size:13px;font-weight:700;color:var(--fg);font-variant-numeric:tabular-nums;white-space:nowrap;
background:var(--card);border:1px solid var(--line);border-radius:5px;padding:1px 7px}
.story.shut .sd{color:var(--dim);font-weight:400}
.theme{font:inherit;font-size:12.5px;padding:6px 10px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg);cursor:pointer;margin-left:6px}
.btn{font:inherit;font-size:12.5px;padding:6px 10px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg);cursor:pointer}
.story .sd{font-size:13.5px;font-weight:500;flex:1;min-width:240px}
.story .sn{font-size:12px;color:var(--dim);white-space:nowrap}
.story.isruled{border-bottom-color:var(--ok)}
.dis{font-size:11.5px;font-weight:600;color:var(--warn);white-space:nowrap}
.disl{font-size:12px;color:var(--dim);margin:-4px 0 8px 22px}
.ruled{font-size:11.5px;font-weight:600;color:var(--ok);background:var(--okbg);padding:2px 8px;border-radius:20px;white-space:nowrap}
.art{background:var(--card);border:1px solid var(--line);border-left-width:3px;border-radius:8px;
padding:11px 13px;margin-bottom:7px}
.art[data-k="new_event"]{border-left-color:var(--ev)} .art[data-k="new_remark"],.art[data-k="reaction"]{border-left-color:var(--rm)}
.art[data-k="analysis"]{border-left-color:var(--an)} .art[data-k="restatement"],.art[data-k="about_someone_else"],.art[data-k="no_text"]{border-left-color:var(--no)}
.top{display:flex;gap:9px;align-items:baseline;flex-wrap:wrap}
.bdg{font-size:11px;font-weight:600;padding:2px 7px;border-radius:20px;white-space:nowrap}
.bdg[data-k="new_event"]{background:var(--evbg);color:var(--ev)}
.bdg[data-k="new_remark"],.bdg[data-k="reaction"]{background:var(--rmbg);color:var(--rm)}
.bdg[data-k="analysis"]{background:var(--anbg);color:var(--an)}
.bdg[data-k="restatement"],.bdg[data-k="about_someone_else"],.bdg[data-k="no_text"]{background:var(--nobg);color:var(--no)}
.ttl{font-weight:500;flex:1;min-width:230px}
.ttl a{color:inherit;text-decoration:none} .ttl a:hover{text-decoration:underline}
.meta{color:var(--dim);font-size:12.5px;margin-top:4px;display:flex;gap:9px;flex-wrap:wrap;align-items:center}
.flag{color:var(--warn);font-size:11.5px;font-weight:600}
.two{display:grid;grid-template-columns:1fr 1fr;gap:10px 26px;margin-top:9px}
@media(max-width:760px){.two{grid-template-columns:1fr}}
.lbl{font-size:11.5px;color:var(--dim);text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px}
.lead{font-size:13px;color:var(--dim);line-height:1.45}
.claim{font-size:14.5px;line-height:1.4}
.claim.none{color:var(--dim);font-style:italic}
.occ{font-size:12.5px;color:var(--dim);margin-top:4px}
.fields{font-size:12px;color:var(--dim);margin-top:6px;display:flex;gap:12px;flex-wrap:wrap}
.fields b{color:var(--fg);font-weight:500}
.doubt{margin-top:8px;padding:7px 9px;border-radius:6px;background:var(--nobg);font-size:12.5px;line-height:1.4}
.doubt .why{color:var(--dim);font-style:italic}
.rep{display:none;margin-top:8px;padding-top:8px;border-top:1px dashed var(--line);font-size:13px;color:var(--dim)}
.art.open .rep{display:block}
.tog{cursor:pointer;font-size:12px;color:var(--dim);background:none;border:none;padding:0;text-decoration:underline}
@media(max-width:640px){.wrap{padding:18px 16px 60px}.count{margin-left:0;width:100%}}
"""

JS = r"""
const D=DATA, S=STORIES, box=document.getElementById('list');
const f={fighter:'',kind:'',flag:'',group:'story',q:''};
function keep(r){
  return (!f.fighter||r.f===f.fighter)&&(!f.kind||r.kind===f.kind)&&
    (f.flag!=='rew'||r.rew)&&(f.flag!=='kflip'||r.kflip)&&(f.flag!=='none'||!r.claim)&&
    (f.flag!=='multi'||S_N[r.story]>1)&&(f.flag!=='date'||r.date)&&(f.flag!=='doubt'||r.doubt.length)&&(f.flag!=='ruled'||S_R[r.story])&&(f.flag!=='dis'||S_D[r.story])&&(f.flag!=='unruled'||!S_R[r.story])&&
    (!f.q||(r.t+' '+r.o+' '+r.id+' '+r.claim+' '+r.occ).toLowerCase().includes(f.q.toLowerCase()));}
const S_N={}; S.forEach(s=>S_N[s.key]=s.n);
const S_OF={}; D.forEach(r=>S_OF[r.id]=r.story);
const S_R={}; S.forEach(s=>S_R[s.key]=!!s.ruled);
const S_D={}; S.forEach(s=>S_D[s.key]=!!s.dis);
const collapsed=new Set();
function tile(r){
  const rew=r.rew?'<span class="flag">worded differently on a second run</span>':'';
  const kf=r.kflip?`<span class="flag">kind changed on a second run (${esc(KL[r.kind5]||r.kind5)})</span>`:'';
  const claim=r.claim?`<div class="claim">${esc(r.claim)}</div>`:'<div class="claim none">NO CLAIM</div>';
  const occ=r.occ?`<div class="occ">where / when: ${esc(r.occ)}</div>`:'';
  const fl=[['actor',r.actor],['opponent',r.opp],['event',r.event],['date',r.date]].filter(x=>x[1])
    .map(x=>`<span>${x[0]} <b>${esc(x[1])}</b></span>`).join('');
  const db=r.doubt.length?r.doubt.map(d=>`<div class="doubt"><span class="flag">ruler was unsure</span> — ruled <b>${d.ruling}</b> from #${d.other}${S_OF[d.other]&&S_OF[d.other]!==r.story?` (${esc(S_OF[d.other])})`:''}: <span class="why">${esc(d.why)}</span></div>`).join(''):'';
  const rep=r.rew?`<div class="rep">second run, same input, said: ${r.claim5?esc(r.claim5):'<i>NO CLAIM</i>'}</div>`:'';
  return `<div class="art" data-k="${r.kind}">
    <div class="top"><span class="bdg" data-k="${r.kind}">${esc(KL[r.kind]||r.kind)}</span>
    <span class="ttl">${r.u?`<a href="${r.u}" target="_blank" rel="noopener">${esc(r.t)}</a>`:esc(r.t)}</span></div>
    <div class="meta"><span>#${r.id}</span><span>${r.d}</span><span>${esc(r.f)}</span><span>${esc(r.o)}</span>
    <span>${r.chars.toLocaleString()} chars</span>${rew}${kf}${r.rew?'<button class="tog">compare second run</button>':''}</div>
    <div class="two"><div><div class="lbl">what production embeds (headline + first 1,500 chars)</div>
    <div class="lead">${esc(r.lead)||'<i>no body</i>'}</div></div>
    <div><div class="lbl">what the extractor returned</div>${claim}${occ}<div class="fields">${fl}</div></div></div>${db}${rep}</div>`;}
function render(){
  const out=D.filter(keep); let h='';
  if(f.group==='story'){
    const by={}; out.forEach(r=>(by[r.story]=by[r.story]||[]).push(r));
    S.forEach(s=>{const rs=by[s.key]; if(!rs) return; const open=!collapsed.has(s.key);
      const dz=s.dis?`<span class="dis">extractor disagrees${s.dis.split.length?` · would split: ${s.dis.split.length} of ${s.dis.pairs} pairs apart (${Math.round(100*s.dis.split.length/s.dis.pairs)}%)`:''}${s.dis.merge.length?` · would merge with ${[...new Set(s.dis.merge.map(m=>m[2]))].join(', ')}`:''}</span>`:'';
      const items=s.dis?s.dis.split.slice().sort((a,b)=>a[2]-b[2]).map(x=>`apart #${x[0]} \u2194 #${x[1]} at ${x[2]}`).concat(s.dis.merge.slice().sort((a,b)=>b[3]-a[3]).map(x=>`together #${x[0]} \u2194 #${x[1]} (${x[2]}) at ${x[3]}`)):[];
      const dl=s.dis&&open?`<div class="disl">${items.slice(0,10).join(' &middot; ')}${items.length>10?` &middot; +${items.length-10} more`:''}</div>`:'';
      const rb=s.ruled?`<span class="ruled" title="${esc(s.ruled.what)}">Anton ruled: ${esc(s.ruled.what)} · ${s.ruled.d}</span>`:'';
      h+=`<section class="sgrp"><div class="story ${s.ruled?'isruled':''} ${open?'':'shut'}" data-key="${esc(s.key)}"><span class="car">${open?'\u25BE':'\u25B8'}</span><span class="k">${esc(s.key)}</span><span class="sd">${esc(s.desc)}</span>${rb}${dz}
          <span class="sn">${s.n} article${s.n>1?'s':''} in the ruler${rs.length<s.n?', '+rs.length+' shown':''}</span></div>${dl}`;
      if(open) h+=rs.slice().sort((a,b)=>a.d<b.d?-1:1).map(tile).join('');
      h+=`</section>`;});
  } else h=out.map(tile).join('');
  document.getElementById('count').textContent=out.length+' of '+D.length+' articles';
  box.innerHTML=h||'<p style="color:var(--dim)">Nothing matches.</p>';}
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}
box.addEventListener('click',e=>{
  if(e.target.classList.contains('tog')){e.target.closest('.art').classList.toggle('open');return;}
  const st=e.target.closest('.story'); if(st&&!e.target.closest('a')){const k=st.dataset.key; collapsed.has(k)?collapsed.delete(k):collapsed.add(k); render();}});
document.getElementById('shut').addEventListener('click',()=>{S.forEach(s=>collapsed.add(s.key));render()});
document.getElementById('openall').addEventListener('click',()=>{collapsed.clear();render()});
['fighter','kind','flag','group'].forEach(k=>document.getElementById(k).addEventListener('change',e=>{f[k]=e.target.value;render()}));
document.getElementById('q').addEventListener('input',e=>{f.q=e.target.value;render()});
render();
// Theme: auto -> light -> dark, remembered per browser. The stylesheet already
// honours data-theme on <html>; this only sets it.
(function(){const b=document.getElementById('theme'),R=document.documentElement,K='report-theme';
 const L={auto:'\u25D0 auto',light:'\u2600 light',dark:'\u263E dark'};let m='auto';
 try{m=localStorage.getItem(K)||'auto'}catch(e){}
 function ap(){if(m==='auto')R.removeAttribute('data-theme');else R.setAttribute('data-theme',m);b.textContent=L[m];}
 b.addEventListener('click',()=>{m=m==='auto'?'light':m==='light'?'dark':'auto';try{localStorage.setItem(K,m)}catch(e){}ap()});ap();})();
"""

def opts(name, vals, lbl, default=""):
    o = "".join(f'<option value="{html.escape(str(v))}"{" selected" if v == default else ""}>{html.escape(str(l))}</option>'
                for v, l in vals)
    return f'<select id="{name}"><option value="">{lbl}</option>{o}</select>' if not default else \
           f'<select id="{name}">{o}</select>'

kinds = collections.Counter(r["kind"] for r in rows)
rew, kflip = sum(r["rew"] for r in rows), sum(r["kflip"] for r in rows)
occ, dated = sum(1 for r in rows if r["occ"]), sum(1 for r in rows if r["date"])
multi = sum(1 for s in stories if s["n"] > 1)
ndoubt = len(CL.get("low_confidence_rulings", []))
fighters = sorted({r["f"] for r in rows})

doc = f"""<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Claim Extraction Report</title><style>{CSS}</style></head><body><div class="wrap">
<h1>What the extractor pulled from 300 articles</h1>
<p class="sub">Same frozen sample as the classifier. Qwen3.8 Flash read each whole article and returned one
sentence of news, where and when it happened, and what kind of news it is (prompt <code>prompt-p4.md</code>).
Left of each tile is what production embeds today; right is what the extractor returned. Articles are grouped
by the ruler &mdash; the 136 stories a reader built by hand &mdash; so you can see whether the claims inside one story
agree. Nothing here was posted anywhere.</p>
<div class="tiles">
<div class="tile"><div class="n" style="color:var(--ev)">{kinds["new_event"]}</div><div class="l">a new event</div></div>
<div class="tile"><div class="n" style="color:var(--rm)">{kinds["new_remark"] + kinds["reaction"]}</div><div class="l">somebody said something ({kinds["reaction"]} of them reactions)</div></div>
<div class="tile"><div class="n" style="color:var(--an)">{kinds["analysis"]}</div><div class="l">a writer&rsquo;s own verdict</div></div>
<div class="tile"><div class="n" style="color:var(--no)">{kinds["about_someone_else"] + kinds["restatement"] + kinds["no_text"]}</div><div class="l">no claim &mdash; about someone else, restated, or no text</div></div>
<div class="tile"><div class="n">{rew}</div><div class="l">re-worded when run again on identical input ({kflip} changed kind)</div></div>
<div class="tile"><div class="n" style="color:var(--ok)">{len(ruled)} / {multi}</div><div class="l">stories Anton has ruled on, of the {multi} with 2+ articles</div></div>
<div class="tile"><div class="n" style="color:var(--warn)">{sum(1 for k in dis if dis[k]["split"] or dis[k]["merge"])}</div><div class="l">stories where the extractor&rsquo;s own text disagrees with the ruler</div></div>
<div class="tile"><div class="n">{occ} / {dated}</div><div class="l">carry a where-and-when / carry a date</div></div>
</div>
<div class="bar">
{opts("group", [("story","grouped by story"),("date","flat, newest first")], "", default="story")}
{opts("fighter", [(f,f) for f in fighters], "all fighters")}
{opts("kind", [(k, KLABEL[k]) for k, _ in kinds.most_common()], "all kinds")}
{opts("flag", [("multi","only stories with 2+ articles"),("rew","worded differently on a second run"),("kflip","kind changed on a second run"),("none","NO CLAIM"),("date","carries a date"),("doubt","the ruler was unsure about the grouping"),("dis","extractor and ruler disagree"),("ruled","stories Anton has ruled on"),("unruled","stories not yet ruled on")], "everything")}
<input id="q" placeholder="search headline, claim, outlet or id">
<button class="btn" id="shut">collapse all</button><button class="btn" id="openall">expand all</button><button class="theme" id="theme">auto</button>
<span class="count" id="count"></span></div>
<div id="list"></div>
<p class="sub" style="margin-top:26px">Things worth looking for. <b>Inside one story, do the claims say the same thing?</b>
If six previews of one booking read as one claim, dedup can fold them; if a three-part interview reads as three claims,
that is the fact-versus-occasion question in the flesh. <b>Is the where-and-when right?</b> It is the field that separates two
remarks by the same man on different days. <b>&ldquo;Worded differently on a second run&rdquo;</b> means the identical prompt came back
with different words the second time &mdash; harmless when the meaning held, telling when it did not; click
<i>compare second run</i> to compare. The known miss is <b>#817</b>, a next-day column extracted as the result.
<b>The grouping itself is a model’s reading, not yours.</b> Where two articles sit in one story and should not, or in two and
should be one, that is a ruling on the ruler and outranks everything else on this page — every score in the experiment is
measured against it. The ruler flagged its own doubts on {ndoubt} pairs; filter to <i>the ruler was unsure</i> to see them.
<b>&ldquo;Extractor disagrees&rdquo;</b> on a story header means the extractor&rsquo;s own text &mdash; the claim plus
where-and-when, embedded &mdash; would put two of the story&rsquo;s articles apart (a <i>split</i>) or would pull in an
article from another story (a <i>merge</i>), at that text&rsquo;s best single threshold of {THR:.2f} on the pairs dedup
actually faces: same fighter, within three days. It is Qwen&rsquo;s reading against Fable&rsquo;s, neither of them yours;
where they disagree is where your ruling is worth most.
Write rulings in <code>verdicts.md</code> next to this file, and the ruler gets rebuilt and re-scored from them.</p>
</div><script>const DATA={json.dumps(rows, ensure_ascii=False)},STORIES={json.dumps(stories, ensure_ascii=False)},KL={json.dumps(KLABEL)};{JS}</script></body></html>"""
open(f"{HERE}/REPORT.html", "w").write(doc)
print(f"wrote REPORT.html  ({len(doc)/1024:.0f} KB, {len(rows)} articles, {len(stories)} stories, {multi} with 2+ articles)")
print(f"  kinds: " + ", ".join(f"{KLABEL[k]} {n}" for k, n in kinds.most_common()))
print(f"  extractor vs ruler: threshold {THR:.2f}, {len([k for k in dis if dis[k]['split'] or dis[k]['merge']])} stories disagree")
print(f"  worded differently on a second run {rew}, kind flipped {kflip}, occasion filled {occ}, dated {dated}")
