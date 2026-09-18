"""Majority vote across three option orders (p3 original, p5 reversed, p6 shuffled).

Unanimity survives two perturbations that are known to move weak answers, so it
is a property of the article. A split means the article is hard or the option
list does not fit it - that is the pile worth a human or Fable.
"""
import json, collections, sys
ORDERS = [3, 5, 6]
L = {n: {str(r["id"]): r for r in json.load(open(f"results-p{n}.json")) if r.get("answers")} for n in ORDERS}
QS = ["role", "whose_judgement", "what_is_done", "news_kind", "sourcing"]

def vote(aid, q):
    """-> (choice, agreement 1..3, mean confidence)"""
    ch = [L[n][aid]["answers"][q]["choice"] for n in ORDERS]
    cf = [L[n][aid]["answers"][q]["confidence"] for n in ORDERS]
    win, k = collections.Counter(ch).most_common(1)[0]
    return win, k, sum(cf) / len(cf)

def consensus():
    out = {}
    for aid in L[ORDERS[0]]:
        out[aid] = {q: vote(aid, q) for q in QS}
    return out

if __name__ == "__main__":
    C = consensus()
    print(f"{len(C)} articles x {len(QS)} questions = {len(C)*len(QS)} answers, 3 orders each\n")
    tot = collections.Counter()
    print(f"{'question':18}{'unanimous':>11}{'2 of 3':>9}{'all differ':>12}")
    for q in QS:
        c = collections.Counter(C[a][q][1] for a in C)
        tot += c
        print(f"  {q:16}{c[3]:>11}{c[2]:>9}{c[1]:>12}")
    print(f"  {'TOTAL':16}{tot[3]:>11}{tot[2]:>9}{tot[1]:>12}")
    print(f"\n  unanimous = {tot[3]/sum(tot.values()):.1%} of answers")

    solid = [a for a in C if all(C[a][q][1] == 3 for q in QS)]
    print(f"\nARTICLES unanimous on all five questions: {len(solid)} of {len(C)}")
    hard = sorted(C, key=lambda a: (sum(C[a][q][1] for q in QS), sum(C[a][q][2] for q in QS)))
    print(f"ARTICLES with any split: {len(C)-len(solid)}")

    # does agreement track confidence?
    print("\nmean confidence by agreement level:")
    for k in (3, 2, 1):
        v = [C[a][q][2] for a in C for q in QS if C[a][q][1] == k]
        if v: print(f"  {k} of 3 agree  n={len(v):>5}   mean confidence {sum(v)/len(v):.2f}")

    # how well does a 0.6 confidence cut predict unanimity?
    print("\nconfidence >=0.6 (pass 3) as a predictor of unanimity:")
    hi = [(L[3][a]['answers'][q]['confidence'] >= .6, C[a][q][1] == 3) for a in C for q in QS]
    tp = sum(1 for h, u in hi if h and u); fp = sum(1 for h, u in hi if h and not u)
    fn = sum(1 for h, u in hi if not h and u); tn = sum(1 for h, u in hi if not h and not u)
    print(f"  conf>=0.6 & unanimous {tp:>5}   conf>=0.6 & split {fp:>4}  -> {tp/(tp+fp):.1%} of confident answers are unanimous")
    print(f"  conf <0.6 & unanimous {fn:>5}   conf <0.6 & split {tn:>4}  -> {tn/(tn+fn):.1%} of unconfident answers are split")
    json.dump({a: {q: {"choice": C[a][q][0], "agree": C[a][q][1], "conf": round(C[a][q][2], 3)} for q in QS} for a in C},
              open("consensus.json", "w"), indent=1)
    print("\nwrote consensus.json")
