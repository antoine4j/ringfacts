"""Build the claim map: every golden claim placed on a grid you can re-slice.

    python3 golden/board/map.py        # writes golden/board/map.html

Top-down view of the golden set. Each claim is described along the
dimensions of one classifier version's answers; the page carries every
version and a picker to switch between them. Put any two dimensions on the
axes, filter by any value, open a cell to spot-check its claims, doubtful
first. The machine's answers are shown, never Anton's labels: his
corrections on this page are what become labels.

A claim takes the value most of its articles give on each dimension; a tie
goes to the article that started the claim. Reads only golden/: the stored
classifier answers of each version and the extractor (pass 4). No model
calls, no network. A new classifier version is added to VERSIONS below.

v2 has no gate question, so its gate is a rule over three answers (stated
on the page); v3 asks the gate directly, and pairs each axis with a
question on whether its options fit. v5 has no gate at all: aboutness is to
be computed (golden/axes.md), so its top tiles are the centrality levels,
and its scores and yes/no answers are sliced as named levels.
"""
import json, os, collections

HERE = os.path.dirname(os.path.abspath(__file__))
GOLDEN = os.path.join(HERE, "..")
ANSWER_EXTRACTOR = "answers/extractor.json"
EXTRACTOR_VERSION = "extractor · prompt pass 4"

# v2's gate is derived: which answers say "not about him" and which say "only partly"
V2_GATE_NO_ROLES = {"background", "mentioned_only", "not_in_the_article_body"}
V2_GATE_PARTLY_ROLES = {"one_of_several_subjects", "one_of_many_on_a_list"}
EXTRACT_SAYS_NO = {"about_someone_else", "no_text"}
V2_GATE_RULE = [
    ["no", "derived: the classifier's role is background, mentioned only, or not in the text; or its act is 'naming him in passing'; or the extractor's kind is 'about someone else' or 'no text'"],
    ["partly", "derived: not 'no', and he is one of several subjects or one of a list, or the classifier's depth is 'a line or two'"],
    ["yes", "derived: everything else"],
]
V3_GATE = {"about_him": "yes", "partly_about_him": "partly", "not_about_him": "no"}
# acts where the fighter is the doer but nobody is the source of words (v2), for the "himself" cross-check
V2_EVENT_ACTS = {"he_fought", "his_fight_week", "nothing"}
V3_HIMSELF_ACTS = {"speaks_of_himself", "answers_for_him"}
# v5: centrality levels that count as "not about him" when compared with the extractor
V5_LOW_CENTRALITY = {"not_in_content", "only_mentioned"}
# v5: each fact value and the yes/no question that asks for the same news
V5_FACT_TWINS = {"result": "result", "next_fight": "next_fight", "health": "health"}
V5_UNSURE_CHOICE = 0.4
GATE_TILES = [["yes", "About him", "the claims to classify"], ["partly", "Partly about him", "one of several, or a line or two"],
              ["no", "Not about him", "background, passing, someone else's news"]]
CENTRALITY_TILES = [["main_subject", "Main subject", "he is what the article is about"],
                    ["one_of_several", "One of several", "he shares the article with others"],
                    ["only_mentioned", "Only mentioned", "a line, a list, background"],
                    ["not_in_content", "Not in the content", "only in links or furniture"]]

