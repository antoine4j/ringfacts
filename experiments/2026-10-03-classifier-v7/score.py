"""Score a classifier round against the frozen key (golden/labels.json). No model calls.

    python3 score.py --round r1                 # tune and check, question by question
    python3 score.py --round r1 --errors fact   # the tune-side misses on one question, to read
    python3 score.py --v6                       # the v6 answers through the same scoring
    python3 score.py --selfcheck                # the scoring rules, checked on made-up answers

The classifier answers each question alone, so the ties between answers that
the labelling rules require (golden/rules.md, "No fact means nothing else
either") are applied here, in compose(). An answer is right when it equals
the key or a value accepted by golden/coin-flips.json; near when it is one
step away on an ordered scale (how central, how firm); far otherwise. Errors
are only ever listed for the tune side: check is scored, never read.
"""
import json, os, sys, collections

HERE = os.path.dirname(os.path.abspath(__file__))
GOLDEN = f"{HERE}/../../golden"
QUESTIONS = ["centrality", "source", "act", "fact", "firmness", "reports_his_result",
             "reports_his_next_fight", "reports_his_health", "he_speaks"]
LEVELS = {"centrality": ["not_in_content", "only_mentioned", "one_of_several", "main_subject"],
          "firmness": ["wish", "rumour", "reported", "official_or_done"]}
ORDER = {"centrality": LEVELS["centrality"], "firmness": ["none"] + LEVELS["firmness"]}
FLAG_OF_FACT = {"result": "reports_his_result", "next_fight": "reports_his_next_fight", "health": "reports_his_health"}
RENAMED = {"nothing_regarding_him": "none_of_these", "only_mentions_him": "none_of_these", "other_fighter": "other_fighter_side"}


def plain_value(question, answer):
    """One raw answer as a key value, before any tie is applied.

    @param question: the question name
    @param answer: the API's answer to one question
    @returns: an option name, a level name, or "yes" / "no"
    """
    if answer["type"] == "noul": return "yes" if answer["noul"] >= 0.5 else "no"
    if answer["type"] == "choice": return RENAMED.get(answer["choice"], answer["choice"])
    return LEVELS[question][min(3, max(0, round(answer["score"])))]


def next_best(answer, without):
    """The most likely option of a choice once one option is ruled out.

    @param answer: the API's answer to a choice question
    @param without: the option name ruled out
    @returns: the next most likely option, as a key value
    """
    rest = {option: p for option, p in answer["probabilities"].items() if option != without}
    return RENAMED.get(max(rest, key=rest.get), max(rest, key=rest.get))


def compose(raw, ties=True):
    """The nine answers for one article, with the ties the rules require.

    @param raw: the API's answers for one article, by question
    @param ties: False to return the answers as given
    @returns: question → value
    """
    out = {q: plain_value(q, raw[q]) for q in QUESTIONS}
    if not ties: return out

    # he is not in the text: nothing is reported about him and he does not speak
    if out["centrality"] == "not_in_content": out["fact"], out["he_speaks"] = "no_fact", "no"

    # no fact: nothing is firm, no news question is yes, and nobody gives news of him
    if out["fact"] == "no_fact":
        out["firmness"] = "none"
        for flag in FLAG_OF_FACT.values(): out[flag] = "no"
        if out["act"] == "gives_news_of_him": out["act"] = next_best(raw["act"], "gives_news_of_him")

    # a result, next fight or health fact answers its own yes/no question
    if out["fact"] in FLAG_OF_FACT: out[FLAG_OF_FACT[out["fact"]]] = "yes"

    # a result is an account of the fight: an event, with nobody as its source, and done
    if out["fact"] == "result": out["source"], out["act"], out["firmness"] = "no_one", "reports_an_event", "official_or_done"
    return out


def grade(question, got, key, accepted):
    """How one answer compares with the key.

    @param question: the question name
    @param got: the classifier's value
    @param key: the key's value
    @param accepted: the values counted as right (the key, or a coin flip's pair)
    @returns: "right", "near" or "far"
    """
    if got in accepted: return "right"
    scale = ORDER.get(question)
    if scale and got in scale and key in scale and abs(scale.index(got) - scale.index(key)) == 1: return "near"
    return "far"


def load(raw_path):
    """The key, the split, the coin flips and one round's raw answers.

    @param raw_path: a function from article id to that round's raw answer file
    @returns: (labels, side of each article, accepted values per coin flip, raw answers by article)
    """
    labels = json.load(open(f"{GOLDEN}/labels.json"))["articles"]
    side_of = json.load(open(f"{GOLDEN}/split.json"))["articles"]
    flips = {(f["id"], f["question"]): set(f["accepted"]) for f in json.load(open(f"{GOLDEN}/coin-flips.json"))["flips"]}
    raw = {i: json.load(open(raw_path(i)))["answers"] for i in labels if os.path.exists(raw_path(i))}
    return labels, side_of, flips, raw


