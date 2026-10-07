"""Offline measurements: what the classifier and extractor answers can and
cannot do for (a) grouping into golden claims and (b) the three buckets.

Reads golden/ and the two experiments read-only. No model calls. Writes
measures.json next to this file and prints a summary.
"""
import json, re, os, collections, itertools, math, importlib.util, datetime, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, "../../..")
G = os.path.join(ROOT, "golden"); CLS = os.path.join(ROOT, "research/experiments/2026-09-17-role-questions")
load = lambda p: json.load(open(p))
arts = {str(r["id"]): r for r in load(f"{G}/articles.json")}
claims = load(f"{G}/claims.json")["claims"]
CL = load(f"{G}/answers/classifier.json")["articles"]
EX = load(f"{G}/answers/extractor.json")["articles"]
QS = ["role", "whose_judgement", "what_is_done", "news_kind", "sourcing", "novelty"]
claim_of = {a: c["key"] for c in claims for a in c["articles"]}
OUT = {}

# ---------- A. ground truth for buckets: Anton's grading, golden articles only
gt = {}
for line in open(f"{ROOT}/docs/grading/2026-09-05-all-articles.md"):
    if not line.startswith("| [#"): continue
    cells = [c.strip() for c in line.strip().strip("|").split("|")]
    if len(cells) != 10: continue
    i = re.match(r"\[#(\d+)\]", cells[0]).group(1)
    cb = re.match(r"\*\*(\d)\*\*", cells[5]); cb = int(cb.group(1)) if cb else None
    an = cells[9]; reason = cells[6]
    # a dup row's bucket cell says 3 because it is a repeat; its CONTENT bucket is the root's, given in the dup-of cell
    root = re.search(r"\(bucket (\d)\)", cells[7])
    if reason == "dup" and root: cb = int(root.group(1))
    if not an: src, b = "reviewer-only", cb
    elif re.match(r"\s*[123]\b", an): src, b = "anton", int(an.strip()[0])
    elif "as graded" in an.lower() or "story ruled" in an.lower(): src, b = "anton-confirmed", cb
    else: src, b = "anton-words", cb
    if i in arts: gt[i] = {"bucket": b, "src": src, "reason": reason, "note": an[:160]}
for line in open(f"{ROOT}/docs/grading/2026-09-04-posted-30d.md"):
    m = re.match(r"\| \[#(\d+)\]\([^)]*\) \| [^|]*\| [^|]*\| [^|]*\| \*\*(\d)\*\* \| [^|]*\| ([^|]*)\|", line)
    if m and m.group(1) in arts and m.group(1) not in gt:
        an = m.group(3).strip(); d = re.match(r"\s*([123])\b", an)
        gt[m.group(1)] = {"bucket": int(d.group(1)) if d else int(m.group(2)), "src": "posted-30d", "reason": "", "note": an[:160]}
GT = {i: v for i, v in gt.items() if v["src"] != "reviewer-only" and v["bucket"]}
OUT["ground_truth"] = {"golden_articles_with_anton_bucket": len(GT),
    "by_source": dict(collections.Counter(v["src"] for v in GT.values())),
    "bucket_dist": dict(collections.Counter(v["bucket"] for v in GT.values())),
    "reason_dist": dict(collections.Counter(v["reason"] for v in GT.values()))}

# ---------- B. the current mapping (buckets3 rules + speaker demotion) on the final answers
spec = importlib.util.spec_from_file_location("b3", f"{CLS}/buckets3.py"); b3 = importlib.util.module_from_spec(spec); spec.loader.exec_module(b3)
spec = importlib.util.spec_from_file_location("sp", f"{CLS}/speakers.py"); sp = importlib.util.module_from_spec(spec); spec.loader.exec_module(sp)
def compose(ans, subject):
    b, why = b3.bucket({q: ans[q]["choice"] for q in QS})
    return sp.demote(b, ans["whose_judgement"]["choice"], subject), why
cur = {a: compose(CL[a]["answers"], arts[a]["subject"]) for a in arts}
golden_bucket = {a: CL[a]["bucket"] for a in arts}
OUT["current_mapping"] = {
    "recomputed_vs_golden_bucket_mismatch": sum(1 for a in arts if cur[a][0] != golden_bucket[a]),
    "dist_recomputed": dict(collections.Counter(b for b, _ in cur.values())),
    "dist_golden_file": dict(collections.Counter(golden_bucket.values()))}
