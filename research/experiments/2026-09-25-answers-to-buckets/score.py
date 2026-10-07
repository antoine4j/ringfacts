"""Score the v2 classifier and v2 extractor against the golden claims and Anton's buckets.

Reads measures.json (ground truth, old-rules results), classifier-v2/results-p*.json,
extractor-v2/results-p*.json. Writes scores.json. No model calls.
"""
import json, os, re, glob, collections, itertools, datetime, importlib.util
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = f"{HERE}/../../.."; G = f"{ROOT}/golden"
load = lambda p: json.load(open(p))
arts = {str(r["id"]): r for r in load(f"{G}/articles.json")}
claims = load(f"{G}/claims.json")["claims"]; claim_of = {a: c["key"] for c in claims for a in c["articles"]}
multi = [c for c in claims if len(c["articles"]) > 1]
M = load(f"{HERE}/measures.json")
CL_OLD = load(f"{G}/answers/classifier.json")["articles"]; EX_OLD = load(f"{G}/answers/extractor.json")["articles"]
spec = importlib.util.spec_from_file_location("m", f"{HERE}/measure.py")
OUT = {}

# ---- ground truth again (measure.py holds the parse; reuse its output through the error list is not enough, so re-derive)
gt = {}
for line in open(f"{ROOT}/docs/grading/2026-09-05-all-articles.md"):
    if not line.startswith("| [#"): continue
    cells = [c.strip() for c in line.strip().strip("|").split("|")]
    if len(cells) != 10: continue
    i = re.match(r"\[#(\d+)\]", cells[0]).group(1)
    cb = re.match(r"\*\*(\d)\*\*", cells[5]); cb = int(cb.group(1)) if cb else None
    an = cells[9]; reason = cells[6]; root = re.search(r"\(bucket (\d)\)", cells[7])
    if reason == "dup" and root: cb = int(root.group(1))
    if not an or i not in arts: continue
    if re.match(r"\s*[123]\b", an): src, b = "anton", int(an.strip()[0])
    elif "as graded" in an.lower() or "story ruled" in an.lower(): src, b = "anton-confirmed", cb
    else: src, b = "anton-words", cb
    if b: gt[i] = {"bucket": b, "src": src, "reason": reason}
for line in open(f"{ROOT}/docs/grading/2026-09-04-posted-30d.md"):
    m = re.match(r"\| \[#(\d+)\]\([^)]*\) \| [^|]*\| [^|]*\| [^|]*\| \*\*(\d)\*\* \| [^|]*\| ([^|]*)\|", line)
    if m and m.group(1) in arts and m.group(1) not in gt:
        an = m.group(3).strip(); d = re.match(r"\s*([123])\b", an)
        gt[m.group(1)] = {"bucket": int(d.group(1)) if d else int(m.group(2)), "src": "posted-30d", "reason": ""}
GT = gt; CLEAN = {i: v for i, v in gt.items() if v["reason"] != "dup"}   # rows not inherited from a repeat's root
OUT["ground_truth"] = {"all": len(GT), "clean_non_dup": len(CLEAN), "dist_all": dict(collections.Counter(v["bucket"] for v in GT.values())),
                       "dist_clean": dict(collections.Counter(v["bucket"] for v in CLEAN.values()))}

# ---- the old mapping on the old answers (from measure.py) for the same rows
spec = importlib.util.spec_from_file_location("b3", f"{ROOT}/research/experiments/2026-09-17-role-questions/buckets3.py"); b3 = importlib.util.module_from_spec(spec); spec.loader.exec_module(b3)
spec = importlib.util.spec_from_file_location("sp", f"{ROOT}/research/experiments/2026-09-17-role-questions/speakers.py"); sp = importlib.util.module_from_spec(spec); spec.loader.exec_module(sp)
QS_OLD = ["role", "whose_judgement", "what_is_done", "news_kind", "sourcing", "novelty"]
def old_bucket(a, gate=True):
    ans = {q: CL_OLD[a]["answers"][q]["choice"] for q in QS_OLD}; b, why = b3.bucket(ans)
    return (sp.demote(b, ans["whose_judgement"], arts[a]["subject"]) if gate else b), why

