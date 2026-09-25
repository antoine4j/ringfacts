"""Build the review board: one page over the golden set, grouped by claim.

Self-contained HTML, data embedded, no server, no network, no model calls.
Reads only golden/. Regenerate any time with `python3 golden/board/build.py`.
Writes nothing but board.html; rulings still go to golden/verdicts.md by hand.
"""
import json, re, os, html, collections

HERE = os.path.dirname(os.path.abspath(__file__))
G = os.path.join(HERE, "..")
load = lambda name: json.load(open(os.path.join(G, name)))

arts = {str(r["id"]): r for r in load("articles.json")}
claims = load("claims.json")["claims"]
classifier = load("answers/classifier.json")["articles"]
extractor = load("answers/extractor.json")["articles"]

# --- Anton's rulings: heading per claim, and the verbatim text under it ------
rulings = {}
current = None
for line in open(os.path.join(G, "verdicts.md")):
    m = re.match(r"## (\d{4}-\d{2}-\d{2}) — (?:story|claim)-([\d.]+)[^:]*: (.+)$", line.strip())
    if m:
        current = "claim-" + m.group(2)
        rulings[current] = {"date": m.group(1), "what": m.group(3).strip(), "text": ""}
    elif current and not line.startswith("# "):
        rulings[current]["text"] += line
for r in rulings.values():
    r["text"] = r["text"].strip()

def ruling_for(key):
    """A claim split at rebuild (claim-015.0) carries its parent's ruling."""
    return rulings.get(key) or rulings.get(key.split(".")[0])

# --- pre-flags: what the data alone can say, shown as "suspected" ------------
SURNAMES = {
    "Ilia Topuria": ["topuria", "топурия", "топурія", "topuría"],
    "Daniil Donchenko": ["donchenko", "донченко"],
    "Yaroslav Amosov": ["amosov", "амосов"],
}
def norm(s):
    return re.sub(r"\s+", " ", (s or "")).strip().lower()

by_body = collections.defaultdict(list)
for a, r in arts.items():
    if len(norm(r.get("body"))) > 200:
        by_body[norm(r.get("body"))].append(a)

flags = {}
for a, r in arts.items():
    body = norm(r.get("body"))
    f = []
    if len(body) < 300:
        f.append("body under 300 chars")
    names = SURNAMES.get(r["subject"], [r["subject"].split()[-1].lower()])
    if body and not any(n in body for n in names):
        f.append("subject not in body")
    copies = [b for b in by_body.get(body, []) if b != a]
    if copies:
        f.append("exact copy of #" + ", #".join(sorted(copies, key=int)))
    if f:
        flags[a] = f

# --- rows -------------------------------------------------------------------
def card(a):
    r = arts[a]
    ex = extractor.get(a, {})
    cl = classifier.get(a, {})
    return {
        "id": a, "d": str(r["published_at"])[:10], "f": r["subject"], "o": r["source"],
        "t": r["title"], "u": r.get("url") or "", "body": r.get("body") or "",
        "chars": len(r.get("body") or ""),
        "ex": {k: ex.get(k) for k in ("kind", "claim", "occasion", "actor", "opponent", "event", "date", "error")},
        "bucket": cl.get("bucket"),
        "ans": cl.get("answers", {}),
        "flags": flags.get(a, []),
    }

out = []
for c in claims:
    cards = [card(a) for a in c["articles"]]
    cards.sort(key=lambda x: (x["d"], int(x["id"])))
    ru = ruling_for(c["key"])
    out.append({
        "key": c["key"], "f": c["fighter"], "n": len(cards),
        "oldest": cards[0]["d"], "newest": cards[-1]["d"],
        "desc": c["descriptions"], "from": c.get("from"),
        "fable": c["fable"], "ruled": ru, "cards": cards,
        "flagged": any(x["flags"] for x in cards),
        "kinds": sorted({x["ex"]["kind"] for x in cards if x["ex"]["kind"]}),
        "buckets": sorted({x["bucket"] for x in cards if x["bucket"]}),
    })
out.sort(key=lambda s: (s["newest"], s["key"]), reverse=True)   # newest claim first; the fighter filter does the rest

n_multi = sum(1 for s in out if s["n"] > 1)
n_ruled = sum(1 for s in out if s["ruled"])
n_doubt = sum(1 for s in out if s["fable"]["pass1_doubts"])
n_flag = sum(1 for s in out if s["flagged"])

KLABEL = {
    "new_event": "A new event", "new_remark": "Somebody said something new",
    "reaction": "A reaction to earlier news", "analysis": "A writer’s own verdict",
    "restatement": "Restates known news", "about_someone_else": "About someone else",
    "no_text": "No usable text",
}
QLABEL = {
    "role": "role", "whose_judgement": "whose judgement", "what_is_done": "what is done",
    "news_kind": "news kind", "sourcing": "sourcing", "novelty": "novelty",
}

