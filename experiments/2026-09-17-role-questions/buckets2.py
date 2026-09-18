"""Compose the RingFacts bucket from the pass-7 answers. Rules only, no model.

Changes from buckets.py, each traceable to a spot-check finding:
  - `the_one_being_talked_about` is a real role, so a verdict on him counts even
    when the story is framed around somebody else  (all five reviewers)
  - `background` can no longer override a judgement of him                (A, B, E)
  - `naming_him_in_passing` vetoes a bucket-1 shout                          (D)
  - `preview` is not an event, so a card preview or weigh-in cannot shout     (D)
  - `mentioned_only` / `not_in_the_article_body` are clean bucket 3        (A, E)
  - NO agreement gate: ablation showed it cost one verdict every time it ran
"""
import json, collections

ABOUT_HIM  = {"the_subject", "one_of_several_subjects", "the_one_being_talked_about"}
NOT_ABOUT  = {"naming_him_in_passing", "nothing_of_the_sort"}
NOT_IN_IT  = {"mentioned_only", "not_in_the_article_body"}
JUDGED     = {"assessing_him", "calling_him_out", "defending_him", "steering_him_elsewhere",
              "he_tells_his_own_story", "he_gives_his_view"}
EVENT      = {"announcement", "result", "injury", "negotiation"}
FIRM       = {"official", "reported"}

def bucket(a):
    role, does, kind, src = a["role"], a["what_is_done"], a["news_kind"], a["sourcing"]
    if role == "background" and does in JUDGED:      # background cannot outvote a verdict
        role = "the_one_being_talked_about"
    if role in NOT_IN_IT:                    return 3, f"{role}"
    if does in NOT_ABOUT:                    return 3, f"{does}"
    if role == "background":                 return 3, "he is only backdrop"
    if kind == "no_news_about_him":          return 3, "no news about him"
    if kind in EVENT and src in FIRM and role in ABOUT_HIM:
        return 1, f"{kind} + {src}"
    return 2, f"{does} by {a['whose_judgement']}"

if __name__ == "__main__":
    C = json.load(open("consensus-p7.json"))
    arts = {str(r["id"]): r for r in json.load(open("data/articles.json"))}
    QS = ["role", "whose_judgement", "what_is_done", "news_kind", "sourcing"]
    L = {n: {str(r["id"]): r for r in json.load(open(f"results-p{n}.json")) if r.get("answers")} for n in (7,8,9)}

    out = {}
    for a in C:
        b, why = bucket({q: C[a][q]["choice"] for q in QS})
        per = [bucket({q: L[n][a]["answers"][q]["choice"] for q in QS})[0] for n in (7,8,9)]
        out[a] = {"bucket": b, "why": why, "per_order": per, "stable": len(set(per)) == 1}
    json.dump(out, open("buckets-p7.json", "w"), indent=1)

    d = collections.Counter(v["bucket"] for v in out.values())
    print("BUCKETS (pass 7-9 consensus)      was (pass 3-6)")
    oldB = json.load(open("buckets.json"))
    o = collections.Counter(v["bucket"] for v in oldB.values())
    for b in (1,2,3): print(f"  bucket {b}: {d[b]:>4}  ({d[b]/300:>3.0%})        {o[b]:>4}")
    st = sum(1 for v in out.values() if v["stable"])
    print(f"\nbucket survives all three option orders: {st} of 300 ({st/300:.1%})   was 93.3%")

    V = {}
    for g, dd in json.load(open("fable-verdicts.json")).items():
        if not g.startswith("_"): V.update(dd)
    ok = sum(1 for k in V if out[k]["bucket"] == V[k])
    print(f"\nagainst the {len(V)} Fable verdicts: {ok}/{len(V)} ({ok/len(V):.0%})")
    print("  (old answers + old rules 18/31 · old answers + fixed rules 28/31)")
    for k in sorted(V, key=int):
        if out[k]["bucket"] != V[k]:
            print(f"    #{k} fable={V[k]} mine={out[k]['bucket']} [{out[k]['why']}] {arts[k]['title'][:50]}")
    print("\nTOP REASONS PER BUCKET")
    for b in (1,2,3):
        c = collections.Counter(v["why"] for v in out.values() if v["bucket"]==b)
        print(f"  bucket {b}: " + "  ".join(f"{w}={n}" for w,n in c.most_common(4)))