def confusion(pred, truth):
    m = collections.Counter((truth[a], pred[a]) for a in truth)
    acc = sum(v for (t, p), v in m.items() if t == p) / len(truth)
    two_three = [a for a in truth if truth[a] in (2, 3)]
    acc23 = sum(1 for a in two_three if pred[a] == truth[a]) / max(1, len(two_three))
    return {"n": len(truth), "accuracy": round(acc, 3), "accuracy_2v3": round(acc23, 3),
            "matrix": {f"anton{t}->rules{p}": v for (t, p), v in sorted(m.items())}}
OUT["current_vs_anton"] = confusion({a: cur[a][0] for a in GT}, {a: GT[a]["bucket"] for a in GT})
OUT["golden_file_vs_anton"] = confusion({a: golden_bucket[a] for a in GT}, {a: GT[a]["bucket"] for a in GT})
OUT["current_vs_anton_errors"] = [{"id": a, "anton": GT[a]["bucket"], "rules": cur[a][0], "why": cur[a][1],
    "reason": GT[a]["reason"], "kind": EX[a].get("kind"), "role": CL[a]["answers"]["role"]["choice"],
    "does": CL[a]["answers"]["what_is_done"]["choice"], "who": CL[a]["answers"]["whose_judgement"]["choice"],
    "nov": CL[a]["answers"]["novelty"]["choice"], "title": arts[a]["title"][:80], "note": GT[a]["note"][:120]}
    for a in GT if cur[a][0] != GT[a]["bucket"]]

# ---------- C. which questions and options do anything
first = next(iter(arts))
opts = {q: sorted({CL[x]["answers"][q]["choice"] for x in arts} | set((CL[first]["answers"][q]["readers"] or [{}])[0].keys())) for q in QS}
usage = {q: dict(collections.Counter(CL[a]["answers"][q]["choice"] for a in arts)) for q in QS}
agree = {q: dict(collections.Counter(CL[a]["answers"][q]["agree"] for a in arts)) for q in QS}
conf = {q: round(sum(CL[a]["answers"][q]["conf"] for a in arts) / 300, 3) for q in QS}
# sensitivity: for how many articles would swapping this one answer (to any other option) change the bucket?
sens = {}
for q in QS:
    n_dep = 0; flips = collections.Counter()
    for a in arts:
        ans = {k: dict(v) for k, v in CL[a]["answers"].items()}; base = cur[a][0]; dep = False
        for o in opts[q]:
            if o == ans[q]["choice"]: continue
            ans2 = {k: dict(v) for k, v in ans.items()}; ans2[q]["choice"] = o
            b, _ = compose(ans2, arts[a]["subject"])
            if b != base: dep = True; flips[f"{ans[q]['choice']}->{o}: {base}->{b}"] += 1
        n_dep += dep
    sens[q] = {"articles_whose_bucket_depends_on_it": n_dep, "top_flips": flips.most_common(6)}
# options never used by the rules at all (present in the question, never in any rule set)
rule_sets = {"role": b3.ABOUT_HIM | b3.NOT_IN_IT | {"background"}, "what_is_done": b3.NOT_ABOUT | b3.JUDGED,
             "news_kind": b3.EVENT | {"no_news_about_him"}, "sourcing": b3.FIRM, "novelty": b3.EMPTY | {"new_and_substantial"},
             "whose_judgement": sp.STANDING}
unconsulted = {q: [o for o in opts[q] if o not in rule_sets.get(q, set())] for q in QS}
# redundancy: normalized mutual information between questions' answers
def H(xs):
    c = collections.Counter(xs); n = len(xs); return -sum(v / n * math.log2(v / n) for v in c.values())
def NMI(q1, q2):
    x = [CL[a]["answers"][q1]["choice"] for a in arts]; y = [CL[a]["answers"][q2]["choice"] for a in arts]
    hx, hy = H(x), H(y); hxy = H(list(zip(x, y))); mi = hx + hy - hxy
    return round(mi / min(hx, hy), 2) if min(hx, hy) else 0
nmi = {f"{q1}~{q2}": NMI(q1, q2) for q1, q2 in itertools.combinations(QS, 2)}
# single-question power against Anton's buckets: majority bucket per option (in-sample, n is small; a ceiling not a score)
power = {}
for q in QS:
    by = collections.defaultdict(collections.Counter)
    for a in GT: by[CL[a]["answers"][q]["choice"]][GT[a]["bucket"]] += 1
    right = sum(c.most_common(1)[0][1] for c in by.values())
    power[q] = {"best_single_question_accuracy": round(right / len(GT), 3),
                "per_option": {o: dict(c) for o, c in by.items()}}
