"""One-time import of the golden set from the two experiments that produced it.

Run once at creation (2026-09-25). It is kept so a stranger can see exactly
where each golden file came from; it is not part of the data and should not
be re-run unless the source experiments change, which they must not.
"""
import json, datetime, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
CLS = ROOT / "experiments/2026-09-17-role-questions"
EXT = ROOT / "experiments/2026-09-20-claim-extraction"
OUT = ROOT / "golden"
load = lambda p: json.load(open(p))
def dump(name, obj):
    json.dump(obj, open(OUT / name, "w"), ensure_ascii=False, indent=1)
    print("wrote", name)

# --- claims.json: the ruler v3, plus Fable's stored reasoning per claim -----
v3 = load(EXT / "clusters.json")
pass1 = {c["key"]: c for c in load(EXT / "clusters-pass1.json")["clusters"]}
pass2 = {c["key"]: c for c in load(EXT / "clusters-pass2.json")["clusters"]}
claims = []
for c in v3["clusters"]:
    # story-NNN in v3 came from sNNN in pass 2, which came from mNNN keys in pass 1
    base = c["key"].split(".")[0].replace("story-", "")
    p2 = pass2.get("s" + base, {})
    p1s = [pass1[k] for k in p2.get("from", []) if k in pass1]
    fable = {
        "pass1_confidence": [p["confidence"] for p in p1s],
        "pass1_doubts": [d for p in p1s for d in p.get("doubts", [])],
        "pass2_split_candidate": p2.get("split_candidate"),
    }
    row = {"key": c["key"].replace("story-", "claim-"), "fighter": c["fighter"],
           "articles": c["articles"], "descriptions": c["descriptions"], "fable": fable}
    if "from" in c:
        row["from"] = c["from"]
    claims.append(row)
dump("claims.json", {
    "built": datetime.date.today().isoformat(), "version": 3,
    "source": "experiments/2026-09-20-claim-extraction/clusters.json (v3), keys renamed story-→claim-",
    "note": v3["note"], "method": v3["method"], "applied_rulings": v3["applied_rulings"],
    "low_confidence_rulings": v3["low_confidence_rulings"],
    "unresolved_conflicts": v3["unresolved_conflicts"], "claims": claims})

# --- answers/classifier.json: the final classifier consensus + bucket --------
consensus = load(CLS / "consensus-p16.json")
buckets = load(CLS / "buckets-final.json")
dump("answers/classifier.json", {
    "source": "experiments/2026-09-17-role-questions/consensus-p16.json + buckets-final.json",
    "note": "Six questions, majority of three JEV readers over three option orders; bucket from buckets.py rules.",
    "articles": {aid: {"bucket": buckets[aid], "answers": consensus[aid]} for aid in consensus}})

# --- answers/extractor.json: the candidate prompt's output (pass 4) ---------
p4 = load(EXT / "claims-p4.json")
dump("answers/extractor.json", {
    "source": "experiments/2026-09-20-claim-extraction/claims-p4.json (prompt-p4.md, the candidate prompt)",
    "note": "Field `claim` is the one-sentence extract; golden calls it the extract, since a golden claim is a group of articles.",
    "articles": {str(r["id"]): {k: v for k, v in r.items() if k != "id"} for r in p4}})

n = sum(len(c["articles"]) for c in claims)
assert n == 300 and len(consensus) == 300 and len(p4) == 300, (n, len(consensus), len(p4))
print("claims:", len(claims), "articles:", n)
