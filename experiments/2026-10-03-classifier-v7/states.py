"""What the classifier is shown: the standing questions sent with a different state per article.

    python3 states.py --show 619,958             # print what each state makes of a few articles, no calls
    python3 states.py cleaned --ids 619,958      # smoke test: answers beside the key
    python3 states.py cleaned --yes              # training and validation sets, stored, scored

States, each a function of the article: "cleaned" drops the page furniture
before and after the article's own sentences; "short" is the cleaned text
cut at 4,000 characters. Only what is sent changes: golden/articles.json is
never altered. Stored answers go to raw/<id>-s-<state>.json and are scored
with score.py's rules beside the round named by --base (default r5).
"""
import json, os, re, sys
from concurrent.futures import ThreadPoolExecutor
import run, score

WINDOW = 40


def prose_share(words):
    """How much a run of words looks like running text rather than a menu.

    @param words: a list of words
    @returns: the share of words that start with a lower-case letter
    """
    letters = [w for w in words if w[:1].isalpha()]
    return sum(w[:1].islower() for w in letters) / max(1, len(letters))


def cleaned(text, headline=""):
    """The article's own text, without the menus and link lists around it.

    @param text: the saved body, one line
    @param headline: the article's headline, which pages repeat just above the article
    @returns: the text from the headline's last repeat in the first half (or the first
        stretch of running sentences) to the last stretch of running sentences
    """
    # pages repeat the headline above the article: start at its last repeat in the first half
    opening = " ".join(re.split(r" [-|–] ", headline)[0].split()[:5])
    found = text.rfind(opening, 0, len(text) // 2) if len(opening) > 15 else -1
    if found > 0: text = text[found:]

    # lists of other headlines carry a date and time each: end before the first one past the opening
    stamp = re.compile(r"\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}").search(text, len(text) // 3)
    if stamp: text = text[:stamp.start()]
    words = text.split()
    if len(words) < 3 * WINDOW: return text
    windows = [prose_share(words[i:i + WINDOW]) >= 0.6 for i in range(len(words) - WINDOW)]

    # the first and last windows that read as running text
    first = next((i for i, prose in enumerate(windows) if prose), 0)
    last = len(windows) - 1 - next((i for i, prose in enumerate(reversed(windows)) if prose), 0)
    return " ".join(words[first:last + WINDOW])


STATES = {"cleaned": cleaned, "short": lambda text, headline: cleaned(text, headline)[:4000]}


def state_of(article, name):
    """The state sent for one article under one way of showing it.

    @param article: a golden article
    @param name: a key of STATES
    @returns: the state object
    """
    return {**run.state_of(article), "article_text": STATES[name](article["body"], article["title"])}


def main():
    """Show, smoke-test, or send and score one way of showing the articles."""
    articles = json.load(open(f"{run.GOLDEN}/articles.json"))
    if "--show" in sys.argv:
        ids = sys.argv[sys.argv.index("--show") + 1].split(",")
        for article in [a for a in articles if str(a["id"]) in ids]:
            for name in STATES:
                text = state_of(article, name)["article_text"]
                print(f"#{article['id']} {name}: {len(article['body'])} → {len(text)} chars\n  starts: {text[:200]}\n  ends:   {text[-200:]}")
        return
    name, questions = sys.argv[1], json.load(open(f"{run.OUTDIR}/questions.json"))
    key = run.api_key()
    if "--ids" in sys.argv:
        labels, _, _, _ = score.load(lambda i: "")
        for article in run.chosen_articles(articles):
            out = run.call(key, questions, state_of(article, name))
            print(f"\n#{article['id']} | {article['title'][:80]}")
            got = score.compose(out["answers"]) if "_error" not in out else {}
            for q in score.QUESTIONS: print(f"  {q:24} key {labels[str(article['id'])]['answers'][q]:20} got {got.get(q)}")
        return

    # the round under this state, then its score beside the base round
    if "--yes" in sys.argv:
        side_of = json.load(open(f"{run.GOLDEN}/split.json"))["articles"]
        chosen = [a for a in articles if side_of[str(a["id"])] in ("tune", "check")]
        def work(article):
            path = f"{run.OUTDIR}/raw/{article['id']}-s-{name}.json"
            if os.path.exists(path) and "_error" not in json.load(open(path)): return json.load(open(path))
            out = run.call(key, questions, state_of(article, name)); json.dump(out, open(path, "w")); return out
        with ThreadPoolExecutor(max_workers=10) as pool: outs = list(pool.map(work, chosen))
        tokens = sum(o["usage"]["input_tokens"] for o in outs if "usage" in o)
        print(f"state {name}: {len(outs)} articles, {sum('_error' in o for o in outs)} errors, {tokens:,} input tokens, about ${tokens * 0.042 / 1e6:.3f}")
    base = sys.argv[sys.argv.index("--base") + 1] if "--base" in sys.argv else "r5"
    for label, path in ((base, lambda i: f"{run.OUTDIR}/raw/{i}-{base}.json"), (name, lambda i: f"{run.OUTDIR}/raw/{i}-s-{name}.json")):
        print(f"\n===== {label}")
        score.report(*score.load(path), ties=True)


if __name__ == "__main__": main()