VERSIONS = [
    {"key": "v5", "file": "answers/classifier-v5.json",
     "stamp": "classifier v5 · pass 1 only, one reader (v4 with the four yes/no questions reworded)",
     "dims": [("centrality", "How central", "centrality"), ("source", "Source", "source"), ("act", "Act", "act"),
              ("fact", "Fact asserted", "fact"), ("firmness", "How firm", "firmness"),
              ("result", "Reports his result", "reports_his_result"), ("next_fight", "Reports his next fight", "reports_his_next_fight"),
              ("health", "Reports his health", "reports_his_health"), ("he_speaks", "He speaks", "he_speaks")],
     "axes": ("fact", "centrality"), "tiles": ("centrality", CENTRALITY_TILES),
     "disagree": ["Centrality and extractor disagree", 'for the claim as a whole, one says "only mentioned or less" / "about someone else", the other does not'],
     "flag_labels": {"gate_disagrees": 'centrality ("only mentioned" or less) and extractor ("about someone else") disagree'}},
    {"key": "v3", "file": "answers/classifier-v3.json",
     "stamp": "classifier v3 · the axes of golden/axes.md, majority of three option orders (pass 4 = noise floor)",
     "dims": [("gate", "About him?", "gate"), ("source", "Source", "source"), ("act", "Act", "act"),
              ("fact", "Fact asserted", "fact"), ("firmness", "How firm", "firmness")],
     "axes": ("source", "act"), "tiles": ("gate", GATE_TILES)},
    {"key": "v2", "file": "answers/classifier-v2.json",
     "stamp": "classifier v2 · passes 4–6, majority of three option orders",
     "dims": [("gate", "About him?", None), ("who", "Who", "speaker"), ("what", "What regarding him", "act"),
              ("fact", "Fact asserted", "kind"), ("depth", "Depth", "depth"), ("role", "Role", "role")],
     "axes": ("who", "what"), "tiles": ("gate", GATE_TILES)},
]
COMMON_DIMS = [("extract_kind", "Extractor's kind"), ("fighter", "Fighter")]
FLAG_LABELS = {
    "readers_split": "readers split", "gate_disagrees": 'classifier and extractor disagree on "not about him"',
    "who_disagrees": 'extract and classifier disagree on "himself"', "fit_doubt": "the classifier says no option fits well",
    "contradiction": "source and act contradict each other",
    "fact_disagrees": "the fact answer and its yes/no question disagree",
    "speaks_disagrees": 'source is "himself" but "he speaks" says no',
    "unsure": "an unsure answer: a choice under 40% confidence, or a yes/no between 30% and 70%",
}


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


def v2_gate(answers, extract_kind):
    """The derived gate for a v2 article, and whether classifier and extractor disagree on "no".

    @param answers: the article's v2 answers
    @param extract_kind: the extractor's kind
    @returns: ("yes" / "partly" / "no", disagreement flag)
    """
    classifier_no = answers["role"]["choice"] in V2_GATE_NO_ROLES or answers["act"]["choice"] == "naming_him_in_passing"
    extractor_no = extract_kind in EXTRACT_SAYS_NO
    if classifier_no or extractor_no:
        return "no", classifier_no != extractor_no
    partly = answers["role"]["choice"] in V2_GATE_PARTLY_ROLES or answers["depth"]["choice"] == "a_line_or_two"
    return ("partly" if partly else "yes"), False


def article_row(version, article, answers, extract):
    """What the map shows for one article under one classifier version.

    @param version: an entry of VERSIONS
    @param article: the golden article
    @param answers: this version's answers for the article
    @param extract: the extractor's answers for the article
    @returns: identity, a value and agreement per dimension, and doubt flags
    """
    extract_kind = extract.get("kind") or "no_text"
    actor = extract.get("actor") or ""
    actor_is_him = surname(article["subject"]).lower() in actor.lower()
    values, agree = {}, {}
    for key, _, question in version["dims"]:
        if question:
            values[key], agree[key] = answers[question]["choice"], answers[question]["agree"]
    flags = {}
    if version["key"] == "v5":
        return v5_row(version, article, answers, extract, values, agree)
    if version["key"] == "v2":
        values["gate"], flags["gate_disagrees"] = v2_gate(answers, extract_kind)
        speaker_is_him, comparable = values["who"] == "himself", bool(actor) and values["what"] not in V2_EVENT_ACTS
        flags["readers_split"] = agree["who"] < 3 or agree["what"] < 3
    else:
        values["gate"] = V3_GATE[values["gate"]]
        flags["gate_disagrees"] = (values["gate"] == "no") != (extract_kind in EXTRACT_SAYS_NO)
        speaker_is_him, comparable = values["source"] == "himself", bool(actor) and values["act"] != "reports_an_event"
        flags["readers_split"] = any(agree[k] < 3 for k in ("gate", "source", "act", "fact"))
        # the paired fit questions, and the rule that act depends on source; the gate cuts nothing (verdicts.md, 2026-09-27)
        flags["fit_doubt"] = any(answers[q + "_fit"]["choice"] != "fits_well" for q in ("source", "act", "fact"))
        flags["contradiction"] = ((values["act"] == "speaks_of_himself" and not speaker_is_him)
                                  or (speaker_is_him and values["act"] not in V3_HIMSELF_ACTS))
    flags["who_disagrees"] = comparable and actor_is_him != speaker_is_him
    extractor_no = extract_kind in EXTRACT_SAYS_NO
    classifier_no = (answers["role"]["choice"] in V2_GATE_NO_ROLES or answers["act"]["choice"] == "naming_him_in_passing"
                     if version["key"] == "v2" else values["gate"] == "no")
    values["extract_kind"], values["fighter"] = extract_kind, surname(article["subject"])
    return {"id": str(article["id"]), "date": str(article["published_at"])[:10], "source": article["source"],
            "title": article["title"], "url": article.get("resolved_url") or article["url"],
            "extract": extract.get("claim"), "actor": actor, "occasion": extract.get("occasion"),
            "v": values, "agree": agree, "flags": flags, "says_no": {"classifier": classifier_no, "extractor": extractor_no},
            "detail": {q: {"choice": a["choice"], "agree": a["agree"], "conf": a["conf"],
                           "readers": [{o: round(p, 2) for o, p in r.items()} for r in a["readers"]]}
                       for q, a in answers.items()}}


