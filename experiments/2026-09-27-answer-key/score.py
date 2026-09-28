"""Score classifier runs against the answer key: per question, how often right, and which options swallow.

    python3 score.py runs/v5-p1.json runs/fact-a.json        # one block per question variant
    python3 score.py runs/fact-a.json --misses fact__a        # and list that variant's misses

A run's question keys may carry a variant suffix ("fact__a"): it is scored
against the key's "fact". A score answer counts as its nearest level, a
yes/no as yes above 0.5. Articles where the key's readers split are left
out of the accuracy and counted apart. "Swallows" is, per option the run
chose, how many of its articles the key puts elsewhere: an option that
takes many and is often wrong is a sink.
"""
import json, os, sys, collections

HERE = os.path.dirname(os.path.abspath(__file__))
LEVEL_NAMES = {"centrality": ["not_in_content", "only_mentioned", "one_of_several", "main_subject"],
               "firmness": ["none", "wish", "rumour", "reported", "official_or_done"],
               "firmness__four": ["wish", "rumour", "reported", "official_or_done"],
               "firmness__f5": ["wish", "rumour", "reported", "official_or_done"]}
# an option a variant added for what the key calls by another name: act's "only mentions him" is the guide's "none of these" (he is only mentioned)
ALIASES = {"act": {"only_mentions_him": "none_of_these"}}


def value_of(variant, answer):
    """A raw JEV answer as a key value.

    @param variant: the question key in the run, e.g. "firmness__four"; its levels are looked up by variant, then by question
    @param answer: the raw answer, or {"type": "value"} for one composed in code
    @returns: the option, the level name, or "yes" / "no"
    """
    if answer["type"] == "value": return answer["value"]
    if answer["type"] == "choice": return answer["choice"]
    if answer["type"] == "score":
        names = LEVEL_NAMES.get(variant) or LEVEL_NAMES[variant.split("__")[0]]
        return names[min(len(names) - 1, round(answer["score"]))]
    return "yes" if answer["noul"] > 0.5 else "no"


def compose(run):
    """Add how-firm composed in code: "none" where the fact answer is no_fact, else the firmness answer.

    One composed variant per pair of a firmness and a fact variant in the run, named "firmness__<f>+<fact>".
    @param run: a runs/*.json file's content; changed in place
    """
    for answers in run["answers"].values():
        if not answers: continue
        firms = [v for v in list(answers) if v.split("__")[0] == "firmness" and "+" not in v]
        facts = [v for v in list(answers) if v.split("__")[0] == "fact"]
        for f in firms:
            for x in facts:
                none = value_of(x, answers[x]) == "no_fact"
                answers[f"{f}+{x.split('__', 1)[1] if '__' in x else 'fact'}"] = {"type": "value", "value": "none" if none else value_of(f, answers[f])}


def score(run, key, variant):
    """One question variant of one run against the key.

    @param run: a runs/*.json file's content
    @param key: the key's articles
    @param variant: the question key in the run, e.g. "fact__a"
    @returns: accuracy per part, the options' swallow counts, the misses
    """
    question = variant.split("__")[0].split("+")[0]
    right, total, split = collections.Counter(), collections.Counter(), 0
    taken, wrong, misses = collections.Counter(), collections.Counter(), []
    for article_id, answers in run["answers"].items():
        if not answers or variant not in answers or article_id not in key: continue
        entry = key[article_id]["answers"].get(question)
        if not entry: continue
        if entry["value"] is None: split += 1; continue
        got, part = value_of(variant, answers[variant]), key[article_id]["part"]
        got = ALIASES.get(question, {}).get(got, got)
        total[part] += 1; taken[got] += 1
        if got == entry["value"]: right[part] += 1
        else: wrong[got] += 1; misses.append((article_id, part, entry["value"], got))
    return {"tune": (right["tune"], total["tune"]), "held_back": (right["held_back"], total["held_back"]), "split": split,
            "swallows": {o: (taken[o], wrong[o]) for o in taken}, "misses": misses}


def main():
    """Print a block per run and question variant."""
    key = json.load(open(os.path.join(HERE, "key.json")))["articles"]
    show = sys.argv[sys.argv.index("--misses") + 1] if "--misses" in sys.argv else None
    paths = [p for p in sys.argv[1:] if p.endswith(".json")]
    for path in paths:
        run = json.load(open(path))
        compose(run)
        variants = sorted({v for answers in run["answers"].values() if answers for v in answers})
        print(f"\n== {run['label']} ({run['part']})")
        for variant in variants:
            s = score(run, key, variant)
            pct = lambda r, t: f"{r}/{t} {100 * r / t:.0f}%" if t else "-"
            sinks = ", ".join(f"{o} {t}({w} wrong)" for o, (t, w) in sorted(s["swallows"].items(), key=lambda x: -x[1][1]) if w)
            print(f"  {variant:28} tune {pct(*s['tune']):12} held back {pct(*s['held_back']):12} split {s['split']:2} | wrong picks: {sinks}")
            if variant == show:
                for article_id, part, want, got in s["misses"]: print(f"      #{article_id:5} {part:9} key {want:18} run {got}")


if __name__ == "__main__":
    main()
