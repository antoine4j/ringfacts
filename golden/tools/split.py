"""Draw the golden tune / check / test split by claim: golden/split.json.

    python3 golden/tools/split.py

By claim, never by article, so the articles of one story fall on one side
(docs/golden-set.md, "The split"). The 38 claims whose key article the
classifier questions were tuned on (research/experiments/2026-09-27-answer-key,
part "tune") are forced to tune. The other 90 claims are drawn with a fixed
seed, balanced by fighter and by the claim's fact (the Fable readers'
majority, golden/answers/readers-v1.json): about 100 articles to test, the
rest to check. Check is tune-side but never looked at while changing
questions: it does what the 20 held-back key articles did, at twice the
size. Test is scored once, at the end. No model calls.
"""
import json, os, random, collections

HERE = os.path.dirname(os.path.abspath(__file__))
GOLDEN = os.path.join(HERE, "..")
KEY = os.path.join(GOLDEN, "../research/experiments/2026-09-27-answer-key/key-articles.json")
SEED = 20261001
TEST_ARTICLES = 100


def claim_fact(claim, labels):
    """The fact most of a claim's articles carry, by the readers' labels.

    @param claim: a golden claim
    @param labels: article id → readers-v1 entry
    @returns: a fact value, or "unknown"
    """
    facts = [labels[a]["answers"]["fact"]["value"] for a in claim["articles"] if labels[a]["answers"]["fact"]["value"]]
    return collections.Counter(facts).most_common(1)[0][0] if facts else "unknown"


def main():
    """Draw the split and write golden/split.json."""
    claims = json.load(open(os.path.join(GOLDEN, "claims.json")))["claims"]
    labels = json.load(open(os.path.join(GOLDEN, "answers/readers-v1.json")))["articles"]
    tuned = {k["claim"] for k in json.load(open(KEY))["articles"] if k["part"] == "tune"}
    side = {c["key"]: "tune" for c in claims if c["key"] in tuned}

    # the rest, grouped by fighter and fact, each group shuffled with the seed
    pool = [c for c in claims if c["key"] not in tuned]
    groups = collections.defaultdict(list)
    for c in pool: groups[(c["fighter"], claim_fact(c, labels))].append(c)
    rng = random.Random(SEED)
    share = TEST_ARTICLES / sum(len(c["articles"]) for c in pool)

    # each group gives test its share of articles, a claim at a time
    for group in sorted(groups):
        members = groups[group]; rng.shuffle(members)
        target, taken = share * sum(len(c["articles"]) for c in members), 0
        for c in members:
            to_test = taken + len(c["articles"]) / 2 <= target
            side[c["key"]] = "test" if to_test else "check"
            taken += len(c["articles"]) if to_test else 0

    articles = {str(a): side[c["key"]] for c in claims for a in c["articles"]}
    counts = collections.Counter(articles.values())
    json.dump({"seed": SEED, "note": "tune / check / test by claim; tune = claims the classifier questions were tuned on (forced); "
               "check = tune-side, never looked at while changing questions; test = scored once, at the end",
               "counts": {"articles": dict(counts), "claims": dict(collections.Counter(side.values()))},
               "claims": dict(sorted(side.items())), "articles": dict(sorted(articles.items(), key=lambda kv: int(kv[0])))},
              open(os.path.join(GOLDEN, "split.json"), "w"), indent=1)
    print("articles", dict(counts), "claims", dict(collections.Counter(side.values())))
    for s in ("tune", "check", "test"):
        ids = [a for a, v in articles.items() if v == s]
        print(f"  {s:5} by fighter {dict(collections.Counter(labels[a]['answers']['fact']['value'] and next(c['fighter'].split()[-1] for c in claims if a in map(str, c['articles'])) for a in ids))}")
        print(f"        by fact {dict(collections.Counter(labels[a]['answers']['fact']['value'] for a in ids))}")


main()
