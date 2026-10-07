"""Turn the stored v4, v5 and v6 pass-1 answers into runs on the key articles, so they score like any variant.

    python3 baseline.py        # writes runs/v4-p1.json, v5-p1.json, v6-p1.json; no model calls
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCES = {"v4-p1": "../2026-09-27-axes-v4/classifier-v4/results-p1.json",
           "v5-p1": "../2026-09-27-axes-v5/classifier-v5/results-p1.json",
           "v6-p1": "../2026-09-27-axes-v6/classifier-v6/results-p1.json"}


def main():
    """Write one run file per stored pass, restricted to the key's articles."""
    ids = {k["id"] for k in json.load(open(os.path.join(HERE, "key-articles.json")))["articles"]}
    os.makedirs(os.path.join(HERE, "runs"), exist_ok=True)
    for label, path in SOURCES.items():
        rows = json.load(open(os.path.join(HERE, path)))
        answers = {r["id"]: r["answers"] for r in rows if r["id"] in ids}
        json.dump({"label": label, "variants": path, "part": "all", "model": "jev-1.13.0", "answers": answers, "errors": []},
                  open(os.path.join(HERE, f"runs/{label}.json"), "w"), indent=1, ensure_ascii=False)
        print(label, len(answers), "articles")


main()