# the extractor's kind as a bucket signal
kind_power = collections.defaultdict(collections.Counter)
for a in GT: kind_power[EX[a].get("kind")][GT[a]["bucket"]] += 1
OUT["questions"] = {"options": opts, "usage": usage, "reader_agreement": agree, "mean_confidence": conf,
    "bucket_sensitivity": sens, "options_no_rule_consults": unconsulted, "nmi": nmi, "single_question_power": power,
    "extractor_kind_vs_anton_bucket": {k: dict(c) for k, c in kind_power.items()},
    "extractor_kind_vs_classifier_news_kind": {k: dict(c) for k, c in
        {k: collections.Counter(CL[a]["answers"]["news_kind"]["choice"] for a in arts if EX[a].get("kind") == k) for k in sorted({EX[a].get("kind") for a in arts})}.items()},
    "extractor_kind_vs_rules_bucket": {k: dict(collections.Counter(cur[a][0] for a in arts if EX[a].get("kind") == k)) for k in sorted({EX[a].get("kind") for a in arts})}}

# ---------- D. grouping: which answers isolate the golden claims
def norm(s): return re.sub(r"[^a-z0-9а-яіїєґ ]", " ", (s or "").lower()).split()
def d(a): return datetime.date.fromisoformat(str(arts[a]["published_at"])[:10])
pairs = []
ids = sorted(arts, key=int)
for a, b in itertools.combinations(ids, 2):
    if arts[a]["subject"] != arts[b]["subject"]: continue
    gap = abs((d(a) - d(b)).days)
    pairs.append((a, b, gap, claim_of[a] == claim_of[b]))
window = [p for p in pairs if p[2] <= 3]
OUT["pairs"] = {"same_fighter_all": len(pairs), "same_claim_all": sum(1 for p in pairs if p[3]),
    "within_3_days": len(window), "same_claim_within_3_days": sum(1 for p in window if p[3]),
    "same_claim_beyond_3_days": sum(1 for p in pairs if p[3] and p[2] > 3),
    "beyond_3_day_examples": [(a, b, g, claim_of[a]) for a, b, g, s in pairs if s and g > 3][:12]}
def eq(x, y): return bool(x) and bool(y) and norm(x) == norm(y)
def jac(x, y):
    X, Y = set(norm(x)), set(norm(y)); return len(X & Y) / len(X | Y) if X and Y else 0
SIGNALS = {
    "ext.kind =": lambda a, b: EX[a].get("kind") == EX[b].get("kind"),
    "ext.actor =": lambda a, b: eq(EX[a].get("actor"), EX[b].get("actor")),
    "ext.opponent =": lambda a, b: eq(EX[a].get("opponent"), EX[b].get("opponent")),
    "ext.event =": lambda a, b: eq(EX[a].get("event"), EX[b].get("event")),
    "ext.date =": lambda a, b: eq(EX[a].get("date"), EX[b].get("date")),
    "ext.occasion = (exact)": lambda a, b: eq(EX[a].get("occasion"), EX[b].get("occasion")),
    "ext.occasion words overlap ≥ 0.5": lambda a, b: jac(EX[a].get("occasion"), EX[b].get("occasion")) >= 0.5,
    "ext.extract words overlap ≥ 0.5": lambda a, b: jac(EX[a].get("claim"), EX[b].get("claim")) >= 0.5,
    "ext.kind = and actor =": lambda a, b: EX[a].get("kind") == EX[b].get("kind") and eq(EX[a].get("actor"), EX[b].get("actor")),
    "ext.actor = and (opponent = or event =)": lambda a, b: eq(EX[a].get("actor"), EX[b].get("actor")) and (eq(EX[a].get("opponent"), EX[b].get("opponent")) or eq(EX[a].get("event"), EX[b].get("event"))),
    "cls.news_kind =": lambda a, b: CL[a]["answers"]["news_kind"]["choice"] == CL[b]["answers"]["news_kind"]["choice"],
    "cls.role =": lambda a, b: CL[a]["answers"]["role"]["choice"] == CL[b]["answers"]["role"]["choice"],
    "cls.what_is_done =": lambda a, b: CL[a]["answers"]["what_is_done"]["choice"] == CL[b]["answers"]["what_is_done"]["choice"],
    "cls.whose_judgement =": lambda a, b: CL[a]["answers"]["whose_judgement"]["choice"] == CL[b]["answers"]["whose_judgement"]["choice"],
    "cls.bucket =": lambda a, b: cur[a][0] == cur[b][0],
    "same outlet": lambda a, b: arts[a]["source"] == arts[b]["source"],
    "same day": lambda a, b: d(a) == d(b),
}
sig = {}
for name, f in SIGNALS.items():
    same = [p for p in window if p[3]]; diff = [p for p in window if not p[3]]
    ps = sum(1 for a, b, _, _ in same if f(a, b)) / len(same); pd = sum(1 for a, b, _, _ in diff if f(a, b)) / len(diff)
    tp = ps * len(same); fp = pd * len(diff)
    sig[name] = {"fires_on_same_claim": round(ps, 3), "fires_on_different_claim": round(pd, 3),
                 "precision_if_used_alone": round(tp / (tp + fp), 3) if tp + fp else None, "recall": round(ps, 3)}