CSS = """
:root{--bg:#fbfaf8;--fg:#1a1917;--dim:#6b6762;--line:#e4e0da;--card:#fff;--soft:#f2f0ed;
--cls:#1d4ed8;--clsbg:#eef2ff;--ext:#6d28d9;--extbg:#f3eeff;--warn:#a16207;--warnbg:#fdf3d7;
--ok:#15803d;--okbg:#eaf7ee;--bad:#b91c1c;--badbg:#fdeaea}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#171614;--fg:#eceae6;--dim:#9a948c;--line:#302d29;--card:#1f1e1b;--soft:#27251f;
--cls:#93b4fd;--clsbg:#1b2440;--ext:#c4b5fd;--extbg:#2a2140;--warn:#d9a441;--warnbg:#3a2e12;--ok:#4ade80;--okbg:#14301d;--bad:#f87171;--badbg:#3a1616}}
:root[data-theme=dark]{--bg:#171614;--fg:#eceae6;--dim:#9a948c;--line:#302d29;--card:#1f1e1b;--soft:#27251f;
--cls:#93b4fd;--clsbg:#1b2440;--ext:#c4b5fd;--extbg:#2a2140;--warn:#d9a441;--warnbg:#3a2e12;--ok:#4ade80;--okbg:#14301d;--bad:#f87171;--badbg:#3a1616}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 ui-sans-serif,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:24px 16px 80px}
h1{font-size:22px;margin:0 0 4px}
.sub{color:var(--dim);font-size:13.5px;margin-bottom:18px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:16px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:9px;padding:11px 13px}
.tile .n{font-size:24px;font-weight:600;font-variant-numeric:tabular-nums}
.tile .l{color:var(--dim);font-size:12px}
.bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px;background:var(--card);border:1px solid var(--line);border-radius:9px;padding:10px 12px;position:sticky;top:0;z-index:2}
select,input[type=search]{font:inherit;font-size:13.5px;padding:6px 9px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg)}
label.ck{font-size:13.5px;display:inline-flex;gap:5px;align-items:center;color:var(--dim)}
.bar .cnt{margin-left:auto;color:var(--dim);font-size:13px}
.bar button{font:inherit;font-size:13px;padding:5px 9px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg);cursor:pointer}
details.claim{background:var(--card);border:1px solid var(--line);border-radius:10px;margin-bottom:10px}
details.claim>summary{list-style:none;cursor:pointer;padding:11px 14px;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
details.claim>summary::-webkit-details-marker{display:none}
details.claim>summary .key{font-family:ui-monospace,Menlo,monospace;font-size:13px;color:var(--dim)}
details.claim>summary .desc{flex:1 1 400px;font-weight:500}
details.claim>summary .meta{color:var(--dim);font-size:13px;white-space:nowrap}
.chip{display:inline-block;font-size:12px;line-height:1.3;padding:2px 8px;border-radius:999px;background:var(--soft);color:var(--dim);white-space:nowrap}
.chip.ok{background:var(--okbg);color:var(--ok)}.chip.warn{background:var(--warnbg);color:var(--warn)}
.chip.bad{background:var(--badbg);color:var(--bad)}
.chip.cls{background:var(--clsbg);color:var(--cls)}.chip.ext{background:var(--extbg);color:var(--ext)}
.chip b{font-weight:600}
.inner{padding:0 14px 12px;border-top:1px solid var(--line)}
.block{margin:10px 0;padding:9px 12px;border-radius:8px;background:var(--soft);font-size:14px}
.block h4{margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--dim)}
.block.rule{background:var(--okbg)}.block.fable{background:var(--soft)}
.block pre{white-space:pre-wrap;font:inherit;margin:0}
.card{border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin:8px 0;background:var(--bg)}
.card .head{display:flex;gap:8px;flex-wrap:wrap;align-items:baseline;font-size:13px;color:var(--dim)}
.card .head .id{font-family:ui-monospace,Menlo,monospace}
.card .title{font-weight:500;margin:3px 0 6px}
.card .title a{color:inherit;text-decoration:none}.card .title a:hover{text-decoration:underline}
.row{display:flex;gap:6px;flex-wrap:wrap;margin:4px 0}
.row .lab{font-size:11px;color:var(--dim);text-transform:uppercase;letter-spacing:.04em;align-self:center;min-width:64px}
.extract{margin:5px 0 3px;font-size:14px}
.extract b{color:var(--ext)}
details.body summary{cursor:pointer;font-size:12.5px;color:var(--dim);margin-top:6px}
details.body pre{white-space:pre-wrap;font:13.5px/1.5 inherit;margin:6px 0 0;padding:10px;border-radius:6px;background:var(--soft);max-height:420px;overflow:auto}
.hide{display:none}
@media(max-width:640px){details.claim>summary .meta{white-space:normal}}
"""

