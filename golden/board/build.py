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
EX = load("answers/extractor.json")
extractor = EX["articles"]
QUESTIONS = load("answers/questions.json")["questions"]
V2 = load("answers/classifier-v2.json")
TYPES = load("answers/types-fable.json")
BOUTS = load("answers/bout-prefill.json")["claims"]
PAIRS = load("answers/singleton-pairs.json")["pairs"]

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
        "ex2": ex.get("second_run", {}),
        "bucket": cl.get("bucket"),
        "v2": {q: {"choice": v["choice"], "agree": v["agree"]} for q, v in V2["articles"].get(a, {}).items()},
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
        "type": TYPES["claims"][c["key"]]["type"], "family": TYPES["claims"][c["key"]]["family"],
        "famidx": TYPES["families"].index(TYPES["claims"][c["key"]]["family"]), "bout": BOUTS.get(c["key"]),
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
.tile{background:var(--card);border:1px solid var(--line);border-radius:9px;padding:11px 13px;font:inherit;color:inherit;text-align:left;cursor:pointer}
.tile:hover{border-color:var(--dim)}.tile.on{border-color:var(--cls);background:var(--clsbg)}
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
.chip.type{background:var(--soft);color:var(--fg);border:1px solid var(--line)}
body.label .rule{display:none!important}
body.label .tile[data-set="ruled=1"]{display:none}
.batch{margin:22px 0 8px;padding:8px 12px;border-left:4px solid var(--cls);background:var(--clsbg);border-radius:6px;font-size:14px}
.batch b{display:block}
details.pair>summary{cursor:pointer;color:var(--cls);font-size:13px;margin-top:4px}
.pairbody{margin-top:8px}.batch .k{color:var(--dim);font-size:12.5px}
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
details.more summary{cursor:pointer;font-size:12.5px;color:var(--dim);margin-top:6px}
details.more .q{margin:8px 0 2px;font-size:12.5px}
details.more .q .qn{font-weight:600;color:var(--cls)}
details.more .q .qi{color:var(--dim)}
table.opts{border-collapse:collapse;width:100%;font-size:12.5px;margin:2px 0 6px}
table.opts td{padding:2px 6px;border-top:1px solid var(--line);vertical-align:top}
table.opts td.p{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--dim);width:44px}
table.opts tr.pick td{font-weight:600}
table.opts tr.pick td.p{color:var(--fg)}
table.opts td.name{white-space:nowrap;width:190px}
table.opts .bar{display:inline-block;height:8px;background:var(--clsbg);border-radius:2px;vertical-align:middle;margin-right:4px;padding:0;border:0;position:static}
table.opts tr.pick .bar{background:var(--cls)}
table.opts.ext .bar{background:var(--extbg)}
table.opts.ext tr.pick .bar{background:var(--ext)}
table.opts td.diff{background:var(--warnbg)}
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
function pct(x){ return (x*100).toFixed(0)+"%"; }
function optionTables(c){
  const ans=c.ans||{}; const parts=[];
  for(const q of Object.keys(QL)){ const a=ans[q]; const def=QDEF[q]||{options:{}}; if(!a) continue;
    const names=Object.keys(def.options); for(const r of a.readers||[]) for(const k of Object.keys(r)) if(!names.includes(k)) names.push(k);
    const mean=k=>{const v=(a.readers||[]).map(r=>r[k]??0); return v.length?v.reduce((x,y)=>x+y,0)/v.length:0;};
    names.sort((x,y)=>mean(y)-mean(x));
    parts.push(`<div class="q"><span class="qn">${esc(QL[q])}</span> <span class="qi">${esc(def.instructions||"")}</span></div>
      <table class="opts"><tr><td class="name" style="color:var(--dim)">option</td><td class="p">mean</td>${(a.readers||[]).map((r,i)=>`<td class="p" title="pass ${16+i}: the same questions, option order ${["original","reversed","shuffled"][i]||i+1}">reader ${i+1}</td>`).join("")}<td style="color:var(--dim)">what the option said</td></tr>${names.map(k=>`<tr class="${k===a.choice?"pick":""}"><td class="name"><span class="bar" style="width:${Math.round(mean(k)*60)}px"></span>${esc(human(k))}</td>
        <td class="p" title="mean of the readers">${pct(mean(k))}</td>${(a.readers||[]).map(r=>`<td class="p" title="one reader">${pct(r[k]??0)}</td>`).join("")}
        <td>${esc(def.options[k]||"(not in the question as asked)")}</td></tr>`).join("")}</table>`);
  }
  return `<details class="more"><summary>classifier · every option; mean, then the three readers (one model, three option orders)</summary>${parts.join("")}</details>`;
}
function extractorTables(c){
  const e=c.ex, e2=c.ex2||{};
  const kinds=Object.keys(EXK).map(k=>`<tr class="${k===e.kind?"pick":""}"><td class="name">${esc(KL[k]||k)}<br><span style="color:var(--dim);font-weight:400">${k}</span></td><td>${esc(EXK[k])}</td></tr>`).join("");
  const fields=["kind","claim","occasion","actor","opponent","event","date"].map(k=>{const d=(e[k]??"")!==(e2[k]??""); return `<tr><td class="name">${k==="claim"?"extract":k}<br><span style="color:var(--dim);font-weight:400">${esc(k==="kind"?"decided first":(EXF[k]||"").slice(0,90)+"…")}</span></td><td class="${d?"diff":""}">${esc(e[k]??"—")}</td><td class="${d?"diff":""}">${esc(e2[k]??"—")}</td></tr>`;}).join("");
  return `<details class="more"><summary>extractor · the seven kinds, every field, and the second run</summary>
    <div class="q"><span class="qn" style="color:var(--ext)">kind</span> <span class="qi">${esc(EXF.kind.split("One of:")[0])} The chosen one is bold.</span></div>
    <table class="opts ext">${kinds}</table>
    <div class="q"><span class="qn" style="color:var(--ext)">fields</span> <span class="qi">first run beside the second run of the same prompt, unchanged. Highlighted where they differ: that is where the model was unsure.</span></div>
    <table class="opts ext"><tr><td class="name"></td><td><b>first run</b></td><td><b>second run</b></td></tr>${fields}</table>
    <details class="more"><summary>the prompt's field definitions in full</summary><table class="opts ext">${Object.keys(EXF).map(k=>`<tr><td class="name">${k==="claim"?"extract (field claim)":k}</td><td>${esc(EXF[k])}</td></tr>`).join("")}</table></details>
  </details>`;
}
function card(c){
  return `<div class="card" id="a${c.id}">
    <div class="head"><span class="id">#${c.id}</span><span>${c.d}</span><span>${esc(c.o)}</span><span>${c.chars} chars</span>
      ${c.bucket?`<span class="chip cls rule">tier ${c.bucket}</span>`:""}
      ${c.flags.map(f=>`<span class="chip warn">suspected: ${esc(f)}</span>`).join("")}</div>
    <div class="title">${c.u?`<a href="${esc(c.u)}" target="_blank" rel="noopener">${esc(c.t)}</a>`:esc(c.t)}</div>
    <div class="row"><span class="lab">extractor</span><span class="chip ext">kind: <b>${esc(KL[c.ex.kind]||c.ex.kind||"—")}</b></span>${exchips(c.ex)}</div>
    ${c.ex.claim?`<div class="extract"><b>extract</b> — ${esc(c.ex.claim)}</div>`:""}
    <div class="row"><span class="lab">classifier</span>${chips(c)}</div>
    <div class="row"><span class="lab">v2 questions</span>${Object.entries(c.v2||{}).map(([q,a])=>`<span class="chip cls" title="${q} · ${a.agree} of 3 readers agree">${q}: <b>${esc(human(a.choice))}</b> ${a.agree<3?`<span style="opacity:.7">${a.agree}/3</span>`:""}</span>`).join("")}</div>
    ${optionTables(c)}
    ${extractorTables(c)}
    <details class="body"><summary>body</summary><pre>${esc(c.body||"(empty)")}</pre></details>
  </div>`;
}
function claim(s){
  const fb=s.fable, r=s.ruled;
  const hdr=[`<span class="key">${s.key}</span>`,`<span class="desc">${esc(s.desc[0]||"")}</span>`,
    `<span class="meta">${esc(s.f.split(" ").pop())} · ${s.n} article${s.n>1?"s":""} · ${s.oldest===s.newest?s.oldest:s.oldest+" → "+s.newest}</span>`,
    r?`<span class="chip ok" title="${esc(r.what)}">ruled ${r.date}</span>`:`<span class="chip">not ruled</span>`,
    `<span class="chip type" title="${esc(s.family)}">${esc(s.type)}</span>`, s.bout?`<span class="chip type">bout: ${esc(s.bout)}</span>`:"",
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
  const type=$("#type").value, label=$("#label").checked; document.body.classList.toggle("label",label);
  const size=$("#size").value, doubt=$("#doubt").checked, ruled=$("#ruled").value, flagged=$("#flagged").checked;
  let n=0, na=0; const parts=[]; let last="";
  const week=s=>{const d=new Date(s.oldest); const w=new Date(d); w.setDate(d.getDate()-((d.getDay()+6)%7)); return w.toISOString().slice(0,10);};
  if(label&&!type&&!f&&!k&&!b&&!size&&!doubt&&!ruled&&!flagged&&!q){
    parts.push(`<div class="batch"><b>Singleton pass, first: seven pairs Fable could not call</b><span class="k">for each, is the singleton its own claim or part of the other one? Say the article number and "own" or "joins claim-NNN". Then the suspected body issues (tile above), then the tiers.</span></div>`);
    for(const p of PAIRS){ parts.push(`<div class="card"><div class="head"><span class="id">#${p.article}</span><span class="chip type">${p.claim}</span><span>vs</span>${p.other.map(o=>`<span class="id">#${o}</span>`).join(" ")}${p.other_claims.map(c=>`<span class="chip type">${c}</span>`).join("")}</div><div>${esc(p.why)}</div><details class="pair"><summary>show ${[p.claim,...p.other_claims].join(" and ")} here</summary><div class="pairbody" data-keys="${[p.claim,...p.other_claims].join(",")}"></div></details></div>`); }
  }
  const rows=label?[...DATA].sort((a,b)=>a.famidx-b.famidx||a.type.localeCompare(b.type)||a.f.localeCompare(b.f)||a.oldest.localeCompare(b.oldest)):DATA;
  for(const s of rows){
    if(f&&s.f!==f) continue; if(k&&!s.kinds.includes(k)) continue; if(b&&!s.buckets.includes(+b)) continue;
    if(type&&s.type!==type) continue;
    if(size==="1"&&s.n!==1) continue; if(size==="2"&&s.n<2) continue; if(doubt&&!s.fable.pass1_doubts.length) continue; if(ruled==="1"&&!s.ruled) continue; if(ruled==="0"&&s.ruled) continue; if(flagged&&!s.flagged) continue;
    if(q&&!(s.key.includes(q)||s.cards.some(c=>c.id===q.replace("#","")||c.t.toLowerCase().includes(q)||(c.ex.claim||"").toLowerCase().includes(q)||c.o.toLowerCase().includes(q)))) continue;
    if(label){ const key=s.family+"|"+s.type+"|"+s.f+"|"+(s.famidx===1?week(s):""); if(key!==last){ last=key; parts.push(`<div class="batch"><b>${esc(s.type)}</b><span class="k">${esc(s.family)} · ${esc(s.f)}${s.famidx===1?" · week of "+week(s):""} — say a tier per claim number, or one tier for the whole batch; skip freely</span></div>`);} }
    n++; na+=s.n; parts.push(claim(s));
  }
  $("#list").innerHTML=parts.join(""); $("#cnt").textContent=`${n} claims · ${na} articles`; markTiles();
  document.querySelectorAll("details.pair").forEach(d=>d.addEventListener("toggle",()=>{ const b=d.querySelector(".pairbody"); if(d.open&&!b.innerHTML){ b.innerHTML=b.dataset.keys.split(",").map(k=>claim(DATA.find(x=>x.key===k))).join(""); b.querySelectorAll("details.claim").forEach(x=>x.open=true); } }));
}
document.querySelectorAll(".bar select:not(#theme),.bar input").forEach(e=>e.addEventListener("input",render));
try{ if(localStorage.getItem("board-label")==="1") $("#label").checked=true; }catch(e){}
$("#label").addEventListener("input",e=>{ try{ localStorage.setItem("board-label", e.target.checked?"1":"0"); }catch(err){} });
const FILTERS=["f","k","b","size","doubt","ruled","flagged","q","type"];
function resetFilters(){ for(const id of FILTERS){ const el=$("#"+id); if(el.type==="checkbox") el.checked=false; else el.value=""; } }
function markTiles(){ const state=FILTERS.map(id=>{const el=$("#"+id); return id+"="+(el.type==="checkbox"?(el.checked?"1":""):el.value);}).filter(x=>!x.endsWith("=")).join("&");
  document.querySelectorAll(".tile").forEach(t=>t.classList.toggle("on", t.dataset.set==="reset"?state==="":t.dataset.set===state)); }
document.querySelectorAll(".tile").forEach(t=>t.addEventListener("click",()=>{ resetFilters(); if(t.dataset.set!=="reset"){ const [id,v]=t.dataset.set.split("="); const el=$("#"+id); if(el.type==="checkbox") el.checked=true; else el.value=v; } render(); }));
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
Yellow "suspected" chips and the grey type and bout chips are what the data alone suggests, not labels, until ruled. Labelling mode hides every rule output and orders the claims as a queue. Rulings go to <code>golden/verdicts.md</code>; this page only shows them.</div>
<div class="tiles">
<button class="tile" data-set="reset"><div class="n">{len(out)}</div><div class="l">claims · show all</div></button>
<button class="tile" data-set="size=2"><div class="n">{n_multi}</div><div class="l">with 2+ articles</div></button>
<button class="tile" data-set="size=1"><div class="n">{len(out)-n_multi}</div><div class="l">singletons</div></button>
<button class="tile" data-set="ruled=1"><div class="n">{n_ruled}</div><div class="l">ruled by Anton</div></button>
<button class="tile" data-set="doubt=1"><div class="n">{n_doubt}</div><div class="l">Fable had doubts</div></button>
<button class="tile" data-set="flagged=1"><div class="n">{n_flag}</div><div class="l">suspected body issue</div></button>
</div>
<div class="bar">
<select id="f"><option value="">all fighters</option>{opts(fighters)}</select>
<select id="k"><option value="">any kind</option>{opts(kinds, lambda k: KLABEL.get(k, k))}</select>
<select id="b" class="rule"><option value="">any tier</option>{opts([1,2,3], lambda b: f"tier {b}")}</select>
<select id="size"><option value="">any size</option><option value="1">singletons</option><option value="2">2+ articles</option></select>
<label class="ck"><input type="checkbox" id="doubt">Fable had doubts</label>
<select id="ruled"><option value="">ruled or not</option><option value="1">ruled</option><option value="0">not ruled</option></select>
<label class="ck"><input type="checkbox" id="flagged">suspected body issue</label>
<select id="type"><option value="">any type</option>{opts(sorted({s["type"] for s in out}))}</select>
<label class="ck" title="hides every rule output (the tier chips) and orders the claims as a labelling queue: batches by family, fighter and week"><input type="checkbox" id="label">labelling mode</label>
<input type="search" id="q" placeholder="#id, headline, extract, outlet">
<button id="open">open all</button><button id="close">close all</button>
<select id="theme" title="theme"><option value="system">system theme</option><option value="light">light</option><option value="dark">dark</option></select>
<span class="cnt" id="cnt"></span>
</div>
<div id="list"></div>
</div><script>const DATA={json.dumps(out, ensure_ascii=False)},KL={json.dumps(KLABEL)},QL={json.dumps(QLABEL)},PAIRS={json.dumps(PAIRS, ensure_ascii=False)},QDEF={json.dumps(QUESTIONS, ensure_ascii=False)},EXF={json.dumps(EX["fields"], ensure_ascii=False)},EXK={json.dumps(EX["kind_options"], ensure_ascii=False)};{JS}</script></body></html>"""

open(os.path.join(HERE, "board.html"), "w").write(page)
print(f"board.html: {len(page)//1024} KB, {len(out)} claims, {n_ruled} ruled, {n_doubt} with doubts, {n_flag} flagged")
print("flags:", collections.Counter(f.split(" of ")[0] for fs in flags.values() for f in fs))
