"""One JEV call per article, six role questions, every one with an escape hatch.

Read-only. Writes raw/ (one file per call, so a re-run is free) and results.json.
"""
import json, os, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

ENV="/Users/anton/Projects/fighter-bot/.env"
URL="https://api.typesafe.ai/v1/systemone"
HERE=os.path.dirname(os.path.abspath(__file__))
PASS=int(os.environ.get("PASS","1"))

def key():
    for l in open(ENV):
        if "typesafe" in l.lower() and "=" in l:
            return l.split("=",1)[1].strip().strip('"').strip("'")
    raise SystemExit("no key")

Q=json.load(open(f"{HERE}/questions.json"))
ROWS=json.load(open(f"{HERE}/data/articles.json"))

def state_of(it):
    return (f"WATCHED FIGHTER: {it['subject']}\n\n"
            f"HEADLINE: {it['title']}\nOUTLET: {it['source']}\n"
            f"PUBLISHED: {str(it['published_at'])[:10]}\n\nARTICLE TEXT:\n{it['body']}")

def call(api,state):
    body=json.dumps({"state":state,"model":"jev-latest","questions":Q}).encode()
    req=urllib.request.Request(URL,data=body,headers={"Authorization":"Bearer "+api,"Content-Type":"application/json"})
    for a in range(4):
        t0=time.time()
        try:
            with urllib.request.urlopen(req,timeout=180) as r: out=json.loads(r.read())
            out["_seconds"]=round(time.time()-t0,2); return out
        except urllib.error.HTTPError as e:
            if e.code in (429,500,502,503) and a<3: time.sleep(2**a); continue
            return {"_error":f"HTTP {e.code} {e.read().decode()[:300]}"}
        except Exception as e:
            if a<3: time.sleep(2**a); continue
            return {"_error":repr(e)}

def main():
    api=key(); os.makedirs(f"{HERE}/raw",exist_ok=True)
    print(f"{len(ROWS)} articles, pass {PASS}")
    def work(it):
        p=f"{HERE}/raw/{it['id']}-p{PASS}.json"
        if os.path.exists(p): return it,json.load(open(p))
        o=call(api,state_of(it)); json.dump(o,open(p,"w"),indent=1); return it,o
    t0=time.time(); out=[]
    with ThreadPoolExecutor(max_workers=10) as ex:
        for i,r in enumerate(ex.map(work,ROWS),1):
            out.append(r)
            if i%50==0: print(f"  {i}/{len(ROWS)}  {time.time()-t0:.0f}s")
    ti=sum(o["usage"]["input_tokens"] for _,o in out if "usage" in o)
    to=sum(o["usage"]["output_tokens"] for _,o in out if "usage" in o)
    errs=[(it["id"],o["_error"]) for it,o in out if "_error" in o]
    json.dump([{"id":it["id"],"subject":it["subject"],"title":it["title"],"url":it.get("url"),
                "source":it["source"],"published_at":str(it["published_at"])[:10],
                "body_chars":len(it["body"]),"answers":o.get("answers"),"error":o.get("_error")}
               for it,o in out], open(f"{HERE}/results-p{PASS}.json","w"), indent=1)
    print(f"\ndone in {time.time()-t0:.0f}s  tokens in={ti:,} out={to:,}  errors={len(errs)}")
    print(f"COST: ${ti/1e6*0.04:.4f}")
    for e in errs[:5]: print("  err",e)
main()
