"""Classifier v2 on the 300 golden articles: one JEV call per article, five questions.

    PASS=1 python3 run-classifier.py --one      # one live call, shape check
    PASS=1 python3 run-classifier.py --yes      # the pass (~$0.05)
    ORDER=reversed PASS=2 ...  ORDER=shuffled PASS=3 ...   # the other option orders, for a majority of three

Same harness shape as experiments/2026-09-17-role-questions/run.py. Questions read
from classifier-v2/questions.json; raw/ cache per article and pass.
"""
import json, os, sys, time, random, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
OUTDIR = f"{HERE}/classifier-v2"
ENV = f"{HERE}/../../.env"
URL = "https://api.typesafe.ai/v1/systemone"
PASS = int(os.environ.get("PASS", "1")); ORDER = os.environ.get("ORDER", "original")
ROWS = json.load(open(f"{HERE}/../../golden/articles.json"))

def key():
    for l in open(ENV):
        if "typesafe" in l.lower() and "=" in l: return l.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("no typesafe key line in .env")

def questions():
    q = json.load(open(f"{OUTDIR}/questions.json"))
    for name, d in q.items():
        items = list(d["criteria"].items())
        if ORDER == "reversed": items = items[::-1]
        elif ORDER == "shuffled": random.Random(PASS * 1000 + len(name)).shuffle(items)
        d["criteria"] = dict(items)
    return q

def state_of(it):
    return (f"WATCHED FIGHTER: {it['subject']}\n\nHEADLINE: {it['title']}\nOUTLET: {it['source']}\n"
            f"PUBLISHED: {str(it['published_at'])[:10]}\n\nARTICLE TEXT:\n{it['body']}")

def call(api, Q, state):
    body = json.dumps({"state": state, "model": "jev-latest", "questions": Q}).encode()
    req = urllib.request.Request(URL, data=body, headers={"Authorization": "Bearer " + api, "Content-Type": "application/json"})
    for a in range(4):
        t0 = time.time()
        try:
            with urllib.request.urlopen(req, timeout=180) as r: out = json.loads(r.read())
            out["_seconds"] = round(time.time() - t0, 2); return out
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503) and a < 3: time.sleep(2 ** a); continue
            return {"_error": f"HTTP {e.code} {e.read().decode()[:300]}"}
        except Exception as e:
            if a < 3: time.sleep(2 ** a); continue
            return {"_error": repr(e)}

def main():
    Q = questions(); print(f"{len(ROWS)} articles, pass {PASS}, order {ORDER}")
    if "--one" in sys.argv:
        it = next(r for r in ROWS if str(r["id"]) == "6")
        o = call(key(), Q, state_of(it)); print(json.dumps({k: v for k, v in o.items() if k != "questions"}, indent=1)[:2500]); return
    if "--yes" not in sys.argv: print("add --yes to spend."); return
    json.dump(Q, open(f"{OUTDIR}/questions-p{PASS}.json", "w"), indent=1)
    api = key(); os.makedirs(f"{OUTDIR}/raw", exist_ok=True)
    def work(it):
        p = f"{OUTDIR}/raw/{it['id']}-p{PASS}.json"
        if os.path.exists(p):
            c = json.load(open(p))
            if "_error" not in c: return it, c
        o = call(api, Q, state_of(it)); json.dump(o, open(p, "w"), indent=1); return it, o
    t0 = time.time(); out = []
    with ThreadPoolExecutor(max_workers=10) as ex:
        for i, r in enumerate(ex.map(work, ROWS), 1):
            out.append(r)
            if i % 50 == 0: print(f"  {i}/{len(ROWS)}  {time.time() - t0:.0f}s")
    ti = sum(o["usage"]["input_tokens"] for _, o in out if "usage" in o); to = sum(o["usage"]["output_tokens"] for _, o in out if "usage" in o)
    errs = [(it["id"], o["_error"]) for it, o in out if "_error" in o]
    json.dump([{"id": str(it["id"]), "subject": it["subject"], "title": it["title"], "answers": o.get("answers"), "error": o.get("_error")} for it, o in out],
              open(f"{OUTDIR}/results-p{PASS}.json", "w"), indent=1, ensure_ascii=False)
    print(f"done: {len(out)} rows, {len(errs)} errors, tokens in {ti:,} out {to:,}, {time.time() - t0:.0f}s -> classifier-v2/results-p{PASS}.json")
    if errs: print("errors:", errs[:5])

if __name__ == "__main__": main()