# ---- classifier v2: consensus over the passes that exist
QS = ["role", "speaker", "act", "kind", "depth"]
allp = {}
for f in sorted(glob.glob(f"{HERE}/classifier-v2/results-p*.json")):
    n = int(re.search(r"p(\d+)", f).group(1)); allp[n] = {r["id"]: r["answers"] for r in load(f) if r.get("answers")}
QSET = os.environ.get("QSET", "B")
passes = {n: v for n, v in allp.items() if (n <= 3 if QSET == "A" else n >= 4)}
OUT["classifier_passes"] = sorted(passes); OUT["question_set"] = QSET
def vote(a, q):
    ch = [passes[n][a][q]["choice"] for n in passes if a in passes[n]]
    cf = [passes[n][a][q]["confidence"] for n in passes if a in passes[n]]
    win, k = collections.Counter(ch).most_common(1)[0]; return win, k, round(sum(cf) / len(cf), 3)
CONS = {a: {q: vote(a, q) for q in QS} for a in arts if all(a in passes[n] for n in passes)}

ABOUT = {"the_subject", "one_of_several_subjects", "the_one_being_talked_about"}
NOT_ABOUT_ROLE = {"background", "mentioned_only", "not_in_the_article_body"}
NOT_ABOUT_ACT = {"naming_him_in_passing", "nothing", "he_speaks_of_others", "steering_him_elsewhere"}
EVENT = {"booking_official", "booking_reported", "result", "injury_or_medical"}
STANDING = {"himself", "his_coach_or_camp", "opponent_or_their_camp", "champion_or_promotion"}
NOT_ABOUT_ROLE |= {"one_of_many_on_a_list"}
def bucket_v2(ans, subject, gate=False, fix=True):
    """The proposed mapping. ans = {question: choice}. gate = the per-fighter speaker follow level.
    fix=False is the first draft (bucket 1 on kind alone); fix=True requires the EVENT to be the news, not a quote about it."""
    role, spk, act, kind, depth = (ans[q] for q in QS)
    if role in NOT_ABOUT_ROLE:              return 3, f"role: {role}"
    if depth == "nothing_about_him":        return 3, "depth: nothing about him"
    if act in NOT_ABOUT_ACT:                return 3, f"act: {act}"
    if kind == "no_news_about_him":         return 3, "kind: no news about him"
    if kind in EVENT and role in ABOUT:
        if not fix:                                                         return 1, f"kind: {kind}"
        if kind == "result" and act == "he_fought":                         return 1, "result, and the fight is the news"
        if kind != "result" and spk in {"nobody", "champion_or_promotion"}: return 1, f"{kind}, announced or reported, not a quote"
        if kind != "result" and act == "his_fight_week":                    return 1, f"{kind}, fight-week coverage"
    if depth == "a_line_or_two":            return 3, "depth: a line or two"
    if gate and subject not in sp.FOLLOW_ALL and spk not in STANDING: return 3, f"speaker without standing: {spk}"
    return 2, f"{act} by {spk}, {kind}"
def confusion(pred, truth):
    m = collections.Counter((truth[a], pred[a]) for a in truth); n = len(truth)
    acc = sum(v for (t, p), v in m.items() if t == p) / n
    tt = [a for a in truth if truth[a] in (2, 3)]; acc23 = sum(1 for a in tt if pred[a] == truth[a]) / max(1, len(tt))
    return {"n": n, "accuracy": round(acc, 3), "accuracy_2v3": round(acc23, 3), "matrix": {f"anton{t}->{p}": v for (t, p), v in sorted(m.items())}}
