"""Shape the v5 passes into golden/answers/classifier-v5.json, the file the claim map reads.

    python3 consolidate.py

Reads whichever of passes 1-3 exist. v5 was run as one pass first
(docs/self-improvement.md §8), so today every answer comes from pass 1 and
`agree` is out of 1. Every question becomes a value the map can slice on:
a choice keeps its option; a score becomes its nearest level, named; a
yes/no becomes yes (above 0.7), unsure (0.3 to 0.7) or no (below 0.3).
The raw numbers stay beside the value. No model calls.
"""
import json, os, collections

HERE = os.path.dirname(os.path.abspath(__file__))
GOLDEN = os.path.join(HERE, "../../golden")
LEVEL_NAMES = {"centrality": ["not_in_content", "only_mentioned", "one_of_several", "main_subject"],
               "firmness": ["none", "wish", "rumour", "reported", "official_or_done"]}
YES_ABOVE, NO_BELOW = 0.7, 0.3


def noul_value(probability):
    """A yes/no probability as a value to slice on.

    @param probability: the probability of yes, 0 to 1
    @returns: "yes", "unsure" or "no"
    """
    return "yes" if probability > YES_ABOVE else "no" if probability < NO_BELOW else "unsure"


def options_of(name, question):
    """Every value a question can take, with what it means, in the question's own order.

    @param name: the question key
    @param question: the question as sent
    @returns: value → definition
    """
    kind = question["type"]
    if kind == "choice":
        return {o: d["what"] if isinstance(d, dict) else (d or "") for o, d in question["criteria"].items()}
    if kind == "score":
        return {LEVEL_NAMES[name][i]: level["summary"] for i, level in enumerate(question["criteria"])}
    criteria = question.get("criteria", {})
    return {"yes": f"probability of yes above {YES_ABOVE:.0%}. {criteria.get('true', '')}".strip(),
            "unsure": f"probability of yes between {NO_BELOW:.0%} and {YES_ABOVE:.0%}",
            "no": f"probability of yes below {NO_BELOW:.0%}. {criteria.get('false', '')}".strip()}


def combine(name, kind, answers):
    """One question's answer from the passes that exist.

    @param name: the question key
    @param kind: "choice", "score" or "noul"
    @param answers: this question's raw answer from each pass
    @returns: {choice, agree, conf, readers} plus score or yes, as the map reads it
    """
    # a choice: the majority option and how many passes gave it
    if kind == "choice":
        choice, agree = collections.Counter(a["choice"] for a in answers).most_common(1)[0]
        return {"choice": choice, "agree": agree, "conf": round(sum(a["confidence"] for a in answers) / len(answers), 3),
                "readers": [a["probabilities"] for a in answers]}
    # a score: the mean position, named by its nearest level
    names = LEVEL_NAMES.get(name)
    if kind == "score":
        mean = sum(a["score"] for a in answers) / len(answers)
        choice = names[round(mean)]
        return {"choice": choice, "score": round(mean, 2), "agree": sum(names[round(a["score"])] == choice for a in answers),
                "conf": round(sum(a["confidence"] for a in answers) / len(answers), 3),
                "readers": [{names[int(level)]: p for level, p in a["probabilities"].items()} for a in answers]}
    # a yes/no: the mean probability, sorted into yes / unsure / no
    mean = sum(a["noul"] for a in answers) / len(answers)
    choice = noul_value(mean)
    return {"choice": choice, "yes": round(mean, 3), "agree": sum(noul_value(a["noul"]) == choice for a in answers),
            "conf": round(max(mean, 1 - mean), 3), "readers": [{"yes": a["noul"], "no": round(1 - a["noul"], 3)} for a in answers]}


def main():
    """Write golden/answers/classifier-v5.json and print how each question is used."""
    questions = json.load(open(os.path.join(HERE, "classifier-v5/questions.json")))
    passes = [n for n in (1, 2, 3) if os.path.exists(os.path.join(HERE, f"classifier-v5/results-p{n}.json"))]
    raw = {n: {r["id"]: r["answers"] for r in json.load(open(os.path.join(HERE, f"classifier-v5/results-p{n}.json"))) if r.get("answers")}
           for n in passes}
    ids = sorted(set.intersection(*(set(raw[n]) for n in passes)), key=int)
    articles = {a: {q: combine(q, d["type"], [raw[n][a][q] for n in passes]) for q, d in questions.items()} for a in ids}
    golden = {
        "source": f"experiments/2026-09-27-axes-v5/classifier-v5/results-p{','.join(map(str, passes))}.json",
        "passes": len(passes),
        "note": "The v5 question set: v4 with the four yes/no questions reworded (the fighter named by the state field; result and health as news, not background). Machine answers, not labels.",
        "questions": {q: {"type": d["type"], "instructions": d["instructions"], "options": options_of(q, d)} for q, d in questions.items()},
        "articles": articles,
    }
    json.dump(golden, open(os.path.join(GOLDEN, "answers/classifier-v5.json"), "w"), indent=1, ensure_ascii=False)
    print(f"{len(ids)} articles from pass(es) {passes} -> golden/answers/classifier-v5.json")
    for q in questions:
        print(f"  {q:24} {dict(collections.Counter(articles[a][q]['choice'] for a in ids).most_common())}")


main()
