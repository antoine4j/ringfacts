"""Does telling the classifier what it is reading change its answers? v7.7 with one or two added fields.

    python3 framing.py languages          # v7.7's stored answers by article language; spends nothing
    python3 framing.py run --yes          # control, sport and profile, one call per article each (training and validation)
    python3 framing.py report             # score what is stored, no calls

The questions are v7.7 exactly (questions-r7.json). Only the article fields
change: "sport" adds a field saying this is MMA news and the fighter is in the
UFC; "profile" adds that and a second field saying who the watched fighter is.
"control" is v7.7 sent again in the same session, the measure of today's noise.
Answers go to raw/ here (git-ignored); nothing in the v7 folder is written.
The test side is never sent. Validation is only counted, never listed.
"""
import json, os, re, sys, collections
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
V7 = f"{HERE}/../2026-10-03-classifier-v7"
sys.path.insert(0, V7)
import run, score  # noqa: E402  (v7's caller and scoring, imported unchanged)

QUESTIONS = json.load(open(f"{V7}/classifier-v7/questions-r7.json"))
SPORT = ("News articles about mixed martial arts (MMA). The fighter named in `watched_fighter` "
         "competes in the UFC (Ultimate Fighting Championship).")
# stable facts only: no record, ranking or title, which go out of date
PROFILES = {"Ilia Topuria": "Ilia Topuria, a Spanish-Georgian mixed martial artist, UFC lightweight.",
            "Daniil Donchenko": "Daniil Donchenko, a Ukrainian mixed martial artist, UFC welterweight.",
            "Yaroslav Amosov": "Yaroslav Amosov, a Ukrainian mixed martial artist, UFC welterweight."}
VERSIONS = ["control", "sport", "profile"]
NAMES = {"stored": "v7.7 as stored (r7)", "control": "control: v7.7 sent again",
         "sport": "sport: + what we read", "profile": "profile: + who he is"}


def state_for(article, version):
    """The article fields one version sends.

    @param article: a golden article
    @param version: "control", "sport" or "profile"
    @returns: v7's article fields, plus the added ones for this version
    """
    state = run.state_of(article)
    if version in ("sport", "profile"): state["context"] = SPORT
    if version == "profile": state["about_watched_fighter"] = PROFILES[article["subject"]]
    return state


def language_of(article):
    """The article's language, guessed from its letters and its most common short words.

    @param article: a golden article
    @returns: "uk", "ru", "es", "en", "pt", "ka" or "other"
    """
    text = f"{article['title']} {(article['body'] or '')[:3000]}".lower()
    cyrillic, georgian = len(re.findall("[а-яёіїєґ]", text)), len(re.findall("[Ⴀ-ჿ]", text))
    latin = len(re.findall("[a-zñáéíóú]", text))

    # a non-Latin script settles it; Ukrainian and Russian differ by letters only one of them has
    if georgian > latin: return "ka"
    if cyrillic > latin: return "uk" if len(re.findall("[іїєґ]", text)) > len(re.findall("[ыэъё]", text)) else "ru"

    # Latin script: the language whose common short words appear most
    words = collections.Counter(re.findall(r"[a-zñáéíóúãõç]+", text))
    markers = {"es": ["el", "los", "que", "del", "por", "una", "las", "con"],
               "en": ["the", "and", "of", "to", "with", "was", "is", "his"],
               "pt": ["não", "com", "uma", "ele", "dos", "foi", "para", "mais"]}
    best = max(markers, key=lambda lang: sum(words[w] for w in markers[lang]))
    return best if sum(words[w] for w in markers[best]) >= 5 else "other"


def raw_path(version):
    """Where one version's answers are stored.

    @param version: "stored" (v7's r7 round) or one of VERSIONS
    @returns: a function from article id to its answer file
    """
    if version == "stored": return lambda i: f"{V7}/classifier-v7/raw/{i}-r7.json"
    return lambda i: f"{HERE}/raw/{i}-{version}.json"


def send(articles):
    """Send every version for every article, reusing stored answers, and print the cost.

    @param articles: the training and validation articles
    """
    key = run.api_key()
    os.makedirs(f"{HERE}/raw", exist_ok=True)
    jobs = [(article, version) for version in VERSIONS for article in articles]
    def work(job):
        article, version = job
        path = raw_path(version)(str(article["id"]))
        if os.path.exists(path) and "_error" not in json.load(open(path)): return json.load(open(path))
        out = run.call(key, QUESTIONS, state_for(article, version)); json.dump(out, open(path, "w")); return out
    with ThreadPoolExecutor(max_workers=10) as pool: outs = list(pool.map(work, jobs))
    failed = [f"{a['id']}-{v}" for (a, v), out in zip(jobs, outs) if "_error" in out]
    tokens = sum(out["usage"]["input_tokens"] for out in outs if "usage" in out)
    print(f"{len(outs)} calls, {len(failed)} failed {failed[:5]}, {tokens:,} input tokens, about ${tokens * 0.042 / 1e6:.3f}")


def main():
    """Read the command line and do what it asks."""
    side_of = json.load(open(f"{run.GOLDEN}/split.json"))["articles"]
    articles = [a for a in json.load(open(f"{run.GOLDEN}/articles.json")) if side_of[str(a["id"])] in ("tune", "check")]
    command = sys.argv[1] if len(sys.argv) > 1 else "report"
    if command == "languages":
        import report
        return report.by_language(articles, side_of, "stored")
    if command == "run":
        if "--yes" not in sys.argv: print(f"{len(articles)} articles x {len(VERSIONS)} versions; add --yes to spend."); return
        return send(articles)
    import report
    report.full(articles, side_of)


if __name__ == "__main__": main()
