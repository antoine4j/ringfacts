"""One-time import of the golden set from the two experiments that produced it.

Written at creation (2026-09-25). It is kept so a stranger can see exactly
where each golden file came from. Re-run it only when this import itself
changes (a new field carried over); the source experiments must not change.
"""
import json, re, datetime, pathlib

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
# the three readers behind the consensus: passes 16, 17, 18 (three option
# orders of the same questions); checked to reproduce every consensus choice
READERS = [16, 17, 18]
readers = {n: {str(r["id"]): r["answers"] for r in load(CLS / f"results-p{n}.json") if r.get("answers")} for n in READERS}
def answers_for(aid):
    out = {}
    for q, a in consensus[aid].items():
        out[q] = dict(a)
        out[q]["readers"] = [readers[n][aid][q].get("probabilities", {}) for n in READERS if aid in readers[n]]
    return out
dump("answers/classifier.json", {
    "source": "experiments/2026-09-17-role-questions/consensus-p16.json + buckets-final.json; per-reader probabilities from results-p16/17/18.json",
    "note": "Six questions, majority of three JEV readers over three option orders; bucket from buckets.py rules. `readers` = each reader's probability over every option.",
    "articles": {aid: {"bucket": buckets[aid], "answers": answers_for(aid)} for aid in consensus}})

# --- answers/questions.json: the six questions as asked, every option's text -
qs = load(CLS / "questions-p16.json")
dump("answers/questions.json", {
    "source": "experiments/2026-09-17-role-questions/questions-p16.json",
    "questions": {q: {"instructions": d.get("instructions", ""), "options": d.get("criteria", {})} for q, d in qs.items()}})

# --- answers/extractor.json: the candidate prompt's output (pass 4) ---------
p4 = load(EXT / "claims-p4.json")
p5 = {str(r["id"]): r for r in load(EXT / "claims-p5.json")}   # byte-identical replicate of pass 4: the noise floor
prompt = open(EXT / "prompt-p4.md").read()
block = prompt.split("Return JSON only, fields in this order:\n", 1)[1].split("\n}\n", 1)[0] + "\n}"
fields = json.loads(block)   # the prompt's own field definitions, verbatim
kind_text = re.search(r"One of: (.*)$", fields["kind"]).group(1)
kind_options = {}
for o in re.split(r"\s\|\s(?=[a-z_]+ \()", kind_text):
    name, why = o.strip().split(" ", 1)
    kind_options[name] = why.strip()[1:-1]   # strip the parentheses
assert len(kind_options) == 7, kind_options.keys()
def row(r):
    a = {k: v for k, v in r.items() if k != "id"}
    b = p5.get(str(r["id"]), {})
    a["second_run"] = {k: b.get(k) for k in ("kind", "claim", "occasion", "actor", "opponent", "event", "date")}
    return a
dump("answers/extractor.json", {
    "source": "experiments/2026-09-20-claim-extraction/claims-p4.json (prompt-p4.md, the candidate prompt); second_run from claims-p5.json, a byte-identical replicate",
    "note": "Field `claim` is the one-sentence extract; golden calls it the extract, since a golden claim is a group of articles. `second_run` is the same prompt run again unchanged: where it differs, the model was unsure.",
    "fields": fields, "kind_options": kind_options,
    "articles": {str(r["id"]): row(r) for r in p4}})

n = sum(len(c["articles"]) for c in claims)
assert n == 300 and len(consensus) == 300 and len(p4) == 300, (n, len(consensus), len(p4))
print("claims:", len(claims), "articles:", n)