OUT["grouping_signals_within_3_days"] = sig
# within-claim consistency: of the 47 multi-article claims, how many have ONE value of each field
multi = [c for c in claims if len(c["articles"]) > 1]
cons = {}
for field, getter in {"ext.kind": lambda a: EX[a].get("kind"), "ext.actor": lambda a: " ".join(norm(EX[a].get("actor"))),
                      "ext.opponent": lambda a: " ".join(norm(EX[a].get("opponent"))), "ext.event": lambda a: " ".join(norm(EX[a].get("event"))),
                      "ext.occasion": lambda a: " ".join(norm(EX[a].get("occasion"))), "ext.date": lambda a: EX[a].get("date"),
                      "cls.news_kind": lambda a: CL[a]["answers"]["news_kind"]["choice"], "cls.role": lambda a: CL[a]["answers"]["role"]["choice"],
                      "cls.what_is_done": lambda a: CL[a]["answers"]["what_is_done"]["choice"], "cls.whose_judgement": lambda a: CL[a]["answers"]["whose_judgement"]["choice"],
                      "cls.novelty": lambda a: CL[a]["answers"]["novelty"]["choice"], "rules bucket": lambda a: cur[a][0]}.items():
    one = sum(1 for c in multi if len({getter(a) for a in c["articles"]}) == 1)
    filled = sum(1 for c in multi if all(getter(a) for a in c["articles"]))
    cons[field] = {"claims_with_one_value": one, "of": len(multi), "claims_fully_filled": filled}
OUT["within_claim_consistency"] = cons
# bucket spread inside a claim: the same occasion landing in two buckets is a mapping problem, not a grouping one
spread = [{"key": c["key"], "buckets": sorted({cur[a][0] for a in c["articles"]}), "n": len(c["articles"]), "desc": c["descriptions"][0][:90]}
          for c in multi if len({cur[a][0] for a in c["articles"]}) > 1]
OUT["claims_split_across_buckets"] = {"count": len(spread), "of": len(multi), "examples": spread[:15]}
# extractor's kind vs the claim's ruled type: predictions merged claim-066, fight result claims etc.
OUT["kind_inside_claims"] = {c["key"]: dict(collections.Counter(EX[a].get("kind") for a in c["articles"])) for c in multi}

json.dump(OUT, open(f"{HERE}/measures.json", "w"), ensure_ascii=False, indent=1)
print(json.dumps({k: OUT[k] for k in ("ground_truth", "current_mapping", "current_vs_anton", "golden_file_vs_anton", "pairs")}, indent=1, ensure_ascii=False))
print("\nsensitivity:", {q: v["articles_whose_bucket_depends_on_it"] for q, v in sens.items()})
print("unconsulted:", unconsulted)
print("nmi:", nmi)
print("power:", {q: v["best_single_question_accuracy"] for q, v in power.items()})
print("\nsignals:"); [print(f"  {k:42} same {v['fires_on_same_claim']:.2f}  diff {v['fires_on_different_claim']:.2f}  prec {v['precision_if_used_alone']}") for k, v in sig.items()]
print("\nconsistency:"); [print(f"  {k:18} one value in {v['claims_with_one_value']}/{v['of']}  filled {v['claims_fully_filled']}") for k, v in cons.items()]
print("\nclaims split across buckets:", len(spread), "of", len(multi))
print("errors vs anton:", len(OUT["current_vs_anton_errors"]))