JS = r"""
const $=s=>document.querySelector(s), esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const human=s=>String(s??"").replace(/_/g," ");
const md=s=>esc(s).replace(/\*\*(.+?)\*\*/g,"<b>$1</b>").replace(/&lt;(https?:[^&]+)&gt;/g,'<a href="$1" target="_blank" rel="noopener">$1</a>');
function chips(c){
  const ans=c.ans||{}, out=[];
  for(const q of Object.keys(QL)){ const a=ans[q]; if(!a) continue;
    out.push(`<span class="chip cls" title="${esc(QL[q])} · ${a.agree} of 3 readers agree · confidence ${a.conf}">${esc(QL[q])}: <b>${esc(human(a.choice))}</b> ${a.agree<3?`<span style="opacity:.7">${a.agree}/3</span>`:""}</span>`);}
  return out.join("");
}
function exchips(e){
  const out=[]; const f=(k,v)=>{ if(v) out.push(`<span class="chip ext">${k}: <b>${esc(v)}</b></span>`); };
  f("occasion",e.occasion); f("actor",e.actor); f("opponent",e.opponent); f("event",e.event); f("date",e.date); if(e.error) f("error",e.error);
  return out.join("");
}
function card(c){
  return `<div class="card" id="a${c.id}">
    <div class="head"><span class="id">#${c.id}</span><span>${c.d}</span><span>${esc(c.o)}</span><span>${c.chars} chars</span>
      ${c.bucket?`<span class="chip cls">bucket ${c.bucket}</span>`:""}
      ${c.flags.map(f=>`<span class="chip warn">suspected: ${esc(f)}</span>`).join("")}</div>
    <div class="title">${c.u?`<a href="${esc(c.u)}" target="_blank" rel="noopener">${esc(c.t)}</a>`:esc(c.t)}</div>
    <div class="row"><span class="lab">extractor</span><span class="chip ext">kind: <b>${esc(KL[c.ex.kind]||c.ex.kind||"—")}</b></span>${exchips(c.ex)}</div>
    ${c.ex.claim?`<div class="extract"><b>extract</b> — ${esc(c.ex.claim)}</div>`:""}
    <div class="row"><span class="lab">classifier</span>${chips(c)}</div>
    <details class="body"><summary>body</summary><pre>${esc(c.body||"(empty)")}</pre></details>
  </div>`;
}
function claim(s){
  const fb=s.fable, r=s.ruled;
  const hdr=[`<span class="key">${s.key}</span>`,`<span class="desc">${esc(s.desc[0]||"")}</span>`,
    `<span class="meta">${esc(s.f.split(" ").pop())} · ${s.n} article${s.n>1?"s":""} · ${s.oldest===s.newest?s.oldest:s.oldest+" → "+s.newest}</span>`,
    r?`<span class="chip ok" title="${esc(r.what)}">ruled ${r.date}</span>`:`<span class="chip">not ruled</span>`,
    fb.pass1_doubts.length?`<span class="chip warn">Fable had doubts</span>`:"",
    fb.pass1_confidence.length&&fb.pass1_confidence.some(x=>x!=="high")?`<span class="chip warn">confidence ${esc(fb.pass1_confidence.join("/"))}</span>`:"",
    s.flagged?`<span class="chip warn">suspected body issue</span>`:"", s.from?`<span class="chip">rebuilt from ${esc(s.from.join(", "))}</span>`:""].join("");
  const inner=[];
  if(s.desc.length>1) inner.push(`<div class="block"><h4>Fable's descriptions</h4>${s.desc.map(d=>`<div>· ${esc(d)}</div>`).join("")}</div>`);
  if(fb.pass1_doubts.length||fb.pass2_split_candidate) inner.push(`<div class="block fable"><h4>Fable's doubts while grouping</h4>${fb.pass1_doubts.map(d=>`<div>· ${esc(d)}</div>`).join("")}${fb.pass2_split_candidate?`<div>· split candidate: ${esc(JSON.stringify(fb.pass2_split_candidate))}</div>`:""}</div>`);
  if(r) inner.push(`<div class="block rule"><h4>Anton's ruling · ${r.date}${s.key.includes(".")?" (parent's)":""}</h4><div><b>${esc(r.what)}</b></div>${r.text?`<pre>${md(r.text)}</pre>`:""}</div>`);
  inner.push(s.cards.map(card).join(""));
  return `<details class="claim" data-key="${s.key}"><summary>${hdr}</summary><div class="inner">${inner.join("")}</div></details>`;
}
function render(){
  const f=$("#f").value, k=$("#k").value, b=$("#b").value, q=$("#q").value.trim().toLowerCase();
  const single=$("#single").checked, doubt=$("#doubt").checked, unruled=$("#unruled").checked, flagged=$("#flagged").checked;
  let n=0, na=0; const parts=[];
  for(const s of DATA){
    if(f&&s.f!==f) continue; if(k&&!s.kinds.includes(k)) continue; if(b&&!s.buckets.includes(+b)) continue;
    if(single&&s.n!==1) continue; if(doubt&&!s.fable.pass1_doubts.length) continue; if(unruled&&s.ruled) continue; if(flagged&&!s.flagged) continue;
    if(q&&!(s.key.includes(q)||s.cards.some(c=>c.id===q.replace("#","")||c.t.toLowerCase().includes(q)||(c.ex.claim||"").toLowerCase().includes(q)||c.o.toLowerCase().includes(q)))) continue;
    n++; na+=s.n; parts.push(claim(s));
  }
  $("#list").innerHTML=parts.join(""); $("#cnt").textContent=`${n} claims · ${na} articles`;
}
document.querySelectorAll(".bar select:not(#theme),.bar input").forEach(e=>e.addEventListener("input",render));
$("#open").onclick=()=>document.querySelectorAll("details.claim").forEach(d=>d.open=true);
$("#close").onclick=()=>document.querySelectorAll("details.claim").forEach(d=>d.open=false);
// theme: system follows the OS; light or dark is remembered in this browser only
function applyTheme(t){ if(t==="system") document.documentElement.removeAttribute("data-theme"); else document.documentElement.dataset.theme=t; $("#theme").value=t; }
let saved="system"; try{ saved=localStorage.getItem("board-theme")||"system"; }catch(e){}
applyTheme(saved);
$("#theme").addEventListener("input",e=>{ applyTheme(e.target.value); try{ localStorage.setItem("board-theme",e.target.value); }catch(err){} });
render();
if(location.hash){const el=document.querySelector(location.hash); if(el){el.closest("details.claim").open=true; el.scrollIntoView();}}
"""

