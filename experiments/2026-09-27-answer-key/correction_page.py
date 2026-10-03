"""Build the page where Anton checks the readers' provisional labels for all 300 articles: correction.html.

    python3 correction_page.py        # writes correction.html (git-ignored), published as an artifact

Every golden article with its nine answers (golden/answers/readers-v1.json),
the readers' notes, the saved text and what classifier v6 said where it
differs. Step 1 (where the readers differed) is grouped by the boundary
they differed on (boundaries.json), each group headed by its brief when
overnight/briefs/out-<group>.json exists; the rule A recheck
(overnight/recheck/) and the triage picks (overnight/triage/) are shown
beside the answers they concern, as hints, never as labels. Within a
group, articles the readers split on or a tie-breaker settled come first,
then those where v6 disagrees. His corrections are saved in the artifact's
database (collection `corrections`, one document per article) and read
back with ArtifactData; a copy-as-text button is the fallback. No model calls.
"""
import glob, json, os, re, random
from boundaries import boundary_of

HERE = os.path.dirname(os.path.abspath(__file__))
GOLDEN = os.path.join(HERE, "../../golden")
QUESTIONS = ["centrality", "source", "act", "fact", "firmness",
             "reports_his_result", "reports_his_next_fight", "reports_his_health", "he_speaks"]
LABELS = {"centrality": "How central", "source": "Source", "act": "Act", "fact": "Fact", "firmness": "How firm",
          "reports_his_result": "Reports his result", "reports_his_next_fight": "Reports his next fight",
          "reports_his_health": "Reports his health", "he_speaks": "He speaks"}
SAMPLE, SAMPLE_SEED = 15, 20260928
# surname stems to highlight in the saved text: watchlist.js matchNames, plus the Russian spelling of Topuria
NAME_STEMS = {"Daniil Donchenko": ["Donchenko", "Донченк"], "Yaroslav Amosov": ["Amosov", "Амосов"],
              "Ilia Topuria": ["Topuria", "Топурі", "Топури"]}


def definitions():
    """Each question's values and what they mean, read from key-guide.md's tables.

    @returns: question → [(value, meaning)]
    """
    guide = open(os.path.join(HERE, "key-guide.md")).read()
    out, current = {}, None
    for line in guide.splitlines():
        heading = re.match(r"## \d\. (\w+)", line)
        if heading: current = heading.group(1); out[current] = []; continue
        row = re.match(r"\| `(\w+)` \| (.+) \|$", line)
        if row and current: out[current].append((row.group(1), row.group(2)))
    for q in QUESTIONS[5:]: out[q] = [("yes", ""), ("no", "")]
    return out


def question_texts():
    """Each question in full: what the readers were asked (key-guide.md) and what the classifier is asked (v6).

    @returns: question → {"readers": text, "classifier": text}
    """
    guide = open(os.path.join(HERE, "key-guide.md")).read()
    out = {}
    # the five main questions: the heading's question plus the paragraph before the table
    for m in re.finditer(r"## \d\. (\w+) — (.+?)\n\n(.*?)(?=\n\| value)", guide, re.S):
        extra = " ".join(m.group(3).split())
        out[m.group(1)] = {"readers": (m.group(2) + (" " + extra if extra else "")).replace("`", "").strip()}
    # the yes/no questions: one bullet each
    for m in re.finditer(r"- \*\*(\w+)\*\* — (.+?)(?=\n- \*\*|\n\n)", guide, re.S):
        out[m.group(1)] = {"readers": " ".join(m.group(2).replace("`", "").split())}
    # the three news questions share one definition, stated above their bullets
    shared = re.search(r"\*\*The three news questions(.+?)\n\n", guide, re.S)
    if shared:
        text = " ".join(("The three news questions" + shared.group(1)).replace("*", "").replace("`", "").split())
        for q in QUESTIONS[5:8]: out[q]["readers"] += " " + text
    v6 = json.load(open(os.path.join(HERE, "../2026-09-27-axes-v6/classifier-v6/questions.json")))
    for q, d in v6.items():
        out.setdefault(q, {})["classifier"] = " ".join(d["instructions"].split())
    return out


