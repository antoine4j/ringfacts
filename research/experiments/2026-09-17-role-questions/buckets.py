"""Compose the RingFacts bucket in code from the five classifier answers.

docs/goals.md:
  1 = career event, posted loud
  2 = substance about the fighter, goes in the digest
  3 = not for the group
Anton's hard line is 2 vs 3: *is the new information about HIM?*

Nothing here is a model. It is five answers and a few rules, which is the whole
point of the experiment - the open-set judgement ("which bucket?") is replaced by
closed-set questions plus code you can read and argue with.
"""
import json, collections, sys

NOT_ABOUT_HIM   = {"naming_him_in_passing", "nothing_of_the_sort"}
EVENT_KINDS     = {"announcement", "result", "injury", "negotiation"}
FIRM            = {"official", "reported"}

def bucket(a):
    """a = {question: choice} -> (bucket, reason)"""
    role, who, does, kind, src = (a["role"], a["whose_judgement"], a["what_is_done"],
                                  a["news_kind"], a["sourcing"])
    # 1 - something concrete happened to him, firmly sourced, and he is in the story
    if kind in EVENT_KINDS and src in FIRM and role != "background":
        return 1, f"{kind} + {src}"
    # 3 - the new information is not about him
    if role == "background":            return 3, "he is only backdrop"
    if does in NOT_ABOUT_HIM:           return 3, f"{does}"
    if kind == "no_news_about_him":     return 3, "no news about him"
    if role == "a_bystander" and src == "no_factual_claim":
        return 3, "bystander in someone else's story"
    # 2 - somebody with standing says something substantial about him
    return 2, f"{does} by {who}"

if __name__ == "__main__":
    C = json.load(open("consensus.json"))
    arts = {str(r["id"]): r for r in json.load(open("data/articles.json"))}
    ORDERS = [3, 5, 6]
    L = {n: {str(r["id"]): r for r in json.load(open(f"results-p{n}.json")) if r.get("answers")} for n in ORDERS}
    QS = ["role", "whose_judgement", "what_is_done", "news_kind", "sourcing"]

    out = {}
    for aid in C:
        b, why = bucket({q: C[aid][q]["choice"] for q in QS})
        per = [bucket({q: L[n][aid]["answers"][q]["choice"] for q in QS})[0] for n in ORDERS]
        out[aid] = {"bucket": b, "why": why, "per_order": per, "stable": len(set(per)) == 1,
                    "min_agree": min(C[aid][q]["agree"] for q in QS)}

    d = collections.Counter(v["bucket"] for v in out.values())
    print("COMPOSED BUCKETS (consensus answers)")
    for b in (1, 2, 3): print(f"  bucket {b}: {d[b]:>4}  ({d[b]/len(out):.0%})")

    print("\nDOES THE BUCKET SURVIVE REORDERING?")
    st = sum(1 for v in out.values() if v["stable"])
    print(f"  same bucket in all three option orders: {st} of {len(out)}  ({st/len(out):.1%})")
    print(f"  bucket flips somewhere:                 {len(out)-st}")
    # compare with answer-level stability
    anyflip = sum(1 for aid in C if any(C[aid][q]['agree'] < 3 for q in QS))
    print(f"  (articles with any ANSWER flip:         {anyflip})")
    print(f"  -> {anyflip-(len(out)-st)} articles have a wobbly answer but a steady bucket")

    print("\n  which bucket pairs the flips move between:")
    fc = collections.Counter(tuple(sorted(set(v["per_order"]))) for v in out.values() if not v["stable"])
    for k, n in fc.most_common(): print(f"    {k}: {n}")

    print("\nTOP REASONS PER BUCKET")
    for b in (1, 2, 3):
        c = collections.Counter(v["why"] for v in out.values() if v["bucket"] == b)
        print(f"  bucket {b}:")
        for w, n in c.most_common(5): print(f"    {n:>4}  {w}")

    json.dump(out, open("buckets.json", "w"), indent=1)
    print("\nwrote buckets.json")
