"""The fact question as one yes/no per kind of fact, combined in code, scored like a variant.

    python3 decompose.py variants/e6-fact-kinds.json

Reads the stored answers of a variants file whose variants are yes/no
questions named k_<kind> (sent with `variants.py <file> --yes`), turns them
into one fact answer per article under each combining rule below, stores
those as a variant set of their own (<tag>-combined) and scores them with
variants.compare, so they are judged exactly like any other wording. No
model calls.
"""
import json, os, sys
import run, variants

LINE = 0.5


def combined(kinds, control, base):
    """One article's fact answer under each combining rule.

    @param kinds: kind → probability of yes, from the k_<kind> questions
    @param control: the standing fact question's answer, from the same call
    @param base: the base round's answers for this article (its helper and flag questions)
    @returns: rule name → a choice answer
    """
    as_choice = lambda kind: {"type": "choice", "choice": kind, "probabilities": {**{k: 0.0 for k in control["probabilities"]}, kind: 1.0}}
    top = max(kinds, key=kinds.get)
    rules = {"control": control}

    # the most likely kind, or no fact when no kind reaches the line
    rules["kinds"] = as_choice(top if kinds[top] >= LINE else "no_fact")

    # a separate "is there a new fact at all" question decides first, then the most likely kind
    rules["kinds_gated"] = as_choice(top if base["h_new_fact"]["noul"] >= LINE else "no_fact")

    # the three news flags stand in for their kinds, the new questions for the rest
    flags = {**kinds, "next_fight": base["reports_his_next_fight"]["noul"], "result": base["reports_his_result"]["noul"], "health": base["reports_his_health"]["noul"]}
    best = max(flags, key=flags.get)
    rules["flags_and_kinds"] = as_choice(best if flags[best] >= LINE else "no_fact")

    # the standing choice, unless it says no fact and one kind is a confident yes
    rules["control_rescued"] = as_choice(top) if control["choice"] == "no_fact" and kinds[top] >= LINE else control

    # the standing choice, unless no kind reaches the line: then no fact
    rules["control_vetoed"] = as_choice("no_fact") if kinds[top] < LINE else control
    return rules


def main():
    """Combine the stored answers of one variants file and score each rule."""
    path = sys.argv[1]
    tag = os.path.basename(path).removesuffix(".json")
    side_of = json.load(open(f"{run.GOLDEN}/split.json"))["articles"]
    names = None
    for i in [i for i, side in side_of.items() if side in ("tune", "check")]:
        stored = json.load(open(f"{run.OUTDIR}/raw/{i}-v-{tag}.json"))["answers"]
        base = json.load(open(f"{run.OUTDIR}/raw/{i}-r4.json"))["answers"]
        kinds = {name[2:]: answer["noul"] for name, answer in stored.items() if name.startswith("k_")}
        rules = combined(kinds, stored["control"], base)

        # a second version of some kind questions, named k2_<kind>, replaces the first under the same rules
        if any(name.startswith("k2_") for name in stored):
            second = {**kinds, **{name[3:]: answer["noul"] for name, answer in stored.items() if name.startswith("k2_")}}
            rules.update({f"{rule}_k2": answer for rule, answer in combined(second, stored["control"], base).items() if rule != "control"})
        names = list(rules)
        json.dump({"answers": rules}, open(f"{run.OUTDIR}/raw/{i}-v-{tag}-combined.json", "w"))
    variants.compare("fact", names, f"{tag}-combined", "r4", False)


if __name__ == "__main__": main()
