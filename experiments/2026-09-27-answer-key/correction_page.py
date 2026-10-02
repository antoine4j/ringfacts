"""Build the page where Anton checks the readers' provisional labels for all 300 articles: correction.html.

    python3 correction_page.py        # writes correction.html (git-ignored), published as an artifact

Every golden article with its nine answers (golden/answers/readers-v1.json),
the readers' notes, the saved text and what classifier v6 said where it
differs. The 59 answer-key articles come first, since every score rests on
them; within each group, articles the readers split on or a tie-breaker
settled come first, then those where v6 disagrees. His
corrections are saved in the artifact's database (collection
`corrections`, one document per article) and read back with ArtifactData;
a copy-as-text button is the fallback. No model calls.
"""
import json, os, re, random

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


def main():
    """Write correction.html from the key, the guide and v6."""
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
        # why this article is worth checking first
        settled = sum(v["status"] in ("majority", "split") for v in answers.values())
        split = sum(v["status"] == "split" for v in answers.values())
        differs = sum(v["value"] is not None and v["classifier"] != v["value"] for v in answers.values())
        rows.append({"id": article_id, "part": entry["part"], "side": sides[article_id], "fighter": a["subject"], "title": a["title"],
                     "url": a.get("resolved_url") or a["url"], "outlet": a["source"], "date": str(a["published_at"])[:10],
                     "text": a["body"], "answers": answers, "notes": entry["notes"], "body_ruling": entry.get("body_ruling"),
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
    data = {"questions": QUESTIONS, "labels": LABELS, "defs": definitions(), "texts": question_texts(), "stems": NAME_STEMS, "articles": rows}
    template = open(os.path.join(HERE, "correction-template.html")).read()
    open(os.path.join(HERE, "correction.html"), "w").write(template.replace("/*DATA*/null", json.dumps(data, ensure_ascii=False)))
    print(f"correction.html: {len(rows)} articles; steps {dict(sorted(__import__('collections').Counter(r['step'] for r in rows).items()))}; "
          f"ties anywhere {sum(1 for r in rows if r['settled'])}; "
          f"v6 differs somewhere on {sum(1 for r in rows if r['differs'])}")


main()
