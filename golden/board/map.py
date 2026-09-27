"""Build the claim map: every golden claim placed on a grid you can re-slice.

    python3 golden/board/map.py        # writes golden/board/map.html

Top-down view of the golden set. Each claim is described along several
dimensions taken from the machine's answers - a gate (is the article about
the fighter at all), who is the source, what is done regarding him, what
fact is asserted, depth, role, the extractor's kind, the fighter. The page
lets you put any two on the axes, filter by any value, and open a cell to
spot-check its claims, doubtful first. The machine's answers are shown,
never Anton's labels: his corrections on this page are what become labels.

A claim takes the value most of its articles give on each dimension; a tie
goes to the article that started the claim. Reads only golden/: the stored
classifier (v2, passes 4-6) and extractor (pass 4) answers. No model calls,
no network. A new prompt version gets its own map by pointing the two
ANSWER_* constants at its answer files; the page stamps which built it.
"""
import json, os, collections

HERE = os.path.dirname(os.path.abspath(__file__))
GOLDEN = os.path.join(HERE, "..")
ANSWER_CLASSIFIER = "answers/classifier-v2.json"
ANSWER_EXTRACTOR = "answers/extractor.json"
VERSION = "classifier v2 · passes 4–6, majority of three option orders  /  extractor · prompt pass 4"

# acts where the fighter is the doer but nobody is the source of words
EVENT_ACTS = {"he_fought", "his_fight_week", "nothing"}
# the gate, from the answers: which values say "not about him" and which say "only partly"
GATE_NO_ROLES = {"background", "mentioned_only", "not_in_the_article_body"}
GATE_PARTLY_ROLES = {"one_of_several_subjects", "one_of_many_on_a_list"}
GATE_NO_EXTRACT = {"about_someone_else", "no_text"}
GATE_RULE = [
    ["no", "the classifier's role is background, mentioned only, or not in the text; or its act is 'naming him in passing'; or the extractor's kind is 'about someone else' or 'no text'"],
    ["partly", "not 'no', and he is one of several subjects or one of a list, or the classifier's depth is 'a line or two'"],
    ["yes", "everything else"],
]
# the dimensions a claim is described on: key, label, and where the value comes from
DIMENSIONS = [
    ("gate", "About him?"), ("who", "Who"), ("what", "What regarding him"), ("fact", "Fact asserted"),
    ("depth", "Depth"), ("role", "Role"), ("extract_kind", "Extractor's kind"), ("fighter", "Fighter"),
]


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


def gate(answers, extract_kind):
    """Decide the gate for one article and say whether the two readers agree on it.

    @param answers: the article's v2 classifier answers
    @param extract_kind: the extractor's kind for the article
    @returns: (gate value "yes" / "partly" / "no", True when classifier and extractor disagree on "no")
    """
    classifier_no = answers["role"]["choice"] in GATE_NO_ROLES or answers["act"]["choice"] == "naming_him_in_passing"
    extractor_no = extract_kind in GATE_NO_EXTRACT
    if classifier_no or extractor_no:
        return "no", classifier_no != extractor_no
    partly = answers["role"]["choice"] in GATE_PARTLY_ROLES or answers["depth"]["choice"] == "a_line_or_two"
    return ("partly" if partly else "yes"), False


def article_row(article_id, articles, classifier, extractor):
    """Collect what the map shows for one article: its identity and a value per dimension.

    @param article_id: golden article id as a string
    @param articles: id → golden article
    @param classifier: id → v2 classifier answers
    @param extractor: id → extractor answers
    @returns: a small dict; `v` holds one value per dimension, `agree` how many of three readers gave it
    """
    article, answers, extract = articles[article_id], classifier[article_id], extractor[article_id]
    extract_kind = extract.get("kind") or "no_text"
    gate_value, gate_disagrees = gate(answers, extract_kind)
    # the extractor's actor naming the fighter is a second opinion on "himself", where someone speaks
    actor = extract.get("actor") or ""
    actor_is_him = surname(article["subject"]).lower() in actor.lower()
    comparable = bool(actor) and answers["act"]["choice"] not in EVENT_ACTS
    return {
        "id": article_id, "date": str(article["published_at"])[:10], "source": article["source"],
        "title": article["title"], "url": article.get("resolved_url") or article["url"],
        "extract": extract.get("claim"), "actor": actor, "occasion": extract.get("occasion"),
        "v": {"gate": gate_value, "who": answers["speaker"]["choice"], "what": answers["act"]["choice"],
              "fact": answers["kind"]["choice"], "depth": answers["depth"]["choice"], "role": answers["role"]["choice"],
              "extract_kind": extract_kind, "fighter": surname(article["subject"])},
        "agree": {"who": answers["speaker"]["agree"], "what": answers["act"]["agree"], "fact": answers["kind"]["agree"],
                  "depth": answers["depth"]["agree"], "role": answers["role"]["agree"]},
        "gate_disagrees": gate_disagrees,
        "who_disagrees": comparable and actor_is_him != (answers["speaker"]["choice"] == "himself"),
    }


