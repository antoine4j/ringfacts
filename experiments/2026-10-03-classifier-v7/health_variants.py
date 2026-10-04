"""Three wordings of the health question, asked side by side in one call per article.

    python3 health_variants.py --yes

Only the health question is sent, in three versions, to the training and
validation articles (never the test side). Answers go to raw/<id>-health.json.
Prints, per version, the wrong and missed "yes" answers against the key.
"""
import json, os, sys
from concurrent.futures import ThreadPoolExecutor
import run, score

BASE = json.load(open(f"{run.OUTDIR}/questions.json"))["reports_his_health"]
OWNERS = ("Does this article report, as its news, a statement by a named person or outlet about an injury, illness, "
          "medical procedure or recovery of the fighter named in `watched_fighter` — a new change in health, something "
          "that just happened, not an old change that happened a while ago?")
VERSIONS = {
    "as_round_3": BASE,
    "owner_wording": {**BASE, "instructions": OWNERS},
    "new_statement": {**BASE, "instructions": BASE["instructions"].replace("a statement by", "a new statement by")},
}


def main():
    """Send the three versions and print how each compares with the key."""
    labels, side_of, flips, _ = score.load(lambda i: "")
    articles = [a for a in json.load(open(f"{run.GOLDEN}/articles.json")) if side_of[str(a["id"])] in ("tune", "check")]
    if "--yes" not in sys.argv: print(f"{len(articles)} articles; add --yes to spend."); return
    key = run.api_key()
    def work(article):
        path = f"{run.OUTDIR}/raw/{article['id']}-health.json"
        if os.path.exists(path) and "_error" not in json.load(open(path)): return json.load(open(path))
        out = run.call(key, VERSIONS, run.state_of(article)); json.dump(out, open(path, "w")); return out
    with ThreadPoolExecutor(max_workers=10) as pool: outs = dict(zip([str(a["id"]) for a in articles], pool.map(work, articles)))

    # per version and side: wrong yes, missed yes, counting an accepted coin-flip value as right
    for side in ("tune", "check"):
        ids = [i for i in outs if side_of[i] == side]
        for name in VERSIONS:
            wrong = missed = 0
            for i in ids:
                got = "yes" if outs[i]["answers"][name]["noul"] >= 0.5 else "no"
                keyed = labels[i]["answers"]["reports_his_health"]
                if got in flips.get((i, "reports_his_health"), {keyed}): continue
                wrong += got == "yes"; missed += got == "no"
            print(f"{side:5} {name:14} wrong yes {wrong:2}  missed yes {missed}")
    tokens = sum(o["usage"]["input_tokens"] for o in outs.values())
    print(f"{tokens:,} input tokens, about ${tokens * 0.042 / 1e6:.3f}")


if __name__ == "__main__": main()
