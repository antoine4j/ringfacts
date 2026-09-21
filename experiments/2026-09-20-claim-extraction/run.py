"""Extract one claim per article with Qwen3.8 Flash via OpenRouter.

    PASS=1 python3 run.py            # dry: prints the prompt for one article and the cost estimate
    PASS=1 python3 run.py --yes      # spends money (~$0.08 per pass over 300)

The prompt is READ FROM prompt.md, so what Anton reviewed is exactly what runs.
The exact text used is snapshotted to prompt-p{PASS}.md. Outputs cache to
raw/{id}-p{PASS}.json, so a re-run is free. Whole body, never an excerpt.
"""
import json, os, re, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
PASS = int(os.environ.get("PASS", "1"))
MODEL = os.environ.get("MODEL", "qwen/qwen3.8-flash")
URL = "https://openrouter.ai/api/v1/chat/completions"
ROWS = json.load(open(f"{HERE}/../2026-09-17-role-questions/data/articles.json"))

def key():
    for l in open(f"{HERE}/../../bench/.env.bench"):
        if l.startswith("OPENROUTER_TEST_API_KEY="): return l.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("OPENROUTER_TEST_API_KEY not in bench/.env.bench")

def prompt_parts():
    md = open(f"{HERE}/prompt.md").read()
    sec = lambda name: re.search(rf"^## {name}\n(.*?)(?=^## |\Z)", md, re.S | re.M).group(1).strip()
    return sec("System"), sec("User")

def fill(tpl, it):
    return (tpl.replace("{subject}", it["subject"]).replace("{title}", it["title"])
               .replace("{source}", it["source"]).replace("{date}", str(it["published_at"])[:10])
               .replace("{body}", it["body"]))

def call(api, system, user):
    body = json.dumps({"model": MODEL, "temperature": 0, "response_format": {"type": "json_object"},
                       # reasoning OFF: pass 1's first calls ran with thinking on (837 of 917 completion tokens
                       # were reasoning; 21 s and $0.00056 per call). Both spellings, so whichever the provider honours.
                       "reasoning": {"enabled": False}, "chat_template_kwargs": {"enable_thinking": False},
                       "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}).encode()
    req = urllib.request.Request(URL, data=body, headers={"Authorization": f"Bearer {api}", "Content-Type": "application/json",
                                                          "HTTP-Referer": "https://github.com/ringfacts", "X-Title": "ringfacts-claim-test"})
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
    est_in = sum(len(system) + len(fill(user_tpl, it)) for it in ROWS) / 4
    print(f"{len(ROWS)} articles · pass {PASS} · model {MODEL}")
    print(f"estimated input ~{est_in:,.0f} tokens; at ~$0.15/M in + ~$0.60/M out -> ~${est_in/1e6*0.15 + len(ROWS)*110/1e6*0.60:.3f}")
    if "--one" in sys.argv:                       # one live call, to check cost/reasoning before a pass
        o = call(key(), system, fill(user_tpl, ROWS[0])); u = o.get("usage", {})
        print(f"one call: reasoning_tokens={u.get('completion_tokens_details', {}).get('reasoning_tokens')} completion={u.get('completion_tokens')} cost=${u.get('cost')} seconds={o.get('_seconds')}")
        print("claim:", str((o.get("parsed") or {}).get("claim"))[:160]); return
    if "--yes" not in sys.argv:
        print("\n--- DRY RUN: the prompt for the first article ---\n"); print("SYSTEM:\n" + system + "\n\nUSER:\n" + fill(user_tpl, ROWS[0])[:1200] + "\n...")
        print("\nadd --yes to spend."); return
    open(f"{HERE}/prompt-p{PASS}.md", "w").write(open(f"{HERE}/prompt.md").read())
    api = key(); os.makedirs(f"{HERE}/raw", exist_ok=True)
    def work(it):
        p = f"{HERE}/raw/{it['id']}-p{PASS}.json"
        if os.path.exists(p): return it, json.load(open(p))
        o = call(api, system, fill(user_tpl, it)); json.dump(o, open(p, "w"), indent=1); return it, o
    t0 = time.time(); out = []
    with ThreadPoolExecutor(max_workers=6) as ex:
        for i, r in enumerate(ex.map(work, ROWS), 1):
            out.append(r)
            if i % 50 == 0: print(f"  {i}/{len(ROWS)}  {time.time()-t0:.0f}s")
    ti = sum(o.get("usage", {}).get("prompt_tokens", 0) for _, o in out); to = sum(o.get("usage", {}).get("completion_tokens", 0) for _, o in out)
    errs = [(it["id"], o["_error"]) for it, o in out if "_error" in o]
    rows = [{"id": it["id"], "subject": it["subject"], "title": it["title"], **(o.get("parsed") or {}), "error": o.get("_error")} for it, o in out]
    json.dump(rows, open(f"{HERE}/claims-p{PASS}.json", "w"), indent=1, ensure_ascii=False)
    nc = sum(1 for r in rows if r.get("claim") == "NO CLAIM"); un = sum(1 for r in rows if "_unparsed" in r)
    print(f"\ndone in {time.time()-t0:.0f}s  tokens in={ti:,} out={to:,}  errors={len(errs)}  NO CLAIM={nc}  unparsed={un}")
    print(f"COST (at $0.15/M in, $0.60/M out): ${ti/1e6*0.15 + to/1e6*0.60:.4f}")
    for e in errs[:5]: print("  err", e)
main()
