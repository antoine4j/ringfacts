"""Pass 4's one score on the test set (task 5.7), beside training and validation. No model calls.

    python3 test_score.py            # training and validation only
    python3 test_score.py --final    # adds the test side, for its one scoring (README, "The test-set score")

Reads the stored pass-4 extracts (golden/answers/extractor.json), their
arm-4 embeddings (emb-cache/4-p4/) and the headline-and-lead embeddings
(emb-cache/2/), and scores them against Anton's ruled claims
(golden/claims.json) and the classifier key (golden/labels.json).
Which articles miss is never printed: the test set stays closed.
"""
import json, os, sys, math, itertools
from datetime import datetime, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
GOLDEN = f"{HERE}/../../golden"
WINDOW_DAYS, PAIR_DAYS = 14, 3
CAREER_FACTS = {"result", "next_fight", "health"}


def load():
    """Everything the score reads.

    @returns: (meta by id, side by id, ruled claim by id, key fact by id, extracts by id)
    """
    meta = {str(a["id"]): a for a in json.load(open(f"{GOLDEN}/articles-meta.json"))}
    side = json.load(open(f"{GOLDEN}/split.json"))["articles"]
    claim_of = {a: c["key"] for c in json.load(open(f"{GOLDEN}/claims.json"))["claims"] for a in c["articles"]}
    fact = {i: label["answers"]["fact"] for i, label in json.load(open(f"{GOLDEN}/labels.json"))["articles"].items()}
    extracts = json.load(open(f"{GOLDEN}/answers/extractor.json"))["articles"]
    return meta, side, claim_of, fact, extracts


def vector(arm, article):
    """One article's cached embedding.

    @param arm: the cache folder, "4-p4" or "2"
    @param article: the article id
    @returns: the vector
    """
    return json.load(open(f"{HERE}/emb-cache/{arm}/{article}.json"))


def cosine(a, b):
    """Cosine similarity of two vectors."""
    dot = sum(x * y for x, y in zip(a, b))
    return dot / (math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b)))


def when(meta, article):
    """An article's publication time."""
    return datetime.fromisoformat(str(meta[article]["published_at"]).replace("Z", "+00:00"))


def shortlist_recall(ids, meta, claim_of):
    """Rank of the right ruled claim for every article that joins an earlier one.

    @param ids: the side's article ids
    @returns: (joins, right first, in top 3, in top 5)
    """
    ordered = sorted(ids, key=lambda a: (when(meta, a), int(a)))
    vectors = {a: vector("4-p4", a) for a in ordered}
    seen, ranks = [], []
    for article in ordered:
        fighter, t = meta[article]["subject"], when(meta, article)
        earlier = [b for b in seen if meta[b]["subject"] == fighter]
        joins = any(claim_of[b] == claim_of[article] for b in earlier)
        if joins:
            # candidates: the fighter's claims with an article in the window; each scored by its closest earlier article
            recent = {claim_of[b] for b in earlier if t - when(meta, b) <= timedelta(days=WINDOW_DAYS)}
            best = {}
            for b in earlier:
                if claim_of[b] in recent:
                    best[claim_of[b]] = max(best.get(claim_of[b], -1), cosine(vectors[article], vectors[b]))
            ranking = sorted(best, key=best.get, reverse=True)
            ranks.append(ranking.index(claim_of[article]) + 1 if claim_of[article] in ranking else 99)
        seen.append(article)
    n = len(ranks)
    return n, sum(r == 1 for r in ranks), sum(r <= 3 for r in ranks), sum(r <= 5 for r in ranks)


def separation(ids, meta, claim_of, arm):
    """AUC of same-claim pairs over different-claim pairs: one fighter, within 3 days.

    @param arm: the embedding cache folder
    @returns: (same pairs, different pairs, AUC)
    """
    vectors = {a: vector(arm, a) for a in ids}
    same, different = [], []
    for a, b in itertools.combinations(ids, 2):
        if meta[a]["subject"] != meta[b]["subject"] or abs(when(meta, a) - when(meta, b)) > timedelta(days=PAIR_DAYS): continue
        (same if claim_of[a] == claim_of[b] else different).append(cosine(vectors[a], vectors[b]))
    wins = sum((s > d) + 0.5 * (s == d) for s in same for d in different)
    return len(same), len(different), wins / max(1, len(same) * len(different))


def report(name, ids, meta, claim_of, fact, extracts):
    """Print one side's four scores."""
    n, first, top3, top5 = shortlist_recall(ids, meta, claim_of)
    pct = lambda k: f"{k / max(1, n):.1%}"
    same4, diff4, auc4 = separation(ids, meta, claim_of, "4-p4")
    _, _, auc2 = separation(ids, meta, claim_of, "2")
    career = [i for i in ids if fact[i] in CAREER_FACTS]
    no_claim = sum(extracts[i]["claim"] == "NO CLAIM" for i in career)
    changed = sum(extracts[i]["second_run"]["claim"] != extracts[i]["claim"] for i in ids if extracts[i].get("second_run"))
    with_second = sum(1 for i in ids if extracts[i].get("second_run"))
    print(f"\n{name}: {len(ids)} articles")
    print(f"  1. shortlist (14 days, closest article): {n} joins; right first {pct(first)}, top 3 {pct(top3)}, top 5 {pct(top5)}")
    print(f"  2. separation, {same4} same-claim and {diff4} different-claim pairs: AUC arm 4 {auc4:.3f}, headline+lead {auc2:.3f}")
    print(f"  3. NO CLAIM on career-event articles: {no_claim} of {len(career)}")
    print(f"  4. second run wrote a different sentence: {changed} of {with_second} ({changed / max(1, with_second):.0%})")
    return top5 / max(1, n), auc4, auc2


def main():
    """Score training and validation, and the test side with --final."""
    meta, side, claim_of, fact, extracts = load()
    report("training and validation", [i for i in meta if side[i] != "test"], meta, claim_of, fact, extracts)
    if "--final" not in sys.argv: return
    top5, auc4, auc2 = report("test", [i for i in meta if side[i] == "test"], meta, claim_of, fact, extracts)
    holds = top5 >= 0.95 and auc4 > auc2
    print(f"\npass 4 {'holds' if holds else 'does NOT hold'} on the test set (read in advance: top 5 ≥ 95% and arm 4 above headline+lead)")


if __name__ == "__main__": main()
