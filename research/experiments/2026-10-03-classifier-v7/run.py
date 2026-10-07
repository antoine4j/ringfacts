"""Classifier v7 on golden articles: one JEV call per article, the questions in classifier-v7/questions.json.

    python3 run.py --ids 991,90,683            # smoke test: a few live calls, every answer printed
    ROUND=r1 python3 run.py --side tune --yes  # a tuning round on the tune side (155 articles)
    ROUND=r1 python3 run.py --side check --yes # the same questions on the check side (40)

Sides come from golden/split.json. The test side is refused unless --final is
given: it is scored once, at the end (docs/golden-set.md, "The split").
Each round keeps the questions as sent (questions-<round>.json) and one raw
answer per article (raw/, git-ignored), so a round is never paid for twice.
"""
import json, os, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
OUTDIR = f"{HERE}/classifier-v7"
GOLDEN = f"{HERE}/../../../golden"
URL = "https://api.typesafe.ai/v1/systemone"
MODEL = "jev-1.13.0"
ROUND = os.environ.get("ROUND", "r1")


def api_key():
    """The classifier's API key, from the .env line that names the vendor.

    @returns: the key; it is never printed
    """
    for line in open(f"{HERE}/../../../.env"):
        if "typesafe" in line.lower() and "=" in line:
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("no typesafe key line in .env")


def state_of(article):
    """What the classifier sees of one article.

    @param article: a golden article
    @returns: the state object sent with the questions
    """
    return {"watched_fighter": article["subject"], "headline": article["title"], "outlet": article["source"],
            "published": str(article["published_at"])[:10], "article_text": article["body"]}


def call(key, questions, state):
    """One classifier call, retried on a busy or failing server.

    @param key: the API key
    @param questions: the question set
    @param state: the article as state_of() shapes it
    @returns: the API response, or {"_error": ...}
    """
    body = json.dumps({"state": state, "model": MODEL, "questions": questions}).encode()
    request = urllib.request.Request(URL, data=body, headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                return json.loads(response.read())
        except urllib.error.HTTPError as error:
            if error.code in (429, 500, 502, 503) and attempt < 3: time.sleep(2 ** attempt); continue
            return {"_error": f"HTTP {error.code} {error.read().decode()[:300]}"}
        except Exception as error:
            if attempt < 3: time.sleep(2 ** attempt); continue
            return {"_error": repr(error)}


def print_answers(out):
    """Print one article's answers, one line per question.

    @param out: the API response for one article
    """
    if "_error" in out: print("  ERROR", out["_error"]); return
    for name, answer in out["answers"].items():
        if answer["type"] == "noul": print(f"  {name:24} yes {answer['noul']:.2f}")
        elif answer["type"] == "score": print(f"  {name:24} score {answer['score']:.2f}  conf {answer['confidence']:.2f}")
        else: print(f"  {name:24} {answer['choice']}  conf {answer['confidence']:.2f}")


def chosen_articles(articles):
    """The articles this run is allowed to send.

    @param articles: every golden article
    @returns: the articles named by --ids, or those on the side named by --side
    """
    side_of = json.load(open(f"{GOLDEN}/split.json"))["articles"]
    if "--ids" in sys.argv:
        ids = sys.argv[sys.argv.index("--ids") + 1].split(",")
        chosen = [a for a in articles if str(a["id"]) in ids]
    else:
        side = sys.argv[sys.argv.index("--side") + 1]
        chosen = [a for a in articles if side_of[str(a["id"])] == side]

    # the test side is scored once, at the end
    if any(side_of[str(a["id"])] == "test" for a in chosen) and "--final" not in sys.argv:
        raise SystemExit("test-side articles are only sent with --final")
    return chosen


def main():
    """Send the chosen articles and store the answers of this round."""
    questions = json.load(open(f"{OUTDIR}/questions.json"))
    articles = chosen_articles(json.load(open(f"{GOLDEN}/articles.json")))
    key = api_key()

    # a smoke test: print everything, store nothing
    if "--ids" in sys.argv:
        for article in articles:
            print(f"\n#{article['id']} {article['subject']} | {article['title'][:90]}")
            print_answers(call(key, questions, state_of(article)))
        return
    if "--yes" not in sys.argv: print(f"{len(articles)} articles; add --yes to spend."); return

    # the round: one stored answer per article, reused if it is already there
    json.dump(questions, open(f"{OUTDIR}/questions-{ROUND}.json", "w"), indent=1, ensure_ascii=False)
    os.makedirs(f"{OUTDIR}/raw", exist_ok=True)
    def work(article):
        path = f"{OUTDIR}/raw/{article['id']}-{ROUND}.json"
        if os.path.exists(path) and "_error" not in json.load(open(path)): return json.load(open(path))
        out = call(key, questions, state_of(article)); json.dump(out, open(path, "w")); return out
    with ThreadPoolExecutor(max_workers=10) as pool: outs = list(pool.map(work, articles))
    tokens = sum(o["usage"]["input_tokens"] for o in outs if "usage" in o)
    errors = [a["id"] for a, o in zip(articles, outs) if "_error" in o]
    print(f"round {ROUND}: {len(outs)} articles, {len(errors)} errors {errors[:5]}, {tokens:,} input tokens, about ${tokens * 0.042 / 1e6:.3f}")


if __name__ == "__main__": main()