def report(labels, side_of, flips, raw, ties):
    """Print the scores of the tune and check sides, question by question."""
    for side in ("tune", "check"):
        ids = [i for i in raw if side_of[i] == side]
        if not ids: continue
        print(f"\n{side}: {len(ids)} articles" + ("" if ties else " (answers as given, no ties)"))
        perfect = collections.Counter()
        for question in QUESTIONS:
            counts, misses = collections.Counter(), collections.Counter()
            for i in ids:
                key = labels[i]["answers"][question]; got = compose(raw[i], ties)[question]
                result = grade(question, got, key, flips.get((i, question), {key}))
                counts[result] += 1; perfect[i] += result == "right"
                if result == "far": misses[f"{key}>{got}"] += 1
            top = ", ".join(f"{pair} {n}" for pair, n in misses.most_common(3))
            print(f"  {question:24} right {counts['right']:3} ({counts['right'] / len(ids):4.0%})  near {counts['near']:2}  far {counts['far']:3}   {top}")
        print(f"  all nine right: {sum(n == 9 for n in perfect.values())} of {len(ids)}")


def errors(labels, side_of, flips, raw, question):
    """Print the tune-side misses on one question, with the titles, for reading."""
    titles = {str(a["id"]): a["title"] for a in json.load(open(f"{GOLDEN}/articles.json"))}
    for i in sorted(raw, key=int):
        if side_of[i] != "tune": continue
        key = labels[i]["answers"][question]; got = compose(raw[i])[question]
        if grade(question, got, key, flips.get((i, question), {key})) != "right":
            print(f"#{i:5} key {key:20} got {got:20} {titles[i][:80]}")


def selfcheck():
    """Check the ties and the grading on made-up answers."""
    choice = lambda c, p=None: {"type": "choice", "choice": c, "probabilities": p or {c: 1.0}}
    noul = lambda v: {"type": "noul", "noul": v}
    score = lambda s: {"type": "score", "score": s}
    raw = {"centrality": score(2.6), "source": choice("other_fighter"),
           "act": choice("gives_news_of_him", {"gives_news_of_him": 0.6, "assesses_him": 0.3, "nothing_regarding_him": 0.1}),
           "fact": choice("no_fact"), "firmness": score(2.2), "reports_his_result": noul(0.1),
           "reports_his_next_fight": noul(0.9), "reports_his_health": noul(0.4), "he_speaks": noul(0.5)}
    out = compose(raw)
    assert out["centrality"] == "main_subject" and out["source"] == "other_fighter_side" and out["he_speaks"] == "yes"
    assert out["firmness"] == "none" and out["reports_his_next_fight"] == "no" and out["act"] == "assesses_him"
    assert compose(raw, ties=False)["reports_his_next_fight"] == "yes" and compose(raw, ties=False)["firmness"] == "reported"
    raw["fact"] = choice("result"); assert compose(raw)["source"] == "no_one" and compose(raw)["act"] == "reports_an_event"
    raw["fact"] = choice("health"); assert compose(raw)["reports_his_health"] == "yes" and compose(raw)["act"] == "gives_news_of_him"
    assert grade("centrality", "one_of_several", "main_subject", {"main_subject"}) == "near"
    assert grade("centrality", "only_mentioned", "main_subject", {"main_subject"}) == "far"
    assert grade("firmness", "wish", "none", {"none"}) == "near" and grade("fact", "health", "no_fact", {"no_fact"}) == "far"
    assert grade("fact", "status_update", "no_fact", {"no_fact", "status_update"}) == "right"
    print("selfcheck passed")


def main():
    """Read the command line and print the report asked for."""
    if "--selfcheck" in sys.argv: return selfcheck()
    if "--v6" in sys.argv: path = lambda i: f"{HERE}/../2026-09-27-axes-v6/classifier-v6/raw/{i}-p1.json"
    else:
        round_name = sys.argv[sys.argv.index("--round") + 1]
        path = lambda i: f"{HERE}/classifier-v7/raw/{i}-{round_name}.json"
    labels, side_of, flips, raw = load(path)
    if "--errors" in sys.argv: return errors(labels, side_of, flips, raw, sys.argv[sys.argv.index("--errors") + 1])
    report(labels, side_of, flips, raw, ties="--no-ties" not in sys.argv)


if __name__ == "__main__": main()
