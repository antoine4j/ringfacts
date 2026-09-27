"""Build the claim map: every golden claim placed on a who × what grid.

    python3 golden/board/map.py        # writes golden/board/map.html

Top-down view of the golden set. Each claim sits in one cell: who is the
source (the classifier's `speaker` answer) across, what is done regarding
the watched fighter (its `act` answer) down. Click a cell to open its claims
and spot-check them. The machine's answers are shown, never Anton's labels:
his corrections on this page are what become labels.

Reads only golden/: the stored classifier (v2, passes 4-6) and extractor
(pass 4) answers. No model calls, no network. The version stamp at the top
of the page names which answers built it; a new prompt version gets its own
map by pointing the two ANSWER_* constants at its answer files.
"""
import json, os, collections, html

HERE = os.path.dirname(os.path.abspath(__file__))
GOLDEN = os.path.join(HERE, "..")
ANSWER_CLASSIFIER = "answers/classifier-v2.json"
ANSWER_EXTRACTOR = "answers/extractor.json"
EVENT_ACTS = {"he_fought", "his_fight_week", "nothing"}
VERSION = "classifier v2 · passes 4–6, majority of three option orders  /  extractor · prompt pass 4"


def load(name):
    """Read one JSON file from the golden folder.

    @param name: path relative to golden/
    @returns: the parsed JSON
    """
    return json.load(open(os.path.join(GOLDEN, name)))


def surname(fighter):
    """Return the last word of a fighter's name, the part outlets always print.

    @param fighter: full name, e.g. "Ilia Topuria"
    @returns: "Topuria"
    """
    return fighter.split()[-1]


def article_row(article_id, articles, classifier, extractor):
    """Collect what the map shows for one article.

    @param article_id: golden article id as a string
    @param articles: id → golden article
    @param classifier: id → v2 classifier answers
    @param extractor: id → extractor answers
    @returns: a small dict of the answers and the article's identity
    """
    article, answers, extract = articles[article_id], classifier[article_id], extractor[article_id]
    # each classifier question: the majority choice and how many of three readers gave it
    asked = {q: {"choice": answers[q]["choice"], "agree": answers[q]["agree"]} for q in ("speaker", "act", "kind", "depth", "role")}
    # the extractor's actor naming the fighter himself is a second opinion on "himself" - but only
    # where someone speaks: in a fight or a weigh-in he is the actor while nobody is the source
    actor = extract.get("actor") or ""
    actor_is_him = surname(article["subject"]).lower() in actor.lower()
    comparable = bool(actor) and asked["act"]["choice"] not in EVENT_ACTS
    return {
        "id": article_id, "date": str(article["published_at"])[:10], "source": article["source"],
        "title": article["title"], "url": article.get("resolved_url") or article["url"],
        "extract": extract.get("claim"), "actor": actor, "occasion": extract.get("occasion"),
        "extract_kind": extract.get("kind"), "q": asked,
        "who_disagrees": comparable and actor_is_him != (asked["speaker"]["choice"] == "himself"),
    }


def claim_row(claim, rows):
    """Place one claim on the grid and note where its placement is shaky.

    @param claim: a golden claim (key, fighter, articles)
    @param rows: the claim's article rows, oldest first
    @returns: the claim with its cell, majority kind and depth, and doubt flags
    """
    # the cell every article votes for; a tie goes to the oldest article, the one that started the claim
    votes = collections.Counter((r["q"]["speaker"]["choice"], r["q"]["act"]["choice"]) for r in rows)
    top = max(votes.values())
    who, what = next(cell for cell in ((r["q"]["speaker"]["choice"], r["q"]["act"]["choice"]) for r in rows) if votes[cell] == top)
    majority = lambda q: collections.Counter(r["q"][q]["choice"] for r in rows).most_common(1)[0][0]
    # three kinds of doubt, shown first when the cell is opened
    readers_split = any(r["q"]["speaker"]["agree"] < 3 or r["q"]["act"]["agree"] < 3 for r in rows)
    return {
        "key": claim["key"], "fighter": surname(claim["fighter"]), "n": len(rows),
        "who": who, "what": what, "kind": majority("kind"), "depth": majority("depth"),
        "label": rows[0]["extract"] or rows[0]["title"], "first": rows[0]["id"],
        "readers_split": readers_split, "articles_split": len(votes) > 1,
        "who_disagrees": any(r["who_disagrees"] for r in rows), "rows": rows,
    }


def main():
    """Build the page from the golden folder and write map.html."""
    articles = {str(a["id"]): a for a in load("articles.json")}
    classifier_file = load(ANSWER_CLASSIFIER)
    classifier, questions = classifier_file["articles"], classifier_file["questions"]
    extractor = load(ANSWER_EXTRACTOR)["articles"]
    golden_claims = load("claims.json")

    # every claim with its articles oldest first, placed on the grid
    placed = []
    for claim in golden_claims["claims"]:
        rows = sorted((article_row(a, articles, classifier, extractor) for a in claim["articles"]), key=lambda r: (r["date"], int(r["id"])))
        placed.append(claim_row(claim, rows))

    # the axes are the classifier's own option lists, in its own order, with its definitions
    axes = {q: [{"key": k, "def": d} for k, d in questions[q]["options"].items()] for q in ("speaker", "act", "kind", "depth")}
    data = {"version": VERSION, "ruler": f"ruler v{golden_claims['version']}", "claims": placed, "axes": axes}
    page = open(os.path.join(HERE, "map-template.html")).read().replace("/*DATA*/null", json.dumps(data, ensure_ascii=False))
    open(os.path.join(HERE, "map.html"), "w").write(page)

    # a one-line summary, so a rebuild says what it built
    cells = collections.Counter((c["who"], c["what"]) for c in placed)
    print(f"map.html: {len(page)//1024} KB, {len(placed)} claims in {len(cells)} of "
          f"{len(axes['speaker']) * len(axes['act'])} cells; "
          f"{sum(c['readers_split'] for c in placed)} with readers split, "
          f"{sum(c['articles_split'] for c in placed)} with articles in different cells, "
          f"{sum(c['who_disagrees'] for c in placed)} where extract and classifier disagree on 'himself'")


main()
