"""List near-identical articles whose labels differ: the same text should not get two answers.

Compares the saved texts of the 300 golden articles pairwise (same watched fighter, six-word
runs shared) and, for every pair that shares most of its text, the nine answers as they stand:
the readers' key with Anton's corrections laid over it. No model is called.

    python3 copies.py <folder of corrections dumped from the answer-key page>

The folder holds one <article id>.json per corrected card, as the page's database returns them.
"""
import itertools
import json
import re
import sys
from pathlib import Path

GOLDEN = Path(__file__).resolve().parents[3] / "golden"
QUESTIONS = ["centrality", "source", "act", "fact", "firmness", "reports_his_result",
             "reports_his_next_fight", "reports_his_health", "he_speaks"]
SHARED = 0.8  # share of the shorter text's six-word runs found in the other


def runs(text):
    """The set of six-word runs in a text, lower-cased, punctuation dropped."""
    words = re.findall(r"\w+", text.lower())
    return {" ".join(words[i:i + 6]) for i in range(len(words) - 5)}


def answers(article_id, key, corrections):
    """The nine answers on one card: the readers' value unless Anton corrected it."""
    path = corrections / f"{article_id}.json"
    fixes = (json.loads(path.read_text()).get("fixes") or {}) if path.exists() else {}
    return {q: fixes[q]["value"] if q in fixes else key[article_id]["answers"][q]["value"] for q in QUESTIONS}


def main():
    """Print every pair of near-identical articles and the questions they are answered differently on."""
    corrections = Path(sys.argv[1])
    key = json.loads((GOLDEN / "answers/readers-v1.json").read_text())["articles"]
    articles = {str(a["id"]): a for a in json.loads((GOLDEN / "articles.json").read_text())}
    shingles = {i: runs(articles[i]["body"] or "") for i in key}
    pairs = differing = 0
    for a, b in itertools.combinations(key, 2):
        if articles[a]["subject"] != articles[b]["subject"] or min(len(shingles[a]), len(shingles[b])) < 30:
            continue
        shared = len(shingles[a] & shingles[b]) / min(len(shingles[a]), len(shingles[b]))
        if shared < SHARED:
            continue
        pairs += 1
        one, other = answers(a, key, corrections), answers(b, key, corrections)
        diff = {q: (one[q], other[q]) for q in QUESTIONS if one[q] != other[q]}
        if diff:
            differing += 1
            print(f"#{a} vs #{b} (shared {shared:.2f}): {diff}")
            print(f"    {articles[a]['title'][:70]} || {articles[b]['title'][:70]}")
    print(f"{pairs} near-identical pairs, {differing} with different labels")


if __name__ == "__main__":
    main()
