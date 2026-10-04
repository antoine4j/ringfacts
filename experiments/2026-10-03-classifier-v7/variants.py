"""Several wordings of one question, asked side by side in one call per article, scored in context.

    python3 variants.py variants/<name>.json --ids 991,90     # smoke test: every variant's answer beside the key
    python3 variants.py variants/<name>.json --yes            # training and validation sets, stored, scored
    python3 variants.py variants/<name>.json                  # score what is stored, no calls

A variants file is {"question": "<one of the nine>", "variants": {"<name>": <question>, ...}}.
The standing wording (classifier-v7/questions.json) is always sent too, as "control",
so every variant is compared under the same noise. Each variant's answer replaces
that question's answer in the base round (--base, default r3) and the nine answers
are composed with the ties, so a variant is judged by what it does to the whole
article. Training-set changes are listed by article and claim; validation-set
changes are only counted (STRATEGY.md, hard limit 2). The test side is never sent.
"""
import json, os, sys, collections
from concurrent.futures import ThreadPoolExecutor
import run, score


def claim_of():
    """Each golden article's claim.

    @returns: article id → claim key
    """
    return {a: c["key"] for c in json.load(open(f"{run.GOLDEN}/claims.json"))["claims"] for a in c["articles"]}


def load_variants(path):
    """The variants file, with the standing wording added as the control.

    @param path: the variants file
    @returns: (question name, variant name → question, tag used for stored answers)
    """
    spec = json.load(open(path))
    question = spec["question"]
    standing = json.load(open(f"{run.OUTDIR}/questions.json"))[question]
    return question, {"control": standing, **spec["variants"]}, os.path.basename(path).removesuffix(".json")


def ask(articles, variants, tag):
    """Send every variant in one call per article, reusing stored answers.

    @param articles: the articles to send
    @param variants: variant name → question
    @param tag: the name stored answers are kept under
    @returns: article id → API response
    """
    key = run.api_key()
    def work(article):
        path = f"{run.OUTDIR}/raw/{article['id']}-v-{tag}.json"
        if os.path.exists(path) and "_error" not in json.load(open(path)): return json.load(open(path))
        out = run.call(key, variants, run.state_of(article)); json.dump(out, open(path, "w")); return out
    with ThreadPoolExecutor(max_workers=10) as pool: outs = list(pool.map(work, articles))
    tokens = sum(o["usage"]["input_tokens"] for o in outs if "usage" in o)
    errors = [a["id"] for a, o in zip(articles, outs) if "_error" in o]
    print(f"{len(outs)} articles, {len(errors)} errors {errors[:5]}, {tokens:,} input tokens, about ${tokens * 0.042 / 1e6:.3f}")
    return {str(a["id"]): o for a, o in zip(articles, outs)}


def smoke(articles, question, variants):
    """Print each variant's answer for a few articles, beside the key.

    @param articles: the articles named by --ids
    @param question: the question the variants are of
    @param variants: variant name → question
    """
    labels, _, _, _ = score.load(lambda i: "")
    key = run.api_key()
    for article in articles:
        out = run.call(key, variants, run.state_of(article))
        print(f"\n#{article['id']} key {labels[str(article['id'])]['answers'][question]} | {article['title'][:80]}")
        if "_error" in out: print("  ERROR", out["_error"]); continue
        for name, answer in out["answers"].items():
            shown = f"yes {answer['noul']:.2f}" if answer["type"] == "noul" else score.plain_value(question, answer) if answer["type"] == "score" else answer["choice"]
            extra = f"  score {answer['score']:.2f}" if answer["type"] == "score" else f"  conf {answer['confidence']:.2f}" if answer["type"] == "choice" else ""
            print(f"  {name:20} {shown}{extra}")


def compare(question, names, tag, base):
    """Score each stored variant inside the base round's answers and print the comparison.

    @param question: the question the variants are of
    @param names: the variant names, control first
    @param tag: the name stored answers are kept under
    @param base: the round whose other answers each variant is composed with
    """
    labels, side_of, flips, raw = score.load(lambda i: f"{run.OUTDIR}/raw/{i}-{base}.json")
    stored = {i: json.load(open(p))["answers"] for i in raw if os.path.exists(p := f"{run.OUTDIR}/raw/{i}-v-{tag}.json")}
    claims, titles = claim_of(), {str(a["id"]): a["title"] for a in json.load(open(f"{run.GOLDEN}/articles.json"))}

    # each variant's answers composed into whole articles: is this question right, are all nine right
    def judged(i, name):
        out = score.compose({**raw[i], question: stored[i][name]})
        right = {q: score.grade(q, out[q], labels[i]["answers"][q], flips.get((i, q), {labels[i]["answers"][q]})) == "right" for q in score.QUESTIONS}
        return right[question], all(right.values()), out[question]
    for side in ("tune", "check"):
        ids = [i for i in stored if side_of[i] == side]
        print(f"\n{side}: {len(ids)} articles   (question right / all nine right)")
        control = {i: judged(i, "control") for i in ids}
        for name in names:
            mine = {i: judged(i, name) for i in ids}
            won = [i for i in ids if mine[i][0] and not control[i][0]]
            lost = [i for i in ids if control[i][0] and not mine[i][0]]
            won9 = [i for i in ids if mine[i][1] and not control[i][1]]
            lost9 = [i for i in ids if control[i][1] and not mine[i][1]]
            in_claims = lambda found: f"{len(found)} in {len({claims[i] for i in found})} claims"
            print(f"  {name:20} {sum(m[0] for m in mine.values()):3} / {sum(m[1] for m in mine.values()):3}"
                  f"   question: +{in_claims(won)}, -{in_claims(lost)}   all nine: +{in_claims(won9)}, -{in_claims(lost9)}")

            # training side only: which articles moved on this question, so the change can be read
            if side == "tune" and name != "control":
                for i in won + lost:
                    sign = "+" if i in won else "-"
                    print(f"      {sign} #{i:5} {claims[i]:12} key {labels[i]['answers'][question]:18} got {mine[i][2]:18} {titles[i][:60]}")


def main():
    """Read the command line, send or score."""
    question, variants, tag = load_variants(sys.argv[1])
    articles = run.chosen_articles(json.load(open(f"{run.GOLDEN}/articles.json"))) if "--ids" in sys.argv else None
    if articles is not None: return smoke(articles, question, variants)
    if "--yes" in sys.argv:
        side_of = json.load(open(f"{run.GOLDEN}/split.json"))["articles"]
        ask([a for a in json.load(open(f"{run.GOLDEN}/articles.json")) if side_of[str(a["id"])] in ("tune", "check")], variants, tag)
    base = sys.argv[sys.argv.index("--base") + 1] if "--base" in sys.argv else "r3"
    compare(question, list(variants), tag, base)


if __name__ == "__main__": main()