def classifier_value(question, answer):
    """v6's answer in the key's terms.

    @param question: the key question
    @param answer: v6's consolidated answer (golden/answers/classifier-v6.json)
    @returns: a key value
    """
    if question == "act" and answer["choice"] == "only_mentions_him": return "none_of_these"
    if question == "source" and answer["choice"] == "other_fighter": return "other_fighter_side"
    if "yes" in answer: return "yes" if answer["yes"] > 0.5 else "no"
    return answer["choice"]


def overnight():
    """The overnight agents' outputs, whichever exist yet.

    @returns: (briefs: group → brief or None,
               recheck: article id → reader letter → {"centrality", "confidence", "note"},
               triage: (article id, question) → {"value": the picked answer or None, "reason", "confidence"})
    """
    night = os.path.join(HERE, "overnight")
    boundaries = json.load(open(os.path.join(HERE, "boundaries.json")))
    briefs = {}
    for key in boundaries["order"]:
        path = os.path.join(night, "briefs", f"out-{key}.json")
        # the agents wrote for "the owner"; the page speaks to Anton directly
        briefs[key] = json.loads(re.sub(r"\b[Tt]he owner's\b", "your", re.sub(r"\b[Tt]he owner\b", "you", open(path).read()))) if os.path.exists(path) else None
    recheck = {}
    for path in sorted(glob.glob(os.path.join(night, "recheck", "[AB]-*.json"))):
        letter = os.path.basename(path)[0]
        for row in json.load(open(path)):
            recheck.setdefault(str(row["id"]), {})[letter] = {k: row.get(k) for k in ("centrality", "confidence", "note")}
    # a triage pick is 1, 2 or 0 (neither); the input file says which answer each number was
    triage = {}
    for path in sorted(glob.glob(os.path.join(night, "triage", "out-*.json"))):
        batch = json.load(open(path.replace("out-", "in-")))
        choices = {(str(a["id"]), c["question"]): c for a in batch for c in a["choices"]}
        for row in json.load(open(path)):
            c = choices.get((str(row["id"]), row["question"]))
            if c is None: continue
            value = {1: c["answer_1"], 2: c["answer_2"]}.get(row["pick"])
            triage[(str(row["id"]), row["question"])] = {"value": value, "reason": row.get("reason"), "confidence": row.get("confidence")}
    return boundaries, briefs, recheck, triage


def reread():
    """The blind re-read of 2026-10-02 under the status-update wording (status-pilot/): fact, firmness, next fight.

    Later rounds replace earlier ones, because round two used the final wording.
    @returns: article id → reader letter → the reader's row (three answers and a note)
    """
    out = {}
    for folder, maps in (("round1", {"A": "id-map.json", "B": "id-map.json"}), ("round2", {"A": "id-map.json", "B": "id-map.json"}),
                         ("full", {"A": "id-map.json", "B": "id-map-B.json"})):
        for letter, map_name in maps.items():
            ids = json.load(open(os.path.join(HERE, "status-pilot", folder, map_name)))
            for path in sorted(glob.glob(os.path.join(HERE, "status-pilot", folder, f"{letter}-*.json"))):
                for row in json.load(open(path)):
                    out.setdefault(ids[row["id"]], {})[letter] = row
    return out