def v5_row(version, article, answers, extract, values, agree):
    """What the map shows for one article under v5, whose answers include scores and yes/no.

    @param version: the v5 entry of VERSIONS
    @param article: the golden article
    @param answers: the article's v5 answers
    @param extract: the extractor's answers for the article
    @param values: this article's value per question dimension, already read
    @param agree: how many passes gave each value
    @returns: the same row shape as article_row
    """
    extract_kind = extract.get("kind") or "no_text"
    actor = extract.get("actor") or ""
    # the checks one version's answers make against each other and against the extractor
    speaker_is_him = values["source"] == "himself"
    classifier_no, extractor_no = values["centrality"] in V5_LOW_CENTRALITY, extract_kind in EXTRACT_SAYS_NO
    flags = {"gate_disagrees": classifier_no != extractor_no,
             "who_disagrees": bool(actor) and values["act"] != "reports_an_event" and (surname(article["subject"]).lower() in actor.lower()) != speaker_is_him,
             "contradiction": (values["act"] == "speaks_of_himself" and not speaker_is_him) or (speaker_is_him and values["act"] not in V3_HIMSELF_ACTS),
             "fact_disagrees": any((values["fact"] == fact and values[twin] == "no") or (values["fact"] != fact and values[twin] == "yes")
                                   for fact, twin in V5_FACT_TWINS.items()),
             "speaks_disagrees": speaker_is_him and values["he_speaks"] == "no",
             "unsure": any(a["conf"] < V5_UNSURE_CHOICE for a in answers.values() if "yes" not in a and "score" not in a)
                       or any(a["choice"] == "unsure" for a in answers.values() if "yes" in a)}
    values["extract_kind"], values["fighter"] = extract_kind, surname(article["subject"])
    return {"id": str(article["id"]), "date": str(article["published_at"])[:10], "source": article["source"],
            "title": article["title"], "url": article.get("resolved_url") or article["url"],
            "extract": extract.get("claim"), "actor": actor, "occasion": extract.get("occasion"),
            "v": values, "agree": agree, "flags": flags, "says_no": {"classifier": classifier_no, "extractor": extractor_no},
            "detail": {q: {**{k: a[k] for k in ("choice", "agree", "conf", "score", "yes") if k in a},
                           "readers": [{o: round(p, 2) for o, p in r.items()} for r in a["readers"]]}
                       for q, a in answers.items()}}


def majority(rows, program):
    """Whether most of a claim's articles are "not about him" in one program's view; a tie goes to the first article.

    @param rows: the claim's article rows, oldest first
    @param program: "classifier" or "extractor"
    @returns: True when that program's majority says not about him
    """
    no = sum(r["says_no"][program] for r in rows)
    return rows[0]["says_no"][program] if no * 2 == len(rows) else no * 2 > len(rows)


