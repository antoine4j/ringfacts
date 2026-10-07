"""Pick the answer-key articles: 60 golden articles, 40 to tune the classifier on and 20 held back.

    python3 select.py        # writes key-articles.json

The key must cover what the classifier gets wrong, not a random draw: the
ten articles already checked by hand for v5 and two known fact-trap cases go
in first, then a seeded draw fills quotas by fighter and language and makes
every v5 option of fact, source and act appear at least twice. At most one
article per claim, so no story counts twice. The claims used here must fall
on the tune side when the split is drawn (golden/README.md, split.json).
"""
import json, os, random, re, collections

HERE = os.path.dirname(os.path.abspath(__file__))
GOLDEN = os.path.join(HERE, "../../../golden")
SEED = 20260927
CHECKED = ["991", "90", "833", "683", "732", "349", "620", "261", "148", "953", "921", "4"]
QUOTA = {("Topuria", "en"): 16, ("Topuria", "es"): 12, ("Donchenko", "uk"): 11, ("Donchenko", "en"): 9,
         ("Amosov", "en"): 8, ("Amosov", "uk"): 4}
TOTAL, HELD_BACK = 60, 20


def language(article):
    """A rough language tag from the headline and the start of the text.

    @param article: a golden article
    @returns: "uk" for Cyrillic, "es" for Spanish markers, else "en"
    """
    text = (article["title"] or "") + " " + (article["body"] or "")[:400]
    if re.search("[а-яіїєґ]", text, re.I): return "uk"
    if re.search("[áéíóúñ¿¡]", text) or re.search(r"\b(el|la|los|las|del|que)\b", text): return "es"
    return "en"


def main():
    """Draw the key and write key-articles.json."""
    articles = {str(a["id"]): a for a in json.load(open(os.path.join(GOLDEN, "articles.json")))}
    v5 = json.load(open(os.path.join(GOLDEN, "answers/classifier-v5.json")))["articles"]
    claims = json.load(open(os.path.join(GOLDEN, "claims.json")))["claims"]
    claim_of = {str(a): c["key"] for c in claims for a in c["articles"]}
    cell = lambda a: (articles[a]["subject"].split()[-1], language(articles[a]))
    rng = random.Random(SEED)
    picked, used_claims = [], set()

    # the hand-checked articles first
    for a in CHECKED:
        picked.append(a); used_claims.add(claim_of[a])

    # then every v5 option of fact, source and act at least twice
    pool = [a for a in sorted(v5, key=int) if claim_of[a] not in used_claims]
    rng.shuffle(pool)
    for question in ("fact", "source", "act"):
        for option in sorted({v5[a][question]["choice"] for a in v5}):
            while sum(v5[a][question]["choice"] == option for a in picked) < 2:
                found = next((a for a in pool if v5[a][question]["choice"] == option and claim_of[a] not in used_claims), None)
                if not found: break
                picked.append(found); used_claims.add(claim_of[found])

    # then fill the fighter × language quotas
    have = collections.Counter(cell(a) for a in picked)
    for a in pool:
        if len(picked) >= TOTAL: break
        if claim_of[a] in used_claims or have[cell(a)] >= QUOTA.get(cell(a), 0): continue
        picked.append(a); used_claims.add(claim_of[a]); have[cell(a)] += 1

    # hold back 20 drawn from the non-hand-checked articles, so over-fitting shows
    rest = [a for a in picked if a not in CHECKED]
    held = set(rng.sample(rest, HELD_BACK))
    out = [{"id": a, "claim": claim_of[a], "fighter": articles[a]["subject"], "language": language(articles[a]),
            "part": "held_back" if a in held else "tune", "title": articles[a]["title"]} for a in picked]
    json.dump({"seed": SEED, "note": "the answer key's articles; their claims must fall on the tune side of the split",
               "articles": out}, open(os.path.join(HERE, "key-articles.json"), "w"), indent=1, ensure_ascii=False)
    print(f"{len(out)} articles, {len(used_claims)} claims; tune {sum(o['part']=='tune' for o in out)}, held back {len(held)}")
    print(collections.Counter(cell(a) for a in picked))
    for q in ("fact", "source", "act", "centrality"):
        print(q, dict(collections.Counter(v5[a][q]["choice"] for a in picked)))


main()