def main():
    """Write correction.html from the key, the guide, v6 and the overnight outputs."""
    boundaries, briefs, recheck, triage = overnight()
    rereaders = reread()
    key = json.load(open(os.path.join(GOLDEN, "answers/readers-v1.json")))["articles"]
    sides = json.load(open(os.path.join(GOLDEN, "split.json")))["articles"]
    articles = {str(a["id"]): a for a in json.load(open(os.path.join(GOLDEN, "articles.json")))}
    v6 = json.load(open(os.path.join(GOLDEN, "answers/classifier-v6.json")))["articles"]
    rows = []
    for article_id, entry in key.items():
        a = articles[article_id]
        answers = {}
        for q in QUESTIONS:
            k = entry["answers"][q]
            answers[q] = {"value": k["value"], "status": k["status"], "readers": k.get("readers"),
                          "classifier": classifier_value(q, v6[article_id][q])}
            if (article_id, q) in triage: answers[q]["hint"] = triage[(article_id, q)]
        if article_id in recheck: answers["centrality"]["recheck"] = recheck[article_id]
        for q in ("fact", "firmness", "reports_his_next_fight"):
            answers[q]["reread"] = {letter: {"value": row[q], "note": row.get("note")} for letter, row in rereaders.get(article_id, {}).items()}
        # the boundary this article's disagreement falls on, and what the brief's recommended rule says about it
        boundary = boundary_of(entry["answers"])
        brief = briefs.get(boundary) if boundary else None
        if brief:
            # the brief recommends one rule, or one per sub-group (a list); take every recommended rule's answers
            recommended = brief.get("recommend") if isinstance(brief.get("recommend"), list) else [brief.get("recommend")]
            for rule in (r for r in brief.get("rules", []) if r.get("name") in recommended):
                for q, v in (rule.get("answers", {}).get(article_id, {}) or {}).items():
                    if q in answers: answers[q]["rule"] = v
        # why this article is worth checking first
        settled = sum(v["status"] in ("majority", "split") for v in answers.values())
        split = sum(v["status"] == "split" for v in answers.values())
        differs = sum(v["value"] is not None and v["classifier"] != v["value"] for v in answers.values())
        rows.append({"id": article_id, "part": entry["part"], "side": sides[article_id], "fighter": a["subject"], "title": a["title"],
                     "url": a.get("resolved_url") or a["url"], "outlet": a["source"], "date": str(a["published_at"])[:10],
                     "text": a["body"], "answers": answers, "notes": entry["notes"], "body_ruling": entry.get("body_ruling"),
                     "boundary": boundary, "brief_line": ((brief or {}).get("per_article", {}) or {}).get(article_id),
                     "rank": (-split, -settled, -differs, int(article_id)),
                     "split": split, "settled": settled, "differs": differs})
    rows.sort(key=lambda r: r["rank"])
    for r in rows: del r["rank"]
    # the review order: where the readers differed, then where only the classifier differs, then a sample of where everyone agrees
    for r in rows:
        r["step"] = 1 if r["settled"] > 0 else 2 if r["differs"] else 3
    agreeing = sorted(r["id"] for r in rows if r["step"] == 3)
    sample = set(random.Random(SAMPLE_SEED).sample(agreeing, min(SAMPLE, len(agreeing))))
    for r in rows: r["sample"] = r["id"] in sample
    groups = {key: {"title": g["title"], "question": g["question"], "brief": briefs.get(key)} for key, g in boundaries["groups"].items()}
    data = {"questions": QUESTIONS, "labels": LABELS, "defs": definitions(), "texts": question_texts(), "stems": NAME_STEMS,
            "boundaries": {"order": boundaries["order"], "groups": groups}, "articles": rows}
    template = open(os.path.join(HERE, "correction-template.html")).read()
    open(os.path.join(HERE, "correction.html"), "w").write(template.replace("/*DATA*/null", json.dumps(data, ensure_ascii=False)))
    print(f"correction.html: {len(rows)} articles; steps {dict(sorted(__import__('collections').Counter(r['step'] for r in rows).items()))}; "
          f"ties anywhere {sum(1 for r in rows if r['settled'])}; "
          f"v6 differs somewhere on {sum(1 for r in rows if r['differs'])}; "
          f"briefs {sum(1 for b in briefs.values() if b)} of {len(briefs)}, recheck on {len(recheck)} articles, triage hints {len(triage)}")


main()
