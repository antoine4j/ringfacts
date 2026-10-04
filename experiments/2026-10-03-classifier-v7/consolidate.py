"""Shape one v7 version's answers into golden/answers/classifier-v7.json, the file the claim map reads.

    python3 consolidate.py              # the standing version, v7.7 (round r7)
    python3 consolidate.py --round r6   # another stored round

Each answer is the value score.py grades: the raw answer with the ties of the
rules applied (score.compose), so the map shows what is scored. The raw
numbers stay beside it: a score's position, a yes/no's probability, every
option's probability. Only the training and validation sides were sent;
the test side has no answers until its one scoring run. No model calls.
"""
import json, os, sys, collections
import score

HERE = os.path.dirname(os.path.abspath(__file__))
GOLDEN = os.path.join(HERE, "../../golden")
VERSION_OF_ROUND = {"r4": "v7.4", "r5": "v7.5", "r6": "v7.6", "r7": "v7.7"}
NO_FIRMNESS = "No fact about him is asserted (the fact answer is no fact): set in code, not asked."
MERGED_ACT = ("nothing_regarding_him", "none_of_these")


def options_of(name, question):
    """Every value a question's scored answer can take, with what it means, in the question's own order.

    @param name: the question key
    @param question: the question as sent
    @returns: value → definition
    """
    kind = question["type"]
    if kind == "score":
        levels = {score.LEVELS[name][i]: level["summary"] if isinstance(level, dict) else level
                  for i, level in enumerate(question["criteria"])}
        return {"none": NO_FIRMNESS, **levels} if name == "firmness" else levels
    if kind == "noul":
        criteria = question.get("criteria") or {}
        return {"yes": f"probability of yes 50% or more. {criteria.get('true', '')}".strip(),
                "no": f"probability of yes under 50%. {criteria.get('false', '')}".strip()}
    options = {o: d["what"] if isinstance(d, dict) else (d or "") for o, d in question["criteria"].items()}

    # the key records "nothing regarding him" as "none of these", so the map shows them as one value
    if name == "act" and MERGED_ACT[0] in options:
        merged = options.pop(MERGED_ACT[0])
        options[MERGED_ACT[1]] = f"{merged} Also: {options.get(MERGED_ACT[1], '')}".strip()
    return options


def answer_of(name, raw, value):
    """One question's answer as the map reads it.

    @param name: the question key
    @param raw: the API's answer to this question
    @param value: the scored value, ties applied
    @returns: {choice, agree, conf, readers} plus score or yes
    """
    if raw["type"] == "noul":
        return {"choice": value, "yes": round(raw["noul"], 3), "agree": 1, "conf": round(max(raw["noul"], 1 - raw["noul"]), 3),
                "readers": [{"yes": raw["noul"], "no": round(1 - raw["noul"], 3)}]}
    if raw["type"] == "score":
        return {"choice": value, "score": raw["score"], "agree": 1, "conf": raw["confidence"],
                "readers": [{score.LEVELS[name][int(level)]: p for level, p in raw["probabilities"].items()}]}
    return {"choice": value, "agree": 1, "conf": raw["confidence"],
            "readers": [{score.RENAMED.get(o, o): p for o, p in raw["probabilities"].items()}]}


def main():
    """Write golden/answers/classifier-v7.json and print how each question is used."""
    round_name = sys.argv[sys.argv.index("--round") + 1] if "--round" in sys.argv else "r7"
    questions = json.load(open(os.path.join(HERE, f"classifier-v7/questions-{round_name}.json")))
    raw_dir = os.path.join(HERE, "classifier-v7/raw")
    ids = sorted((f.split("-")[0] for f in os.listdir(raw_dir) if f.endswith(f"-{round_name}.json")), key=int)

    # every stored article: the scored value of each of the nine questions, beside its raw numbers
    articles = {}
    for article_id in ids:
        raw = json.load(open(os.path.join(raw_dir, f"{article_id}-{round_name}.json")))
        if "_error" in raw: continue
        values = score.compose(raw["answers"])
        articles[article_id] = {q: answer_of(q, raw["answers"][q], values[q]) for q in score.QUESTIONS}
    version = VERSION_OF_ROUND.get(round_name, round_name)
    golden = {
        "source": f"experiments/2026-10-03-classifier-v7/classifier-v7/raw/*-{round_name}.json",
        "version": version, "passes": 1,
        "note": f"Classifier {version}: the 27 labelling rules written into the nine questions, tuned on the training set "
                "(experiments/2026-10-03-classifier-v7/README.md). Values are as scored, with the ties of the rules applied. "
                "Training and validation articles only; the test set has not been sent. Machine answers, not labels.",
        "questions": {q: {"type": questions[q]["type"], "instructions": questions[q]["instructions"],
                          "options": options_of(q, questions[q])} for q in score.QUESTIONS},
        "articles": articles,
    }
    json.dump(golden, open(os.path.join(GOLDEN, "answers/classifier-v7.json"), "w"), indent=1, ensure_ascii=False)
    print(f"{version}: {len(articles)} articles from round {round_name} -> golden/answers/classifier-v7.json")
    for q in score.QUESTIONS:
        print(f"  {q:24} {dict(collections.Counter(a[q]['choice'] for a in articles.values()).most_common())}")


if __name__ == "__main__": main()