if CONS:
    new = {a: bucket_v2({q: CONS[a][q][0] for q in QS}, arts[a]["subject"]) for a in CONS}
    new_g = {a: bucket_v2({q: CONS[a][q][0] for q in QS}, arts[a]["subject"], gate=True) for a in CONS}
    draft = {a: bucket_v2({q: CONS[a][q][0] for q in QS}, arts[a]["subject"], fix=False) for a in CONS}
    old = {a: old_bucket(a) for a in arts}; old_ng = {a: old_bucket(a, gate=False) for a in arts}
    res = {}
    for label, pred in (("old rules + speaker gate (as shipped)", old), ("old rules, no gate", old_ng), ("v2 first draft, no gate", draft), ("v2 rules, no gate", new), ("v2 rules + speaker gate", new_g)):
        res[label] = {"all": confusion({a: pred[a][0] for a in GT if a in pred}, {a: GT[a]["bucket"] for a in GT if a in pred}),
                      "clean": confusion({a: pred[a][0] for a in CLEAN if a in pred}, {a: CLEAN[a]["bucket"] for a in CLEAN if a in pred}),
                      "dist_300": dict(collections.Counter(pred[a][0] for a in pred))}
    OUT["bucket_mapping"] = res
    OUT["v2_errors"] = [{"id": a, "anton": GT[a]["bucket"], "v2": new[a][0], "why": new[a][1], "old": old[a][0], "reason": GT[a]["reason"],
                         "answers": {q: CONS[a][q][0] for q in QS}, "title": arts[a]["title"][:70]} for a in GT if a in new and new[a][0] != GT[a]["bucket"]]
    OUT["v2_fixed_old_errors"] = [a for a in GT if a in new and old[a][0] != GT[a]["bucket"] and new[a][0] == GT[a]["bucket"]]
    OUT["v2_broke"] = [a for a in GT if a in new and old[a][0] == GT[a]["bucket"] and new[a][0] != GT[a]["bucket"]]
    # stability and usage
    stab = {q: dict(collections.Counter(CONS[a][q][1] for a in CONS)) for q in QS}
    OUT["classifier_v2"] = {"reader_agreement": stab, "mean_confidence": {q: round(sum(CONS[a][q][2] for a in CONS) / len(CONS), 3) for q in QS},
        "usage": {q: dict(collections.Counter(CONS[a][q][0] for a in CONS)) for q in QS},
        "bucket_stable_across_orders": (sum(1 for a in CONS if len({bucket_v2({q: passes[n][a][q]["choice"] for q in QS}, arts[a]["subject"])[0] for n in passes}) == 1) if len(passes) > 1 else None),
        "per_option_anton_bucket": {q: {o: dict(collections.Counter(GT[a]["bucket"] for a in GT if a in CONS and CONS[a][q][0] == o)) for o in sorted({CONS[a][q][0] for a in CONS})} for q in QS},
        "hatch_picks": sum(1 for a in CONS for q in QS if CONS[a][q][0] == "not_in_this_list")}
    # old vs new answers: where did role / act move
    OUT["old_new_crosstab"] = {"news_kind->kind": {k: dict(collections.Counter(CONS[a]["kind"][0] for a in CONS if CL_OLD[a]["answers"]["news_kind"]["choice"] == k)) for k in sorted({CL_OLD[a]["answers"]["news_kind"]["choice"] for a in arts})},
                               "novelty->depth": {k: dict(collections.Counter(CONS[a]["depth"][0] for a in CONS if CL_OLD[a]["answers"]["novelty"]["choice"] == k)) for k in sorted({CL_OLD[a]["answers"]["novelty"]["choice"] for a in arts})}}

# ---- extractor v2
exp = {}
for f in sorted(glob.glob(f"{HERE}/extractor-v2/results-p*.json")):
    n = int(re.search(r"p(\d+)", f).group(1)); exp[n] = {r["id"]: r for r in load(f)}
OUT["extractor_passes"] = sorted(exp)
def norm(s): return " ".join(re.sub(r"[^a-z0-9а-яіїєґ ]", " ", str(s or "").lower()).split())
def surname(s): 
    t = norm(s).split(); return t[-1] if t else ""
