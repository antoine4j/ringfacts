"""The framing experiment's tables: every version on the same denominators, side by side. No model calls.

Every number is "right of all" on one fixed set of articles or answers, so
rows compare directly. Changes are counted against the control (v7.7 sent
again in the same session); the stored v7.7 round against that control is the
noise row: what changes when nothing was changed. Validation is counted only.
"""
import json, os, collections
import framing
from framing import run, score

LANGUAGE_NAMES = {"es": "Spanish", "uk": "Ukrainian", "ru": "Russian", "en": "English", "pt": "Portuguese",
                  "ka": "Georgian", "other": "other"}
NOT_ABOUT_HIM = {"not_in_content", "only_mentioned"}


def grades(version, ids):
    """Each answer of one version marked right or not, after v7's ties.

    @param version: "stored" or one of framing.VERSIONS
    @param ids: the article ids to grade
    @returns: (id → question → True when right, id → the composed answers); missing files are left out
    """
    labels, _, flips, raw = score.load(framing.raw_path(version))
    right, answers = {}, {}
    for i in ids:
        if i not in raw: continue
        answers[i] = score.compose(raw[i])
        right[i] = {q: score.grade(q, answers[i][q], labels[i]["answers"][q],
                                   flips.get((i, q), {labels[i]["answers"][q]})) == "right" for q in score.QUESTIONS}
    return right, answers


def percent(part, whole):
    """A count as "N of M (P%)".

    @param part: the count
    @param whole: the denominator
    @returns: the formatted string
    """
    return f"{part:3} of {whole:3} ({part / max(1, whole):4.0%})"


def headline(sides, graded, versions):
    """Print articles with all nine right and answers right, per version and side, with the change from control."""
    print("\n1. ALL NINE RIGHT and ANSWERS RIGHT (change from control in brackets)")
    print(f"   {'version':26} {'training: all nine':26} {'validation: all nine':26} training answers right")
    for version in versions:
        cells = []
        for side in ("tune", "check"):
            ids = sides[side]; got = sum(all(graded[version][0][i].values()) for i in ids)
            base = sum(all(graded["control"][0][i].values()) for i in ids)
            cells.append(f"{percent(got, len(ids))} {got - base:+3}")
        answers = sum(sum(graded[version][0][i].values()) for i in sides["tune"])
        base = sum(sum(graded["control"][0][i].values()) for i in sides["tune"])
        total = len(sides["tune"]) * len(score.QUESTIONS)
        print(f"   {framing.NAMES[version]:26} {cells[0]:26} {cells[1]:26} {percent(answers, total)} {answers - base:+3}")


def changes(sides, graded, versions):
    """Print, per version, how many training answers differ from control and which way they moved."""
    total = len(sides["tune"]) * len(score.QUESTIONS)
    print(f"\n2. TRAINING ANSWERS THAT DIFFER FROM CONTROL (of {total}); 'stored' is the noise: nothing was changed")
    print(f"   {'version':26} {'differ':>7} {'fixed':>6} {'broken':>7} {'net':>5}")
    for version in versions:
        if version == "control": continue
        differ = fixed = broken = 0
        for i in sides["tune"]:
            for q in score.QUESTIONS:
                differ += graded[version][1][i][q] != graded["control"][1][i][q]
                fixed += graded[version][0][i][q] and not graded["control"][0][i][q]
                broken += graded["control"][0][i][q] and not graded[version][0][i][q]
        print(f"   {framing.NAMES[version]:26} {differ:7} {fixed:6} {broken:7} {fixed - broken:+5}")


def per_question(sides, graded, versions):
    """Print training answers right per question, one column per version."""
    print(f"\n3. TRAINING ANSWERS RIGHT PER QUESTION (of {len(sides['tune'])})")
    print("   " + f"{'question':24}" + "".join(f"{v:>10}" for v in versions))
    for q in score.QUESTIONS:
        print("   " + f"{score.NAMES[q]:24}" + "".join(f"{sum(graded[v][0][i][q] for i in sides['tune']):10}" for v in versions))


