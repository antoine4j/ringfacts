"""Anton's speaker ruling (2026-09-18), applied as a per-fighter follow level.

His words: "I want to see by default 1, 2, 4, 5. But for some fighters I'd like
to see more... I'd like to hear about Donchenko and Amosov all of the categories."

So the speaker filter is not a global rule - it IS the per-fighter follow level.
A closely-followed fighter hears from everyone; a saturated one only from people
with standing. That is the same dial as the fighter-saturation problem.
"""
import json, collections

STANDING = {"himself", "an_opponent_or_their_camp",
            "the_champion_or_a_top_authority", "his_camp"}
FOLLOW_ALL = {"Daniil Donchenko", "Yaroslav Amosov"}     # his ruling; a setting, not a law

def demote(bucket, speaker, subject):
    """bucket 2 survives only if the speaker has standing, unless we follow the
    fighter closely enough to want everything."""
    if bucket != 2:                 return bucket
    if subject in FOLLOW_ALL:       return 2
    if speaker in STANDING:         return 2
    return 3

if __name__ == "__main__":
    C = json.load(open("consensus-p10.json")); B = json.load(open("buckets-p10.json"))
    arts = {str(r["id"]): r for r in json.load(open("data/articles.json"))}
    new = {a: demote(B[a]["bucket"], C[a]["whose_judgement"]["choice"], arts[a]["subject"]) for a in B}

    o = collections.Counter(B[a]["bucket"] for a in B); n = collections.Counter(new.values())
    print("                 before   after")
    for b in (1,2,3): print(f"  bucket {b}: {o[b]:>9}{n[b]:>8}")
    moved = [a for a in B if B[a]["bucket"] != new[a]]
    print(f"\n  moved out of the digest: {len(moved)}")
    print(f"  by fighter: {dict(collections.Counter(arts[a]['subject'] for a in moved))}")

    print("\n  daily volume, reweighted to the real archive (1,021 articles / 42 days):")
    true = {"Ilia Topuria": 903, "Daniil Donchenko": 99, "Yaroslav Amosov": 19}
    for label, f in (("before", B), ("after", None)):
        tot = 0
        for s, cnt in true.items():
            ids = [a for a in B if arts[a]["subject"] == s]
            hits = sum(1 for a in ids if (B[a]["bucket"] if f else new[a]) == 2)
            tot += cnt * hits / len(ids)
        print(f"    {label:7} {tot/42:>5.1f} digest items/day  ({tot/42*0.52:.1f} after dedup)")

    print("\n  a sample of what now drops out:")
    for a in moved[:6]:
        print(f"    #{a} [{C[a]['whose_judgement']['choice']}] {arts[a]['title'][:62]}")
    json.dump(new, open("buckets-final.json", "w"), indent=1)