fighters = sorted({s["f"] for s in out})
kinds = sorted({k for s in out for k in s["kinds"]})
opts = lambda xs, lab=lambda x: x: "".join(f'<option value="{html.escape(str(x))}">{html.escape(lab(x))}</option>' for x in xs)

page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Golden Review Board</title><style>{CSS}</style></head><body><div class="wrap">
<h1>Golden set · review board</h1>
<div class="sub">300 articles in {len(out)} claims (ruler v3). One claim = one occasion. Blue chips are the classifier's answers, purple the extractor's.
Yellow "suspected" chips are what the data alone suggests, not labels, until ruled. Rulings go to <code>golden/verdicts.md</code>; this page only shows them.</div>
<div class="tiles">
<div class="tile"><div class="n">{len(out)}</div><div class="l">claims</div></div>
<div class="tile"><div class="n">{n_multi}</div><div class="l">with 2+ articles</div></div>
<div class="tile"><div class="n">{len(out)-n_multi}</div><div class="l">singletons</div></div>
<div class="tile"><div class="n">{n_ruled}</div><div class="l">ruled by Anton</div></div>
<div class="tile"><div class="n">{n_doubt}</div><div class="l">Fable had doubts</div></div>
<div class="tile"><div class="n">{n_flag}</div><div class="l">suspected body issue</div></div>
</div>
<div class="bar">
<select id="f"><option value="">all fighters</option>{opts(fighters)}</select>
<select id="k"><option value="">any kind</option>{opts(kinds, lambda k: KLABEL.get(k, k))}</select>
<select id="b"><option value="">any bucket</option>{opts([1,2,3], lambda b: f"bucket {b}")}</select>
<label class="ck"><input type="checkbox" id="single">singletons</label>
<label class="ck"><input type="checkbox" id="doubt">Fable had doubts</label>
<label class="ck"><input type="checkbox" id="unruled">not ruled</label>
<label class="ck"><input type="checkbox" id="flagged">suspected body issue</label>
<input type="search" id="q" placeholder="#id, headline, extract, outlet">
<button id="open">open all</button><button id="close">close all</button>
<select id="theme" title="theme"><option value="system">system theme</option><option value="light">light</option><option value="dark">dark</option></select>
<span class="cnt" id="cnt"></span>
</div>
<div id="list"></div>
</div><script>const DATA={json.dumps(out, ensure_ascii=False)},KL={json.dumps(KLABEL)},QL={json.dumps(QLABEL)};{JS}</script></body></html>"""

open(os.path.join(HERE, "board.html"), "w").write(page)
print(f"board.html: {len(page)//1024} KB, {len(out)} claims, {n_ruled} ruled, {n_doubt} with doubts, {n_flag} flagged")
print("flags:", collections.Counter(f.split(" of ")[0] for fs in flags.values() for f in fs))