def claim_row(claim, rows):
    """Describe one claim by the value most of its articles give on each dimension.

    @param claim: a golden claim (key, fighter, articles)
    @param rows: the claim's article rows, oldest first
    @returns: the claim with a value per dimension and its doubt flags
    """
    values = {}
    for key, _ in DIMENSIONS:
        votes = collections.Counter(r["v"][key] for r in rows)
        top = max(votes.values())
        # a tie goes to the oldest article, the one that started the claim
        values[key] = next(r["v"][key] for r in rows if votes[r["v"][key]] == top)
    return {
        "key": claim["key"], "n": len(rows), "v": values,
        "label": rows[0]["extract"] or rows[0]["title"], "first": rows[0]["id"],
        "readers_split": any(r["agree"]["who"] < 3 or r["agree"]["what"] < 3 for r in rows),
        "gate_disagrees": any(r["gate_disagrees"] for r in rows),
        "who_disagrees": any(r["who_disagrees"] for r in rows), "rows": rows,
    }


def axes(questions, extractor_file, placed):
    """The ordered values of every dimension, with a definition for each where one exists.

    @param questions: the classifier's question file (options and definitions)
    @param extractor_file: the extractor's answer file (its kind options)
    @param placed: the placed claims, for the fighter list
    @returns: dimension key → list of {key, def}
    """
    from_classifier = lambda q: [{"key": k, "def": d} for k, d in questions[q]["options"].items()]
    return {
        "gate": [{"key": k, "def": d} for k, d in GATE_RULE],
        "who": from_classifier("speaker"), "what": from_classifier("act"), "fact": from_classifier("kind"),
        "depth": from_classifier("depth"), "role": from_classifier("role"),
        "extract_kind": [{"key": k, "def": d} for k, d in extractor_file["kind_options"].items()],
        "fighter": [{"key": f, "def": ""} for f in sorted({c["v"]["fighter"] for c in placed})],
    }


def main():
    """Build the page from the golden folder and write map.html."""
    articles = {str(a["id"]): a for a in load("articles.json")}
    classifier_file, extractor_file = load(ANSWER_CLASSIFIER), load(ANSWER_EXTRACTOR)
    classifier, extractor = classifier_file["articles"], extractor_file["articles"]
    golden_claims = load("claims.json")

    # every claim with its articles oldest first, described on every dimension
    placed = []
    for claim in golden_claims["claims"]:
        rows = sorted((article_row(a, articles, classifier, extractor) for a in claim["articles"]), key=lambda r: (r["date"], int(r["id"])))
        placed.append(claim_row(claim, rows))

    data = {"version": VERSION, "ruler": f"ruler v{golden_claims['version']}", "claims": placed,
            "dims": [{"key": k, "label": l} for k, l in DIMENSIONS],
            "values": axes(classifier_file["questions"], extractor_file, placed)}
    page = open(os.path.join(HERE, "map-template.html")).read().replace("/*DATA*/null", json.dumps(data, ensure_ascii=False))
    open(os.path.join(HERE, "map.html"), "w").write(page)

    # a one-line summary, so a rebuild says what it built
    gates = collections.Counter(c["v"]["gate"] for c in placed)
    print(f"map.html: {len(page)//1024} KB, {len(placed)} claims; gate yes {gates['yes']}, partly {gates['partly']}, "
          f"no {gates['no']}; {sum(c['gate_disagrees'] for c in placed)} where classifier and extractor disagree on 'not about him'")


main()
