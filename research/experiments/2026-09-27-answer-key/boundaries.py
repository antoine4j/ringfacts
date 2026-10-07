"""Group the articles where the readers differed by the boundary they differed on: boundaries.json.

    python3 boundaries.py

A boundary is one recurring judgement the readers split on, such as "is a
restated booking news of his next fight, or background?". Each article
where the readers differed goes to its first matching boundary, in the
order below; the review page shows them grouped, and the boundary briefs
are written per group. No model calls.
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
GOLDEN = os.path.join(HERE, "../../../golden")
BOUNDARIES = [
    ("next_fight", "Next fight: news, or background?",
     "Is a booked fight, a return date or someone's guess about his next fight the article's news, or context?"),
    ("health", "Health: news, or background?",
     "Is an injury or a recovery the article's news, or old news retold?"),
    ("result", "Result: news, or background?",
     "Is the outcome of a fight of his the article's news, or recalled as background?"),
    ("camp", "Opponent, or another fighter's side?",
     "Is the person speaking linked to a fight with him (opponent side), or another fighter or his camp?"),
    ("centrality", "How central is he?",
     "Main subject, one of several, only mentioned, or not in the content?"),
    ("act", "What does the source do regarding him?",
     "Gives news of him, steers him, assesses him, calls him out, or only mentions him?"),
    ("firmness", "Reported, or official?",
     "Is the fact settled (official or done) or only reported or rumoured?"),
    ("other", "Other single cases",
     "He speaks, media or fans, and other one-off splits."),
]


def boundary_of(answers):
    """The first boundary an article's disagreements fall on.

    @param answers: question → readers-v1 answer
    @returns: a boundary key, or None when the readers agreed on everything
    """
    differs = lambda q: answers[q]["status"] != "agreed"
    values = lambda q: set(answers[q].get("readers") or [])
    if differs("reports_his_next_fight") or (differs("fact") and "next_fight" in values("fact")): return "next_fight"
    if differs("reports_his_health") or (differs("fact") and "health" in values("fact")): return "health"
    if differs("reports_his_result") or (differs("fact") and "result" in values("fact")): return "result"
    if differs("source") and values("source") & {"opponent_side", "other_fighter_side", "other_fighter"}: return "camp"
    if differs("centrality"): return "centrality"
    if differs("act"): return "act"
    if differs("firmness") and not differs("fact"): return "firmness"
    return "other" if any(differs(q) for q in answers) else None


def main():
    """Write boundaries.json."""
    labels = json.load(open(os.path.join(GOLDEN, "answers/readers-v1.json")))["articles"]
    groups = {key: {"title": title, "question": question, "articles": []} for key, title, question in BOUNDARIES}
    for article_id in sorted(labels, key=int):
        key = boundary_of(labels[article_id]["answers"])
        if key: groups[key]["articles"].append(article_id)
    json.dump({"order": [k for k, _, _ in BOUNDARIES], "groups": groups}, open(os.path.join(HERE, "boundaries.json"), "w"), indent=1)
    for key, g in groups.items(): print(f"{len(g['articles']):3}  {g['title']}")


if __name__ == "__main__":
    main()
