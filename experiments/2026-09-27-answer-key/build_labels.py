"""Merge the key and the other 241 articles' labels into golden/answers/readers-v1.json.

    python3 build_labels.py

Every golden article gets the Fable readers' provisional answers (Opus on
their differences), for Anton to correct: key.json for the 59 key articles
(tagged tune or held_back), labels-rest.json for the rest (never tuned on).
Articles whose saved text was ruled unusable or cut are flagged, so their
answers are not read as facts about the real article. The six exact-copy
pairs are a free check of the readers: identical text should get identical
answers. No model calls.
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
GOLDEN = os.path.join(HERE, "../../golden")
QUESTIONS = ["centrality", "source", "act", "fact", "firmness",
             "reports_his_result", "reports_his_next_fight", "reports_his_health", "he_speaks"]


def body_flags():
    """Articles whose saved text the body checks ruled unusable or cut.

    @returns: article id → Anton's ruling
    """
    checks = json.load(open(os.path.join(GOLDEN, "answers/body-checks.json")))
    items = checks if isinstance(checks, list) else checks.get("items", checks)
    items = items if isinstance(items, list) else list(items.values())
    return {a: x["ruled"] for x in items if x.get("kind") in ("unusable", "cut") for a in x["articles"]}


def copy_pairs():
    """The pairs of articles that are the same page saved twice.

    @returns: [(copy, original)]
    """
    return list(json.load(open(os.path.join(GOLDEN, "claims.json")))["same_page_as"].items())


def main():
    """Write the merged labels and print the copy-pair check."""
    key = json.load(open(os.path.join(HERE, "key.json")))["articles"]
    rest = json.load(open(os.path.join(HERE, "labels-rest.json")))["articles"]
    flags = body_flags()
    articles = {}
    for article_id, entry in {**rest, **key}.items():
        articles[article_id] = {**entry, "body_ruling": flags.get(article_id)}
    out = {"source": "experiments/2026-09-27-answer-key (key.json + labels-rest.json)",
           "guide": "experiments/2026-09-27-answer-key/key-guide.md",
           "note": ("Provisional labels: two Fable readers, blind, from the guide; an Opus reader on their differences. "
                    "'part' is tune or held_back for the 59 answer-key articles (questions were tuned on tune), "
                    "not_key for the rest (never tuned on). Machine answers for Anton to correct, not his labels."),
           "articles": dict(sorted(articles.items(), key=lambda kv: int(kv[0])))}
    json.dump(out, open(os.path.join(GOLDEN, "answers/readers-v1.json"), "w"), indent=1, ensure_ascii=False)
    statuses = [e["status"] for a in articles.values() for e in a["answers"].values()]
    print(f"{len(articles)} articles -> golden/answers/readers-v1.json; " +
          ", ".join(f"{s} {statuses.count(s)}" for s in ("agreed", "majority", "disputed", "split")))
    # identical pages should get identical answers
    same = total = 0
    for copy, original in copy_pairs():
        if copy in articles and original in articles:
            for q in QUESTIONS:
                total += 1; same += articles[copy]["answers"][q]["value"] == articles[original]["answers"][q]["value"]
            diff = [q for q in QUESTIONS if articles[copy]["answers"][q]["value"] != articles[original]["answers"][q]["value"]]
            if diff: print(f"  copy #{copy} vs #{original} differ on: {', '.join(diff)}")
    print(f"copy pairs: {same} of {total} answers identical")


main()
