"""Extractor v2 on the 300 golden articles with Qwen3.8 Flash via OpenRouter.

    PASS=1 python3 run-extractor.py --one     # one live call, shape and cost check
    PASS=1 python3 run-extractor.py --yes     # the pass (~$0.10)

Same harness shape as research/experiments/2026-09-20-claim-extraction/run.py: prompt read
from extractor-v2/prompt.md, whole body, reasoning off, raw/ cache per article.
Reads golden/articles.json. Never touches the older experiments.
"""
import json, os, re, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
PASS = int(os.environ.get("PASS", "1"))
MODEL = os.environ.get("MODEL", "qwen/qwen3.8-flash")
URL = "https://openrouter.ai/api/v1/chat/completions"
ROWS = json.load(open(f"{HERE}/../../../golden/articles.json"))
OUTDIR = f"{HERE}/extractor-v2"

def key():
    for l in open(f"{HERE}/../../bench/.env.bench"):
        if l.startswith("OPENROUTER_TEST_API_KEY="): return l.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("OPENROUTER_TEST_API_KEY not in research/bench/.env.bench")

def prompt_parts():
    md = open(f"{OUTDIR}/prompt.md").read()
    sec = lambda name: re.search(rf"^## {name}\n(.*?)(?=^## |\Z)", md, re.S | re.M).group(1).strip()
    return sec("System"), sec("User") + "\n\n## Examples\n" + sec("Examples")

def fill(tpl, it):
    return (tpl.replace("{subject}", it["subject"]).replace("{title}", it["title"])
               .replace("{source}", it["source"]).replace("{date}", str(it["published_at"])[:10])
               .replace("{body}", it["body"]))

def call(api, system, user):
    body = json.dumps({"model": MODEL, "temperature": 0, "response_format": {"type": "json_object"},
                       "reasoning": {"enabled": False}, "chat_template_kwargs": {"enable_thinking": False},
                       "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}).encode()
    req = urllib.request.Request(URL, data=body, headers={"Authorization": f"Bearer {api}", "Content-Type": "application/json",
                                                          "HTTP-Referer": "https://github.com/ringfacts", "X-Title": "ringfacts-extractor-v2"})
    for a in range(5):
        t0 = time.time()
        try:
            with urllib.request.urlopen(req, timeout=120) as r: out = json.loads(r.read())
            txt = out["choices"][0]["message"]["content"]
            try: parsed = json.loads(txt)
            except Exception: parsed = {"_unparsed": txt[:500]}
            return {"parsed": parsed, "usage": out.get("usage", {}), "_seconds": round(time.time() - t0, 2), "_model": out.get("model")}
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503) and a < 4: time.sleep(2 ** a * 2); continue
            return {"_error": f"HTTP {e.code} {e.read().decode()[:300]}"}
        except Exception as e:
            if a < 4: time.sleep(2 ** a); continue
            return {"_error": repr(e)}

def main():
    system, user_tpl = prompt_parts()
    print(f"{len(ROWS)} articles · pass {PASS} · model {MODEL}")
    if "--one" in sys.argv:
        it = next(r for r in ROWS if str(r["id"]) == (sys.argv[sys.argv.index("--one") + 1] if len(sys.argv) > sys.argv.index("--one") + 1 else "138"))
        o = call(key(), system, fill(user_tpl, it)); u = o.get("usage", {})
        print(f"one call: completion={u.get('completion_tokens')} prompt={u.get('prompt_tokens')} cost=${u.get('cost')} seconds={o.get('_seconds')}")
        print(json.dumps(o.get("parsed"), ensure_ascii=False, indent=1)); return
    if "--yes" not in sys.argv: print("add --yes to spend."); return
    open(f"{OUTDIR}/prompt-p{PASS}.md", "w").write(open(f"{OUTDIR}/prompt.md").read())
    api = key(); os.makedirs(f"{OUTDIR}/raw", exist_ok=True)
    def work(it):
        p = f"{OUTDIR}/raw/{it['id']}-p{PASS}.json"
        if os.path.exists(p):
            cached = json.load(open(p))
            if "_error" not in cached: return it, cached
        o = call(api, system, fill(user_tpl, it)); json.dump(o, open(p, "w"), indent=1); return it, o
    t0 = time.time(); out = []
    with ThreadPoolExecutor(max_workers=6) as ex:
        for i, r in enumerate(ex.map(work, ROWS), 1):
            out.append(r)
            if i % 50 == 0: print(f"  {i}/{len(ROWS)}  {time.time() - t0:.0f}s")
    cost = sum((o.get("usage") or {}).get("cost") or 0 for _, o in out)
    errs = [(it["id"], o["_error"]) for it, o in out if "_error" in o]
    rows = []
    for it, o in out:
        p = o.get("parsed") or {}
        rows.append({"id": str(it["id"]), "subject": it["subject"], "title": it["title"], **{k: p.get(k) for k in
                     ("kind", "facts", "occasion_type", "origin", "origin_person", "speaker", "occasion_date", "bout", "event", "key_quote", "predicted_winner", "odds")},
                     "error": o.get("_error") or ("unparsed" if "_unparsed" in p else None)})
    json.dump(rows, open(f"{OUTDIR}/results-p{PASS}.json", "w"), ensure_ascii=False, indent=1)
    print(f"done: {len(rows)} rows, {len(errs)} errors, cost ${cost:.4f}, {time.time() - t0:.0f}s -> extractor-v2/results-p{PASS}.json")

if __name__ == "__main__": main()
