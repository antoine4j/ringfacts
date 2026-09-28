"""Combine the v4 passes into golden/answers/classifier-v4.json and measure them.

    python3 consolidate.py

Passes 1-3 ask the same questions with the choice options in three orders.
A choice answer is the majority of the three, as in v3; a score answer is
the mean of the three positions; a yes/no answer is the mean of the three
probabilities. Score and yes/no questions are not reordered, so for them
passes 1-3 are three plain repeats. Pass 4 repeats pass 1 exactly: comparing
the two is the noise floor. The measurements are printed and written to
measures.json beside this file. No model calls.
"""
import json, os, collections

HERE = os.path.dirname(os.path.abspath(__file__))
GOLDEN = os.path.join(HERE, "../../golden")
YES = 0.5


def load_pass(number):
    """Read one pass's answers.

    @param number: the pass number, 1 to 4
    @returns: article id → {question: answer}
    """
    rows = json.load(open(os.path.join(HERE, f"classifier-v4/results-p{number}.json")))
    return {r["id"]: r["answers"] for r in rows if r.get("answers")}


def combine(readers, question, kind):
    """One question's answer from the three option orders.

    @param readers: the three passes' answers for one article
    @param question: the question key
    @param kind: "choice", "score" or "noul"
    @returns: choice {choice, agree, conf, readers}; score {score, level, spread, conf, readers}; noul {yes, spread, readers}
    """
    answers = [r[question] for r in readers]
    # a choice: the majority option, how many orders gave it, the mean confidence
    if kind == "choice":
        choice, agree = collections.Counter(a["choice"] for a in answers).most_common(1)[0]
        return {"choice": choice, "agree": agree, "conf": round(sum(a["confidence"] for a in answers) / 3, 3),
                "readers": [a["probabilities"] for a in answers]}
    # a score: the mean position, the nearest level, and how far apart the three positions are
    if kind == "score":
        scores = [a["score"] for a in answers]
        mean = sum(scores) / 3
        return {"score": round(mean, 2), "level": round(mean), "spread": round(max(scores) - min(scores), 2),
                "conf": round(sum(a["confidence"] for a in answers) / 3, 3), "readers": [a["probabilities"] for a in answers]}
    # a yes/no: the mean probability of yes, and how far apart the three are
    values = [a["noul"] for a in answers]
    return {"yes": round(sum(values) / 3, 3), "spread": round(max(values) - min(values), 3), "readers": values}


def value(answer, kind):
    """The comparable value of one raw answer: the option, the nearest level, or yes / no.

    @param answer: one pass's answer to one question
    @param kind: the question type
    @returns: a string, an int or a bool
    """
    if kind == "choice": return answer["choice"]
    if kind == "score": return round(answer["score"])
    return answer["noul"] > YES


def measure(articles, passes, kinds):
    """Per question: how often the three passes agree, how often a repeat changes the answer, what is used.

    @param articles: id → consolidated answers
    @param passes: pass number → id → answers
    @param kinds: question key → type
    @returns: the measurements as a dict
    """
    ids = sorted(articles, key=int)
    out = {}
    for q, kind in kinds.items():
        # the answer as a level, an option or a side of 0.5, compared across passes
        same = lambda a, ns: len({value(passes[n][a][q], kind) for n in ns}) == 1
        entry = {"passes_1_3_differ": sum(not same(a, (1, 2, 3)) for a in ids),
                 "repeat_changed": sum(not same(a, (1, 4)) for a in ids)}
        if kind == "choice":
            entry["usage"] = dict(collections.Counter(articles[a][q]["choice"] for a in ids).most_common())
        elif kind == "score":
            entry["usage"] = dict(sorted(collections.Counter(articles[a][q]["level"] for a in ids).items()))
            entry["mean_spread"] = round(sum(articles[a][q]["spread"] for a in ids) / len(ids), 3)
        else:
            entry["yes"] = sum(articles[a][q]["yes"] > YES for a in ids)
            entry["unsure_0.3_0.7"] = sum(0.3 <= articles[a][q]["yes"] <= 0.7 for a in ids)
        out[q] = entry
    return out


def cross_checks(articles):
    """Where two answers that should go together disagree: the fact choice against its yes/no twin, and source against act.

    @param articles: id → consolidated answers
    @returns: the counts and the article ids behind them
    """
    ids = sorted(articles, key=int)
    out = {}
    # a fact choice and its yes/no twin: count both directions of disagreement
    for fact, noul in (("result", "reports_his_result"), ("next_fight", "reports_his_next_fight"), ("health", "reports_his_health")):
        fact_only = [a for a in ids if articles[a]["fact"]["choice"] == fact and articles[a][noul]["yes"] <= YES]
        noul_only = [a for a in ids if articles[a]["fact"]["choice"] != fact and articles[a][noul]["yes"] > YES]
        out[fact] = {"fact_says_it_yes_no_denies": fact_only, "yes_no_says_it_fact_is_other": len(noul_only)}
    # act depends on source, among articles where he is at least one of several subjects
    himself_acts = {"speaks_of_himself", "answers_for_him"}
    central = [a for a in ids if articles[a]["centrality"]["score"] >= 1.5]
    def contradicts(a):
        source, act = articles[a]["source"]["choice"], articles[a]["act"]["choice"]
        return (act == "speaks_of_himself" and source != "himself") or (source == "himself" and act not in himself_acts)
    out["source_act_contradictions"] = [a for a in central if contradicts(a)]
    out["articles_central"] = len(central)
    # he speaks by the yes/no question against source = himself
    out["he_speaks_but_source_not_himself"] = sum(articles[a]["he_speaks"]["yes"] > YES and articles[a]["source"]["choice"] != "himself" for a in ids)
    out["source_himself_but_he_does_not_speak"] = sum(articles[a]["he_speaks"]["yes"] <= YES and articles[a]["source"]["choice"] == "himself" for a in ids)
    return out


def main():
    """Write the consolidated answers to golden/answers and the measurements beside this file."""
    passes = {n: load_pass(n) for n in (1, 2, 3, 4)}
    questions = json.load(open(os.path.join(HERE, "classifier-v4/questions.json")))
    kinds = {q: d["type"] for q, d in questions.items()}
    ids = sorted(set.intersection(*(set(p) for p in passes.values())), key=int)
    articles = {a: {q: combine([passes[n][a] for n in (1, 2, 3)], q, kind) for q, kind in kinds.items()} for a in ids}
    golden = {
        "source": "experiments/2026-09-27-axes-v4/classifier-v4/results-p1..3.json (nine questions; choices in three option orders, majority of three; scores and yes/no averaged); results-p4 repeats p1 for the noise floor",
        "note": "The v4 question set: centrality and firmness as scores, source / act / fact as choices, four yes/no questions on news about him. Machine answers, not labels.",
        "questions": {q: {"type": d["type"], "instructions": d["instructions"], "criteria": d.get("criteria")} for q, d in questions.items()},
        "articles": articles,
    }
    json.dump(golden, open(os.path.join(GOLDEN, "answers/classifier-v4.json"), "w"), indent=1, ensure_ascii=False)
    measures = measure(articles, passes, kinds)
    measures["cross_checks"] = cross_checks(articles)
    json.dump(measures, open(os.path.join(HERE, "measures.json"), "w"), indent=1, ensure_ascii=False)
    print(f"{len(ids)} articles consolidated -> golden/answers/classifier-v4.json")
    for q, m in measures.items():
        if q != "cross_checks": print(f"{q:24} {json.dumps(m, ensure_ascii=False)}")
    print(json.dumps(measures["cross_checks"], ensure_ascii=False))


main()
