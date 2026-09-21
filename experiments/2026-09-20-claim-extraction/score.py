"""Score the three arms against the story clusters (the ruler).

    python3 score.py                 # arms 1+2 (headline; headline+lead) - no extraction needed
    python3 score.py --claims claims-p1.json   # adds arm 3

The embedding is the RULER and is held fixed: gemini-embedding-001, 768d, the
model production uses. Free-tier safe: batches of 20, backoff on 429/503,
and every vector cached to emb-cache/ so a re-run never re-calls.
"""
import json, os, sys, time, math, urllib.request, urllib.error, itertools, collections, datetime, statistics

HERE = os.path.dirname(os.path.abspath(__file__))
ARTS = {str(r["id"]): r for r in json.load(open(f"{HERE}/../2026-09-17-role-questions/data/articles.json"))}
MODEL, DIM, BATCH = "gemini-embedding-001", 768, 20

def key():
    for l in open(f"{HERE}/../../bench/.env.bench"):
        if l.startswith("GEMINI_TEST_API_KEY="): return l.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("GEMINI_TEST_API_KEY not in bench/.env.bench")

def embed(arm, texts):
    """texts: {id: text} -> {id: vector}; cached per arm+id."""
    d = f"{HERE}/emb-cache/{arm}"; os.makedirs(d, exist_ok=True)
    out, todo = {}, []
    for i, t in texts.items():
        p = f"{d}/{i}.json"
        if os.path.exists(p): out[i] = json.load(open(p))
        else: todo.append((i, t))
    api = key() if todo else None
    for n in range(0, len(todo), BATCH):
        chunk = todo[n:n+BATCH]
        body = json.dumps({"requests": [{"model": f"models/{MODEL}", "content": {"parts": [{"text": t}]},
                                         "outputDimensionality": DIM} for _, t in chunk]}).encode()
        req = urllib.request.Request(
            f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:batchEmbedContents?key={api}",
            data=body, headers={"Content-Type": "application/json"})
        for attempt in range(8):
            try:
                with urllib.request.urlopen(req, timeout=60) as r: res = json.loads(r.read())
                break
            except urllib.error.HTTPError as e:
                if e.code in (429, 500, 503) and attempt < 7:
                    wait = min(60, 2 ** attempt * 3); print(f"  {arm}: HTTP {e.code}, waiting {wait}s"); time.sleep(wait); continue
                raise
        for (i, _), emb in zip(chunk, res["embeddings"]):
            out[i] = emb["values"]; json.dump(out[i], open(f"{d}/{i}.json", "w"))
        print(f"  {arm}: {min(n+BATCH, len(todo))}/{len(todo)} embedded"); time.sleep(1.0)
    return out

def cos(a, b):
    num = sum(x*y for x, y in zip(a, b)); return num / math.sqrt(sum(x*x for x in a) * sum(y*y for y in b))

def pairs(ruler):
    """the pairs that actually confuse dedup: same fighter, within 3 days"""
    story = {a: c["key"] for c in ruler for a in c["articles"]}
    D = lambda a: datetime.date.fromisoformat(str(ARTS[a]["published_at"])[:10])
    same, diff = [], []
    for a, b in itertools.combinations(sorted(story, key=int), 2):
        if ARTS[a]["subject"] != ARTS[b]["subject"] or abs((D(a)-D(b)).days) > 3: continue
        (same if story[a] == story[b] else diff).append((a, b))
    return same, diff

def balanced(same, story, cap=6, seed=1):
    import random
    rnd = random.Random(seed); by = collections.defaultdict(list)
    for p in same: by[story[p[0]]].append(p)
    out = []
    for k, ps in by.items(): rnd.shuffle(ps); out += ps[:cap]
    return out

def report(arm, vec, same, diff, story=None):
    s = [cos(vec[a], vec[b]) for a, b in same if a in vec and b in vec]
    d = [cos(vec[a], vec[b]) for a, b in diff if a in vec and b in vec]
    if story:
        bal = balanced(same, story); sb = [cos(vec[a], vec[b]) for a, b in bal if a in vec and b in vec]
        aucb = sum(1 for x in sb for y in d if x > y) / (len(sb) * len(d))
        bestb = min(((sum(1 for x in sb if x < t) + sum(1 for x in d if x >= t), t) for t in [i/100 for i in range(50, 100)]))
        multi = {a for k, n in collections.Counter(story.values()).items() if n > 1 for a in story if story[a] == k}
        covered = sum(1 for a in multi if a in vec)
        print(f"\n[{arm}]  coverage: {covered}/{len(multi)} articles in multi-article stories have a claim ({covered/len(multi):.0%})")
        print(f"  BALANCED (<=6 pairs/story, {len(sb)} pairs): AUC {aucb:.3f}   best thr {bestb[1]:.2f} -> {bestb[0]} errors   median same {statistics.median(sb):.3f}")
    ms = statistics.median(s); md = statistics.median(d)
    overlap = sum(1 for x in d if x >= ms) / len(d)
    # best single threshold: minimise (missed same + false merges)
    best = min(((sum(1 for x in s if x < t) + sum(1 for x in d if x >= t), t) for t in [i/100 for i in range(50, 100)]))
    auc = sum(1 for x in s for y in d if x > y) / (len(s)*len(d))
    miss80 = sum(1 for x in s if x < 0.80); false80 = sum(1 for x in d if x >= 0.80)
    print(f"  FULL: same-story pairs {len(s)}  different-story pairs {len(d)}")
    print(f"  median similarity   same {ms:.3f}   different {md:.3f}   gap {ms-md:+.3f}")
    print(f"  different-story pairs scoring above the median same-story pair: {overlap:.1%}   (lower is better)")
    print(f"  AUC (chance a same pair outscores a different pair): {auc:.3f}")
    print(f"  best threshold {best[1]:.2f}: {best[0]} errors of {len(s)+len(d)}")
    print(f"  at production's 0.80: misses {miss80}/{len(s)} same-story pairs, falsely merges {false80}/{len(d)}")
    return {"arm": arm, "n_same": len(s), "n_diff": len(d), "median_same": ms, "median_diff": md,
            "overlap": overlap, "auc": auc, "best_threshold": best[1], "best_errors": best[0],
            "miss_at_080": miss80, "false_at_080": false80}

if __name__ == "__main__":
    ruler = json.load(open(f"{HERE}/clusters.json"))["clusters"]
    same, diff = pairs(ruler)
    print(f"ruler: {len(ruler)} clusters -> {len(same)} same-story pairs, {len(diff)} different-story pairs (same fighter, ≤3 days)")
    ids = [a for c in ruler for a in c["articles"]]
    arms = {
        "1 headline":        {a: ARTS[a]["title"] for a in ids},
        "2 headline+lead":   {a: ARTS[a]["title"] + "\n\n" + ARTS[a]["body"][:1500] for a in ids},   # what production embeds
    }
    if "--claims" in sys.argv:
        cl = json.load(open(sys.argv[sys.argv.index("--claims")+1]))
        arms["3 extracted claim"] = {str(r["id"]): r["claim"] for r in cl if r.get("claim") and r["claim"] != "NO CLAIM"}
    story = {a: c["key"] for c in ruler for a in c["articles"]}
    tag = sys.argv[sys.argv.index("--claims")+1].replace("claims-", "").replace(".json", "") if "--claims" in sys.argv else ""
    results = [report(arm, embed((arm.split()[0] if not arm.startswith("3") else "3-" + tag), texts), same, diff, story) for arm, texts in arms.items()]
    json.dump(results, open(f"{HERE}/scores.json", "w"), indent=1)
