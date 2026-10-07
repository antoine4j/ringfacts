"""Compose the bucket from six answers, novelty included.

The blind check said it in four words: "about him" is necessary but not
sufficient. An article can be entirely about the watched fighter and still be
worthless because everything in it was already known. So novelty gates first.
"""
import json, collections

ABOUT_HIM = {"the_subject", "one_of_several_subjects", "the_one_being_talked_about"}
NOT_ABOUT = {"naming_him_in_passing", "nothing_of_the_sort"}
NOT_IN_IT = {"mentioned_only", "not_in_the_article_body"}
JUDGED    = {"assessing_him", "calling_him_out", "defending_him", "steering_him_elsewhere",
             "he_tells_his_own_story", "he_gives_his_view"}
EVENT     = {"announcement", "result", "injury", "negotiation"}
FIRM      = {"official", "reported"}
EMPTY     = {"restates_known_facts", "filler_no_information", "nothing_about_him"}

def bucket(a):
    role, does, kind, src, nov = (a["role"], a["what_is_done"], a["news_kind"],
                                  a["sourcing"], a["novelty"])
    if nov in EMPTY:                    return 3, f"nothing new: {nov}"
    if role == "background" and does in JUDGED:
        role = "the_one_being_talked_about"
    if role in NOT_IN_IT:               return 3, role
    if does in NOT_ABOUT:               return 3, does
    if role == "background":            return 3, "he is only backdrop"
    if kind == "no_news_about_him":     return 3, "no news about him"
    if kind in EVENT and src in FIRM and role in ABOUT_HIM and nov == "new_and_substantial":
        return 1, f"{kind} + {src}"
    return 2, f"{does} by {a['whose_judgement']}"

if __name__ == "__main__":
    C = json.load(open("consensus-p10.json"))
    arts = {str(r["id"]): r for r in json.load(open("data/articles.json"))}
    QS = ["role", "whose_judgement", "what_is_done", "news_kind", "sourcing", "novelty"]
    L = {n: {str(r["id"]): r for r in json.load(open(f"results-p{n}.json")) if r.get("answers")} for n in (10,11,12)}
    out = {}
    for a in C:
        b, why = bucket({q: C[a][q]["choice"] for q in QS})
        per = [bucket({q: L[n][a]["answers"][q]["choice"] for q in QS})[0] for n in (10,11,12)]
        out[a] = {"bucket": b, "why": why, "stable": len(set(per)) == 1}
    json.dump(out, open("buckets-p10.json", "w"), indent=1)
    d = collections.Counter(v["bucket"] for v in out.values())
    print("BUCKETS with novelty      without (p7-9)")
    o = collections.Counter(v["bucket"] for v in json.load(open("buckets-p7.json")).values())
    for b in (1,2,3): print(f"  bucket {b}: {d[b]:>4} ({d[b]/300:>3.0%})        {o[b]:>4} ({o[b]/300:>3.0%})")
    st = sum(1 for v in out.values() if v["stable"])
    print(f"\n  bucket stable across three orders: {st}/300 ({st/300:.1%})   was 95.0%")

    blind = {**{k:1 for k in ["735","16"]},
             **{k:2 for k in ["368","807","208","490","794","778","327","817","1076","625"]},
             **{k:3 for k in ["224","247","937","560","743","520","609","605","1200","457"]}}
    amb = {"778","609","817"}
    ok  = sum(1 for k in blind if out[k]["bucket"] == blind[k])
    okx = sum(1 for k in blind if k not in amb and out[k]["bucket"] == blind[k])
    print(f"\n  BLIND CHECK: {ok}/22 ({ok/22:.0%})   excl. ambiguous {okx}/19 ({okx/19:.0%})")
    print(f"  (without novelty it was 17/22 and 16/19)")
    for k in sorted(blind, key=int):
        if out[k]["bucket"] != blind[k]:
            print(f"    #{k} mine={out[k]['bucket']} blind={blind[k]} [{out[k]['why']}]{' AMBIG' if k in amb else ''}  {arts[k]['title'][:46]}")
