"""Combine the v3 passes into golden/answers/classifier-v3.json and measure them.

    python3 consolidate.py

Passes 1-3 ask the same questions in three option orders; each answer is
the majority of the three, with how many agreed and each reader's
probabilities, in the same shape as golden/answers/classifier-v2.json.
Pass 4 repeats pass 1 exactly: comparing the two is the noise floor. The
measurements are printed and written to measures.json beside this file.
No model calls.
"""
import json, os, collections

HERE = os.path.dirname(os.path.abspath(__file__))
GOLDEN = os.path.join(HERE, "../../../golden")
MAIN = ["gate", "source", "act", "fact", "firmness"]


def load_pass(number):
    """Read one pass's answers.

    @param number: the pass number, 1 to 4
    @returns: article id → {question: answer}
    """
    rows = json.load(open(os.path.join(HERE, f"classifier-v3/results-p{number}.json")))
    return {r["id"]: r["answers"] for r in rows if r.get("answers")}


def vote(readers, question):
    """The majority answer of the three option orders for one question.

    @param readers: the three passes' answers for one article
    @param question: the question key
    @returns: {choice, agree, conf, readers} as in classifier-v2.json
    """
    choices = [r[question]["choice"] for r in readers]
    choice, agree = collections.Counter(choices).most_common(1)[0]
    confidence = sum(r[question]["confidence"] for r in readers) / len(readers)
    return {"choice": choice, "agree": agree, "conf": round(confidence, 3),
            "readers": [r[question]["probabilities"] for r in readers]}


def measure(articles, passes, questions):
    """Per question: how often the readers agree, how often a repeat changes the answer, what is used.

    @param articles: id → consolidated answers
    @param passes: pass number → id → answers
    @param questions: the question keys
    @returns: the measurements as a dict
    """
    ids = sorted(articles, key=int)
    out = {}
    for q in questions:
        out[q] = {
            "unanimous": sum(articles[a][q]["agree"] == 3 for a in ids),
            "repeat_changed": sum(passes[1][a][q]["choice"] != passes[4][a][q]["choice"] for a in ids),
            "order_changed": sum(len({passes[n][a][q]["choice"] for n in (1, 2, 3)}) > 1 for a in ids),
            "usage": dict(collections.Counter(articles[a][q]["choice"] for a in ids).most_common()),
        }
    # the paired fit questions against the main answer's confidence: does "none fits" say more than low confidence?
    for q in MAIN:
        fits = collections.defaultdict(list)
        for a in ids:
            fits[articles[a][q + "_fit"]["choice"]].append(articles[a][q]["conf"])
        out[q]["confidence_by_fit"] = {k: round(sum(v) / len(v), 3) for k, v in fits.items()}
    # act depends on source: count the answers that contradict that rule
    himself_acts = {"speaks_of_himself", "answers_for_him"}
    about = [a for a in ids if articles[a]["gate"]["choice"] != "not_about_him"]
    def contradicts(a):
        source, act = articles[a]["source"]["choice"], articles[a]["act"]["choice"]
        return (act == "speaks_of_himself" and source != "himself") or (source == "himself" and act not in himself_acts)
    out["source_act_contradictions"] = sum(contradicts(a) for a in about)
    out["articles_about_him"] = len(about)
    return out


def main():
    """Write the consolidated answers to golden/answers and the measurements beside this file."""
    passes = {n: load_pass(n) for n in (1, 2, 3, 4)}
    questions = json.load(open(os.path.join(HERE, "classifier-v3/questions.json")))
    ids = sorted(set.intersection(*(set(p) for p in passes.values())), key=int)
    articles = {a: {q: vote([passes[n][a] for n in (1, 2, 3)], q) for q in questions} for a in ids}
    golden = {
        "source": "research/experiments/2026-09-27-axes-v3/classifier-v3/results-p1..3.json (ten questions, three option orders, majority of three); results-p4 repeats p1 for the noise floor",
        "note": "The v3 question set: the five axes of golden/axes.md, each paired with a question on whether its options fit. Machine answers, not labels.",
        "questions": {q: {"instructions": d["instructions"], "options": d["criteria"]} for q, d in questions.items()},
        "articles": articles,
    }
    json.dump(golden, open(os.path.join(GOLDEN, "answers/classifier-v3.json"), "w"), indent=1, ensure_ascii=False)
    measures = measure(articles, passes, list(questions))
    json.dump(measures, open(os.path.join(HERE, "measures.json"), "w"), indent=1, ensure_ascii=False)
    print(f"{len(ids)} articles consolidated -> golden/answers/classifier-v3.json")
    for q in questions:
        m = measures[q]
        print(f"{q:14} unanimous {m['unanimous']:3}/300  order changed {m['order_changed']:3}  repeat changed {m['repeat_changed']:3}  | {m['usage']}")
        if "confidence_by_fit" in m: print(f"{'':14} mean confidence by fit: {m['confidence_by_fit']}")
    print(f"source/act contradictions: {measures['source_act_contradictions']} of {measures['articles_about_him']} articles not gated out")


main()
