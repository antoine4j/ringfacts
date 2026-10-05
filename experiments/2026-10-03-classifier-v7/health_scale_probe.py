"""Can JEV tell the health levels apart? The health scale asked alone, beside what v7.7 already says.

    python3 health_scale_probe.py          # counts the articles, spends nothing
    python3 health_scale_probe.py --yes    # one call per article, training and validation (never the test side)

A feasibility probe, not a tuning round: the scale (golden/health-levels.json)
is sent as one score question and nothing else, and nothing is adopted from
it. Answers go to classifier-v7/raw/<id>-healthscale.json. Three answers are
compared with Anton's levels, an article being level 0 unless the file names
it: the probe's level, v7.7's "reports his health", and v7.7's "what new
fact" being health. Training articles are named; validation is only counted.
"""
import json, os, sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
import run

HEALTH = json.load(open(f"{run.GOLDEN}/health-levels.json"))
V7 = json.load(open(f"{run.GOLDEN}/answers/classifier-v7.json"))["articles"]
SCALE = {"healthscale": {
    "type": "score",
    "instructions": "What does this article's own news change for the health of the fighter named in `watched_fighter`? "
                    "Rate what the news changes, not how bad the injury is. A timeline or injury mentioned only in passing, "
                    "as background to other news, does not count.",
    "criteria": [HEALTH["scale"][str(level)] for level in range(5)],
}}


def level_of(out):
    """The probe's level for one article: the most probable step of the scale.

    @param out: the raw answer
    @returns: 0 to 4, or None when the call failed
    """
    if "_error" in out: return None
    probabilities = out["answers"]["healthscale"]["probabilities"]
    return int(max(probabilities, key=probabilities.get))


def line(name, said, keyed, ids, show):
    """Print one answer's agreement with the key at a threshold: hits, misses and false alarms.

    @param name: what the answer is
    @param said: id → True when the answer says yes at this threshold
    @param keyed: id → True when Anton's level says yes at this threshold
    @param ids: the articles counted
    @param show: whether to name the articles (training only)
    """
    hits = [i for i in ids if said[i] and keyed[i]]
    missed = [i for i in ids if keyed[i] and not said[i]]
    false = [i for i in ids if said[i] and not keyed[i]]
    named = lambda group: " (" + ", ".join("#" + i for i in group) + ")" if show and group else ""
    print(f"  {name:32} found {len(hits)} of {len(hits) + len(missed)}{named(missed) and ' missed' + named(missed)}"
          f"   false alarms {len(false)}{named(false)}")


def main():
    """Send the scale question once per article and compare the three answers with the levels."""
    side_of = json.load(open(f"{run.GOLDEN}/split.json"))["articles"]
    articles = [a for a in json.load(open(f"{run.GOLDEN}/articles.json")) if side_of[str(a["id"])] in ("tune", "check")]
    if "--yes" not in sys.argv: print(f"{len(articles)} articles; add --yes to spend."); return
    key = run.api_key()

    def work(article):
        path = f"{run.OUTDIR}/raw/{article['id']}-healthscale.json"
        if os.path.exists(path) and "_error" not in json.load(open(path)): return json.load(open(path))
        out = run.call(key, SCALE, run.state_of(article)); json.dump(out, open(path, "w")); return out
    with ThreadPoolExecutor(max_workers=10) as pool:
        outs = dict(zip([str(a["id"]) for a in articles], pool.map(work, articles)))
    failed = [i for i, out in outs.items() if "_error" in out]
    if failed: print(f"{len(failed)} calls failed: {failed[:5]}"); return

    keyed = {i: HEALTH["articles"].get(i, {"level": 0})["level"] for i in outs}
    probe = {i: level_of(outs[i]) for i in outs}
    flag = {i: V7[i]["reports_his_health"]["choice"] == "yes" for i in outs}
    fact = {i: V7[i]["fact"]["choice"] == "health" for i in outs}
    for side, label in (("tune", "training"), ("check", "validation")):
        ids = sorted((i for i in outs if side_of[i] == side), key=int)
        show = side == "tune"
        print(f"\n{label} ({len(ids)} articles; Anton's levels: {dict(sorted(Counter(keyed[i] for i in ids).items()))})")
        for threshold, meaning in ((1, "any health news (level 1+)"), (3, "an alert (level 3+)")):
            print(f" {meaning}")
            truth = {i: keyed[i] >= threshold for i in ids}
            line("health scale, alone", {i: probe[i] >= threshold for i in ids}, truth, ids, show)
            line("v7.7 reports his health", flag, truth, ids, show)
            line("v7.7 what new fact = health", fact, truth, ids, show)
        if show:
            print(" health scale level by Anton's level (rows Anton, columns probe)")
            for row in range(5):
                counts = Counter(probe[i] for i in ids if keyed[i] == row)
                if counts: print(f"  {row}: " + "  ".join(f"{col}:{counts[col]}" for col in range(5) if counts[col]))
            for i in ids:
                if keyed[i]: print(f"  #{i:5} Anton {keyed[i]}  probe {probe[i]}  "
                                   + " ".join(f"{p}" for p in outs[i]["answers"]["healthscale"]["probabilities"].values()))
    tokens = sum(out["usage"]["input_tokens"] for out in outs.values())
    print(f"\n{tokens:,} input tokens, about ${tokens * 0.042 / 1e6:.3f}")


if __name__ == "__main__": main()