def claim_row(claim, rows, dim_keys):
    """Describe one claim by the value most of its articles give on each dimension.

    @param claim: a golden claim (key, fighter, articles)
    @param rows: the claim's article rows, oldest first
    @param dim_keys: the dimensions to decide
    @returns: the claim with a value per dimension and its flags (any article's flag counts)
    """
    values = {}
    for key in dim_keys:
        votes = collections.Counter(r["v"][key] for r in rows)
        top = max(votes.values())
        # a tie goes to the oldest article, the one that started the claim
        values[key] = next(r["v"][key] for r in rows if votes[r["v"][key]] == top)
    flags = {name: any(r["flags"].get(name) for r in rows) for name in FLAG_LABELS}
    flags["gate_disagrees"] = majority(rows, "classifier") != majority(rows, "extractor")
    return {"key": claim["key"], "n": len(rows), "v": values, "flags": flags,
            "label": rows[0]["extract"] or rows[0]["title"], "first": rows[0]["id"], "rows": rows}


def version_data(version, articles, extractor_file, claims):
    """Everything the page needs for one classifier version.

    @param version: an entry of VERSIONS
    @param articles: id → golden article
    @param extractor_file: the extractor's answer file
    @param claims: the golden claims
    @returns: stamp, dimensions, their values with definitions, placed claims, default axes
    """
    answers_file = load(version["file"])
    answers, questions = answers_file["articles"], answers_file["questions"]
    extractor = extractor_file["articles"]
    dims = [(k, label) for k, label, _ in version["dims"]] + COMMON_DIMS
    placed = []
    for claim in claims:
        rows = sorted((article_row(version, articles[a], answers[a], extractor[a]) for a in claim["articles"]),
                      key=lambda r: (r["date"], int(r["id"])))
        placed.append(claim_row(claim, rows, [k for k, _ in dims]))
    # each dimension's values in the classifier's own order, with its own definitions
    values = {}
    for key, _, question in version["dims"]:
        if key == "gate":
            values["gate"] = ([{"key": k, "def": d} for k, d in V2_GATE_RULE] if version["key"] == "v2" else
                              [{"key": V3_GATE[k], "def": d} for k, d in questions["gate"]["options"].items()])
        else:
            values[key] = [{"key": k, "def": d} for k, d in questions[question]["options"].items()]
    values["extract_kind"] = [{"key": k, "def": d} for k, d in extractor_file["kind_options"].items()]
    values["fighter"] = [{"key": f, "def": ""} for f in sorted({c["v"]["fighter"] for c in placed})]
    passes = answers_file.get("passes", 3)
    tile_dim, tiles = version["tiles"]
    return {"key": version["key"], "stamp": f"{version['stamp']}  /  {EXTRACTOR_VERSION}",
            "passes": passes, "readers": ["original order", "reversed", "shuffled"][:passes] if passes > 1 else ["pass 1"],
            "tiles": {"dim": tile_dim, "list": tiles, "disagree": version.get("disagree", ["Classifier and extractor disagree",
                      'for the claim as a whole (most of its articles), one says "not about him", the other does not'])},
            "flag_labels": {**FLAG_LABELS, **version.get("flag_labels", {})},
            "act_depends_on_source": "source" in [k for k, _, _ in version["dims"]] and version["key"] != "v2",
            "questions": {q: d.get("instructions", "") for q, d in questions.items()},
            "dims": [{"key": k, "label": l} for k, l in dims], "values": values, "claims": placed,
            "axes": version["axes"], "flags": [f for f in FLAG_LABELS if any(c["flags"].get(f) for c in placed)]}


def main():
    """Build the page from the golden folder and write map.html."""
    articles = {str(a["id"]): a for a in load("articles.json")}
    extractor_file = load(ANSWER_EXTRACTOR)
    golden_claims = load("claims.json")
    versions = [version_data(v, articles, extractor_file, golden_claims["claims"]) for v in VERSIONS]
    data = {"ruler": f"ruler v{golden_claims['version']}", "flag_labels": FLAG_LABELS, "versions": versions}
    page = open(os.path.join(HERE, "map-template.html")).read().replace("/*DATA*/null", json.dumps(data, ensure_ascii=False))
    open(os.path.join(HERE, "map.html"), "w").write(page)

    # a summary per version, so a rebuild says what it built
    print(f"map.html: {len(page)//1024} KB")
    for v in versions:
        tiles = collections.Counter(c["v"][v["tiles"]["dim"]] for c in v["claims"])
        flags = {f: sum(c["flags"][f] for c in v["claims"]) for f in v["flags"]}
        print(f"  {v['key']}: {len(v['claims'])} claims; {v['tiles']['dim']} {dict(tiles)}; flags {flags}")


main()
