"""Evaluate a change end to end. Never judge a question in isolation.

    python3 evaluate.py 16 17 18            # evaluate a three-order pass set
    python3 evaluate.py 16 17 18 --vs 10    # and diff against an older baseline

Anton, 2026-09-18: "we should not tune questions in isolation, but in conjunction
with how answers map to what bucket, and each change we should see what breaks
across the whole data set and how it impacts buckets."

Four things get reported for every change, in increasing order of what matters:
  1. the question itself      - confidence, stability, escape-hatch weight
  2. LOAD-BEARING             - does this question decide ANY bucket?
  3. the buckets              - distribution, and stability across option orders
  4. the blind check          - the only unbiased measurement we have
plus a named list of every article whose bucket moved, because a total that has
not changed can still hide two errors cancelling out.
"""
import json, sys, collections, statistics
from buckets3 import bucket

QS = ["role", "whose_judgement", "what_is_done", "news_kind", "sourcing", "novelty"]
BLIND = {**{k: 1 for k in ["735","16"]},
         **{k: 2 for k in ["368","807","208","490","794","778","327","817","1076","625"]},
         **{k: 3 for k in ["224","247","937","560","743","520","609","605","1200","457"]}}
AMBIG = {"778","609","817"}

def load(passes):
    L = {n: {str(r["id"]): r for r in json.load(open(f"results-p{n}.json")) if r.get("answers")}
         for n in passes}
    C = {}
    for a in L[passes[0]]:
        C[a] = {}
        for q in QS:
            ch = [L[n][a]["answers"][q]["choice"] for n in passes]
            w, k = collections.Counter(ch).most_common(1)[0]
            C[a][q] = {"choice": w, "agree": k,
                       "conf": sum(L[n][a]["answers"][q]["confidence"] for n in passes)/len(passes),
                       "esc": sum(L[n][a]["answers"][q]["probabilities"].get("not_in_this_list", 0)
                                  for n in passes)/len(passes)}
    return L, C

def buckets(C):
    return {a: bucket({q: C[a][q]["choice"] for q in QS})[0] for a in C}

def load_bearing(C):
    """for each question, on how many articles would changing it change the bucket"""
    vals = {q: sorted({C[a][q]["choice"] for a in C}) for q in QS}
    n = collections.Counter()
    for a in C:
        base = bucket({q: C[a][q]["choice"] for q in QS})[0]
        for q in QS:
            if any(bucket({k: (v if k == q else C[a][k]["choice"]) for k in QS})[0] != base
                   for v in vals[q] if v != C[a][q]["choice"]):
                n[q] += 1
    return n

def report(passes, vs=None):
    arts = {str(r["id"]): r for r in json.load(open("data/articles.json"))}
    L, C = load(passes); B = buckets(C); LB = load_bearing(C)

    print(f"=== passes {passes} · {len(C)} articles ===\n")
    print(f"{'question':18}{'conf':>7}{'unanim':>9}{'escape':>9}{'DECIDES A BUCKET':>20}")
    for q in QS:
        conf = statistics.median(C[a][q]["conf"] for a in C)
        una = sum(1 for a in C if C[a][q]["agree"] == len(passes))
        esc = sum(C[a][q]["esc"] for a in C)/len(C)
        flag = "  <-- never" if LB[q] == 0 else ""
        print(f"  {q:16}{conf:>7.2f}{una:>8}/{len(C)}{esc:>9.3f}{LB[q]:>14} ({LB[q]/len(C):.0%}){flag}")

    print(f"\nBUCKETS   1={sum(1 for v in B.values() if v==1)}  "
          f"2={sum(1 for v in B.values() if v==2)}  3={sum(1 for v in B.values() if v==3)}")
    stable = sum(1 for a in C if len({bucket({q: L[n][a]["answers"][q]["choice"] for q in QS})[0]
                                      for n in passes}) == 1)
    print(f"  stable across the {len(passes)} option orders: {stable}/{len(C)} ({stable/len(C):.1%})")

    ok = sum(1 for k in BLIND if B[k] == BLIND[k])
    okx = sum(1 for k in BLIND if k not in AMBIG and B[k] == BLIND[k])
    print(f"\nBLIND CHECK  {ok}/{len(BLIND)}   excluding the 3 called ambiguous: {okx}/{len(BLIND)-len(AMBIG)}")
    for k in sorted(BLIND, key=int):
        if B[k] != BLIND[k]:
            print(f"    miss #{k} mine={B[k]} blind={BLIND[k]}{'  (ambiguous)' if k in AMBIG else ''}"
                  f"  {arts[k]['title'][:44]}")

    if vs:
        _, C0 = load(vs); B0 = buckets(C0)
        moved = [a for a in B if B0[a] != B[a]]
        print(f"\n=== vs passes {vs} ===")
        print(f"  buckets moved: {len(moved)} of {len(C)}   "
              f"{dict(collections.Counter((B0[a], B[a]) for a in moved))}")
        print("  every article that moved (a steady total can hide two errors cancelling):")
        for a in sorted(moved, key=int):
            ch = [q for q in QS if C0[a][q]["choice"] != C[a][q]["choice"]]
            tag = "  [blind set]" if a in BLIND else ""
            print(f"    #{a} {B0[a]}->{B[a]}  changed: {', '.join(ch) or 'rules only'}{tag}")
            print(f"        {arts[a]['title'][:62]}")

if __name__ == "__main__":
    args = sys.argv[1:]
    vs = None
    if "--vs" in args:
        i = args.index("--vs"); vs = [int(x) for x in args[i+1:]]; args = args[:i]
    report([int(x) for x in args], vs)