def pass_marks(sides, graded, versions, labels, claim_of):
    """Print the three pass marks per version and side: stories found, rumours called official, false alarms."""
    print("\n4. PASS MARKS (career-event stories found; rumours called official, mark 0; false alarms, mark 5%)")
    for side in ("tune", "check"):
        name = "training" if side == "tune" else "validation"
        for version in versions:
            ids = sides[side]; key = {i: labels[i]["answers"] for i in ids}; got = graded[version][1]
            stories = collections.defaultdict(list)
            for i in ids:
                if key[i]["fact"] in score.CAREER_FACTS: stories[claim_of[i]].append(got[i]["fact"] in score.CAREER_FACTS)
            official = sum(key[i]["firmness"] in score.WEAKER_THAN_OFFICIAL and got[i]["firmness"] == "official_or_done" for i in ids)
            quiet = [i for i in ids if key[i]["fact"] not in score.CAREER_FACTS]
            alarms = sum(got[i]["fact"] in score.CAREER_FACTS for i in quiet)
            found = sum(any(s) for s in stories.values())
            print(f"   {name:10} {framing.NAMES[version]:26} stories {found} of {len(stories)}   official {official}"
                  f"   false alarms {percent(alarms, len(quiet))}")


def guard(sides, graded, versions, labels):
    """Print how many articles not about him each version calls about him (training and validation together)."""
    ids = [i for side in ("tune", "check") for i in sides[side] if labels[i]["answers"]["centrality"] in NOT_ABOUT_HIM]
    print(f"\n5. GUARD: articles where he is only mentioned or absent, called 'one of several' or 'main subject' (of {len(ids)})")
    for version in versions:
        print(f"   {framing.NAMES[version]:26} {sum(graded[version][1][i]['centrality'] not in NOT_ABOUT_HIM for i in ids)}")


def by_language(articles, side_of, *versions):
    """Print all nine right and answers right per article language, one column per version, both sides counted together.

    @param articles: the training and validation articles
    @param side_of: id → side
    @param versions: the versions to show
    """
    language = {str(a["id"]): framing.language_of(a) for a in articles}
    graded = {v: grades(v, list(language)) for v in versions}
    print(f"\n6. BY LANGUAGE, training and validation together: all nine right / answers right")
    print("   " + f"{'language':12}{'articles':>9}" + "".join(f"{v:>26}" for v in versions))
    for lang, count in collections.Counter(language.values()).most_common():
        ids = [i for i in language if language[i] == lang]
        cells = []
        for v in versions:
            nine = sum(all(graded[v][0][i].values()) for i in ids); answers = sum(sum(graded[v][0][i].values()) for i in ids)
            cells.append(f"{nine / count:4.0%} / {answers / (count * len(score.QUESTIONS)):4.0%}")
        print("   " + f"{LANGUAGE_NAMES[lang]:12}{count:9}" + "".join(f"{c:>26}" for c in cells))


def full(articles, side_of):
    """Print every table of the experiment."""
    sides = {side: [str(a["id"]) for a in articles if side_of[str(a["id"])] == side] for side in ("tune", "check")}
    versions = ["stored"] + framing.VERSIONS
    ids = [i for side in sides.values() for i in side]
    graded = {v: grades(v, ids) for v in versions}
    missing = {v: len(ids) - len(graded[v][0]) for v in versions if len(graded[v][0]) < len(ids)}
    if missing: print(f"answers missing: {missing}"); return
    labels = json.load(open(f"{run.GOLDEN}/labels.json"))["articles"]
    claim_of = {a: c["key"] for c in json.load(open(f"{run.GOLDEN}/claims.json"))["claims"] for a in c["articles"]}
    headline(sides, graded, versions)
    changes(sides, graded, versions)
    per_question(sides, graded, versions)
    pass_marks(sides, graded, versions, labels, claim_of)
    guard(sides, graded, versions, labels)
    by_language(articles, side_of, *versions)