def d(a): return datetime.date.fromisoformat(str(arts[a]["published_at"])[:10])
if exp:
    E = exp[min(exp)]
    OUT["extractor_v2_fill"] = {k: sum(1 for a in E if E[a].get(k)) for k in ("facts", "occasion_type", "origin", "origin_person", "speaker", "occasion_date", "bout", "event", "key_quote", "predicted_winner", "odds")}
    OUT["extractor_v2_errors"] = sum(1 for a in E if E[a].get("error"))
    OUT["extractor_v2_kind_vs_old"] = {k: dict(collections.Counter(E[a].get("kind") for a in E if EX_OLD[a]["kind"] == k)) for k in sorted({EX_OLD[a]["kind"] for a in arts})}
    OUT["facts_per_article"] = dict(collections.Counter(len(E[a].get("facts") or []) for a in E))
    ids = sorted(arts, key=int); window = []
    for a, b in itertools.combinations(ids, 2):
        if arts[a]["subject"] == arts[b]["subject"] and abs((d(a) - d(b)).days) <= 3: window.append((a, b, claim_of[a] == claim_of[b]))
    def eq(x, y): return bool(norm(x)) and norm(x) == norm(y)
    def sur_eq(x, y): return bool(surname(x)) and surname(x) == surname(y)
    def jac(x, y):
        X, Y = set(norm(x).split()), set(norm(y).split()); return len(X & Y) / len(X | Y) if X and Y else 0
    def facts_text(a): return " ".join(E[a].get("facts") or [])
    def bout_eq(x, y):
        X = set(norm(x).replace(" vs ", " ").split()); Y = set(norm(y).replace(" vs ", " ").split()); return bool(X) and X == Y
    SIG = {
        "v2 speaker = (surname)": lambda a, b: sur_eq(E[a].get("speaker"), E[b].get("speaker")),
        "v2 origin_person = (surname)": lambda a, b: sur_eq(E[a].get("origin_person"), E[b].get("origin_person")),
        "v2 origin = (exact)": lambda a, b: eq(E[a].get("origin"), E[b].get("origin")),
        "v2 origin words overlap ≥ 0.5": lambda a, b: jac(E[a].get("origin"), E[b].get("origin")) >= 0.5,
        "v2 occasion_type =": lambda a, b: bool(E[a].get("occasion_type")) and E[a].get("occasion_type") == E[b].get("occasion_type") and E[a].get("occasion_type") != "unknown",
        "v2 speaker = and occasion_type =": lambda a, b: sur_eq(E[a].get("speaker"), E[b].get("speaker")) and bool(E[a].get("occasion_type")) and E[a].get("occasion_type") == E[b].get("occasion_type") and E[a].get("occasion_type") != "unknown",
        "v2 speaker = and origin_person =": lambda a, b: sur_eq(E[a].get("speaker"), E[b].get("speaker")) and sur_eq(E[a].get("origin_person"), E[b].get("origin_person")),
        "v2 speaker = and (origin_person = or origin overlap ≥ 0.5)": lambda a, b: sur_eq(E[a].get("speaker"), E[b].get("speaker")) and (sur_eq(E[a].get("origin_person"), E[b].get("origin_person")) or jac(E[a].get("origin"), E[b].get("origin")) >= 0.5),
        "v2 bout = and kind =": lambda a, b: bout_eq(E[a].get("bout"), E[b].get("bout")) and E[a].get("kind") == E[b].get("kind"),
        "v2 bout = and occasion_type =": lambda a, b: bout_eq(E[a].get("bout"), E[b].get("bout")) and bool(E[a].get("occasion_type")) and E[a].get("occasion_type") == E[b].get("occasion_type"),
        "v2 key_quote words overlap ≥ 0.5": lambda a, b: jac(E[a].get("key_quote"), E[b].get("key_quote")) >= 0.5,
        "v2 all facts words overlap ≥ 0.4": lambda a, b: jac(facts_text(a), facts_text(b)) >= 0.4,
        "v2 lead fact words overlap ≥ 0.5": lambda a, b: jac((E[a].get("facts") or [""])[0], (E[b].get("facts") or [""])[0]) >= 0.5,
        "v2 speaker = and (origin_person = or origin overlap) OR bout = and occasion_type =": lambda a, b:
            (sur_eq(E[a].get("speaker"), E[b].get("speaker")) and (sur_eq(E[a].get("origin_person"), E[b].get("origin_person")) or jac(E[a].get("origin"), E[b].get("origin")) >= 0.5))
            or (bout_eq(E[a].get("bout"), E[b].get("bout")) and bool(E[a].get("occasion_type")) and E[a].get("occasion_type") == E[b].get("occasion_type")),
        "old occasion = (exact)": lambda a, b: eq(EX_OLD[a].get("occasion"), EX_OLD[b].get("occasion")),
        "old extract words overlap ≥ 0.5": lambda a, b: jac(EX_OLD[a].get("claim"), EX_OLD[b].get("claim")) >= 0.5,
        "old kind = and actor =": lambda a, b: EX_OLD[a].get("kind") == EX_OLD[b].get("kind") and eq(EX_OLD[a].get("actor"), EX_OLD[b].get("actor")),
    }
    same = [p for p in window if p[2]]; diff = [p for p in window if not p[2]]
    sig = {}
    for name, f in SIG.items():
        ps = sum(1 for a, b, _ in same if f(a, b)) / len(same); pd = sum(1 for a, b, _ in diff if f(a, b)) / len(diff)
        tp, fp = ps * len(same), pd * len(diff)
        sig[name] = {"recall": round(ps, 3), "fires_on_different": round(pd, 3), "precision": round(tp / (tp + fp), 3) if tp + fp else None,
                     "false_merges": round(fp), "missed_pairs": round(len(same) - tp)}
    OUT["grouping_signals_v2"] = sig
    cons = {}
    for field, getter in {"occasion_type": lambda a: E[a].get("occasion_type"), "origin": lambda a: norm(E[a].get("origin")), "origin_person": lambda a: surname(E[a].get("origin_person")),
                          "speaker": lambda a: surname(E[a].get("speaker")), "bout": lambda a: norm(E[a].get("bout")), "occasion_date": lambda a: E[a].get("occasion_date"), "kind": lambda a: E[a].get("kind")}.items():
        cons[field] = {"one_value": sum(1 for c in multi if len({getter(a) for a in c["articles"]}) == 1), "filled_in_all": sum(1 for c in multi if all(getter(a) for a in c["articles"])), "of": len(multi)}
    OUT["within_claim_consistency_v2"] = cons
    OUT["claims_v2_fields"] = {c["key"]: [{"id": a, "type": E[a].get("occasion_type"), "origin": E[a].get("origin"), "person": E[a].get("origin_person"), "speaker": E[a].get("speaker"), "bout": E[a].get("bout")} for a in c["articles"]] for c in multi}
    if len(exp) > 1:
        E2 = exp[sorted(exp)[1]]
        OUT["extractor_replicate"] = {k: sum(1 for a in E if norm(E[a].get(k)) == norm(E2[a].get(k))) for k in ("kind", "occasion_type", "origin", "origin_person", "speaker", "bout", "key_quote")}
        OUT["extractor_replicate"]["lead_fact_identical"] = sum(1 for a in E if (E[a].get("facts") or [""])[0] == (E2[a].get("facts") or [""])[0])

json.dump(OUT, open(f"{HERE}/scores-{QSET}.json", "w"), ensure_ascii=False, indent=1)
print(json.dumps({k: v for k, v in OUT.items() if k in ("ground_truth", "bucket_mapping", "classifier_v2", "extractor_v2_fill", "extractor_v2_errors", "facts_per_article", "within_claim_consistency_v2", "extractor_replicate")}, indent=1, ensure_ascii=False)[:6000])
if "grouping_signals_v2" in OUT:
    print("\nsignals:"); [print(f"  {k:78} recall {v['recall']:.2f}  prec {v['precision']}  false merges {v['false_merges']}") for k, v in OUT["grouping_signals_v2"].items()]
