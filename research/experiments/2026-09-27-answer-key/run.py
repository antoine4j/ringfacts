"""Run question variants on the answer-key articles only, and keep a ledger of what it cost.

    python3 run.py variants/fact-a.json --part tune --label fact-a
    python3 run.py variants/fact-a.json --part all  --label fact-a-all

A variants file maps question keys to JEV questions, e.g. {"fact__v5": {...},
"fact__a": {...}}: each question is evaluated in isolation, so several
wordings of one question can ride in one request without affecting each
other. `--part` is tune (39 articles), held_back (20) or all. Results go to
runs/<label>.json; every call's tokens go to ledger.json with its price at
$0.042 per million input tokens (output is free). Stops before spending if
the ledger would pass the budget.
"""
import json, os, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
ENV = os.path.join(HERE, "../../../.env")
URL = "https://api.typesafe.ai/v1/systemone"
MODEL = "jev-1.13.0"
PRICE_PER_TOKEN = 0.042 / 1_000_000
BUDGET = 1.00
LEDGER = os.path.join(HERE, "ledger.json")


def api_key():
    """The JEV key from the .env line that names typesafe; never printed.

    @returns: the key string
    """
    for line in open(ENV):
        if "typesafe" in line.lower() and "=" in line:
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("no typesafe key line in .env")


def state_of(article):
    """The article as JEV sees it: named fields, as in v4 and v5.

    @param article: a golden article
    @returns: the state object
    """
    return {"watched_fighter": article["subject"], "headline": article["title"], "outlet": article["source"],
            "published": str(article["published_at"])[:10], "article_text": article["body"]}


def call(key, questions, state):
    """One JEV request, retried on rate limits and server errors.

    @param key: the API key
    @param questions: question key → question
    @param state: the article state
    @returns: the parsed response, or {"_error": ...}
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


def spent():
    """What the ledger says has been spent so far.

    @returns: dollars
    """
    if not os.path.exists(LEDGER): return 0.0
    return sum(entry["dollars"] for entry in json.load(open(LEDGER)))


def main():
    """Run one variants file on one part of the key and record the result and its cost."""
    variants_path, part = sys.argv[1], sys.argv[sys.argv.index("--part") + 1]
    label = sys.argv[sys.argv.index("--label") + 1]
    questions = json.load(open(variants_path))
    key_articles = json.load(open(os.path.join(HERE, "key-articles.json")))["articles"]
    ids = [k["id"] for k in key_articles if part == "all" or k["part"] == part]
    articles = {str(a["id"]): a for a in json.load(open(os.path.join(HERE, "../../../golden/articles.json")))}

    # a rough ceiling before spending: 4,800 input tokens per article per nine questions, scaled
    estimate = len(ids) * 4800 * max(1, len(questions)) / 9 * PRICE_PER_TOKEN * 1.5
    if spent() + estimate > BUDGET:
        raise SystemExit(f"stop: spent ${spent():.3f}, this run could add ${estimate:.3f}, budget ${BUDGET:.2f}")

    # the calls, ten at a time
    key = api_key()
    with ThreadPoolExecutor(max_workers=10) as pool:
        responses = list(pool.map(lambda a: (a, call(key, questions, state_of(articles[a]))), ids))
    tokens = sum(r.get("usage", {}).get("input_tokens", 0) for _, r in responses)
    errors = [(a, r["_error"]) for a, r in responses if "_error" in r]

    # the results and the ledger entry
    os.makedirs(os.path.join(HERE, "runs"), exist_ok=True)
    json.dump({"label": label, "variants": os.path.relpath(variants_path, HERE), "part": part, "model": MODEL,
               "answers": {a: r.get("answers") for a, r in responses}, "errors": errors},
              open(os.path.join(HERE, f"runs/{label}.json"), "w"), indent=1, ensure_ascii=False)
    ledger = json.load(open(LEDGER)) if os.path.exists(LEDGER) else []
    ledger.append({"label": label, "articles": len(ids), "questions": len(questions), "input_tokens": tokens,
                   "dollars": round(tokens * PRICE_PER_TOKEN, 5)})
    json.dump(ledger, open(LEDGER, "w"), indent=1)
    print(f"{label}: {len(ids)} articles × {len(questions)} questions, {len(errors)} errors, "
          f"{tokens:,} tokens = ${tokens * PRICE_PER_TOKEN:.4f}; ledger total ${spent():.4f} of ${BUDGET:.2f}")


if __name__ == "__main__":
    main()
