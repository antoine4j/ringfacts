"""Build ruler v4 from v3: the singleton pass applied (Anton, 2026-09-27).

    python3 golden/tools/ruler-v4.py

Reads the kept v3 copies (golden/claims-v3.json, the experiment's
clusters-v3.json) and writes v4 to golden/claims.json and the experiment's
clusters.json. Re-running gives the same files.

The only grouping change: #565 (claim-067, a column built on Gaethje's
Sports Illustrated interview quotes) joins claim-054, the interview itself.
The other six singleton pairs stay as built. The body checks add no grouping
change; six pages saved twice are recorded as same_page_as.
"""
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
EXT = ROOT / "research/experiments/2026-09-20-claim-extraction"
MERGE_INTO, MERGE_FROM = "054", "067"
SAME_PAGE_AS = {"33": "13", "125": "115", "491": "490", "540": "533", "698": "692", "1129": "1125"}
NOTE = ("v4 = v3 with the singleton pass applied (verdicts.md, 2026-09-27): seven singleton pairs "
        "ruled, one join (#565 claim-067 into claim-054, 'for now'), six as built; fourteen body "
        "checks settled, six pages saved twice recorded as same_page_as. v3 kept as the -v3 copies.")
RULING = ("singleton pass: #565 (claim-067, Uncrowned column on Gaethje's SI interview) joins claim-054 "
          "— ruled 2026-09-27 'for now' (a column built on one interview's quotes joins it)")


def merged(clusters, prefix):
    """Return the cluster list with MERGE_FROM folded into MERGE_INTO.

    @param clusters: v3 cluster/claim dicts, each with key, articles, descriptions
    @param prefix: key prefix in this file, "claim-" (golden) or "story-" (experiment)
    @returns: a new list; the absorbed key is gone, the target keeps its key
    """
    into, gone = prefix + MERGE_INTO, prefix + MERGE_FROM
    source = next(c for c in clusters if c["key"] == gone)
    out = []
    for c in clusters:
        if c["key"] == gone:
            continue
        if c["key"] == into:
            c = json.loads(json.dumps(c))
            # the joined article, in id order; both Fable descriptions kept
            c["articles"] = sorted(set(c["articles"]) | set(source["articles"]), key=int)
            c["descriptions"] = c["descriptions"] + source["descriptions"]
            c["from"] = [into, gone]
            # golden claims carry Fable's per-pass reasoning: concatenate it
            if "fable" in c:
                for field in ("pass1_clusters", "pass1_confidence", "pass1_doubts"):
                    c["fable"][field] = c["fable"][field] + source["fable"][field]
        out.append(c)
    return out


def main():
    """Write v4 to both locations and print the counts."""
    golden = json.load(open(ROOT / "golden/claims-v3.json"))
    golden.update(version=4, built="2026-09-27", note=NOTE, same_page_as=SAME_PAGE_AS,
                  source="golden/claims-v3.json + golden/tools/ruler-v4.py",
                  applied_rulings=golden["applied_rulings"] + [RULING],
                  claims=merged(golden["claims"], "claim-"))
    json.dump(golden, open(ROOT / "golden/claims.json", "w"), indent=1, ensure_ascii=False)

    experiment = json.load(open(EXT / "clusters-v3.json"))
    experiment.update(version=4, built="2026-09-27", note=NOTE,
                      applied_rulings=experiment["applied_rulings"] + [RULING.replace("claim-", "story-")],
                      clusters=merged(experiment["clusters"], "story-"))
    json.dump(experiment, open(EXT / "clusters.json", "w"), indent=1, ensure_ascii=False)

    multi = sum(1 for c in golden["claims"] if len(c["articles"]) > 1)
    print(f"v4: {len(golden['claims'])} claims ({multi} multi, {len(golden['claims']) - multi} singletons), "
          f"{sum(len(c['articles']) for c in golden['claims'])} articles")


main()
