"""Compare the pilot readers with each other, with today's key, and with what the new wording should give.

    python3 compare.py round1     -> prints agreement, wanted moves, unwanted moves
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
QUESTIONS = ["fact", "firmness", "reports_his_next_fight"]
# what the approved wording should give where it differs from today's key (Anton, 2026-10-02)
SU = {"fact": "status_update", "reports_his_next_fight": "no"}
WANTED = {
    "998": SU, "991": SU, "1076": SU, "1020": SU, "572": SU, "592": SU,
    "152": {"fact": "health", "reports_his_next_fight": "no"},
    "402": {"fact": "health", "reports_his_next_fight": "no"},
    "412": {"fact": "health", "reports_his_next_fight": "no"},
    "129": {"fact": "no_fact", "firmness": "none", "reports_his_next_fight": "no"},
}


def load(reader):
    """One reader's answers for the round named on the command line, keyed by real article id."""
    folder = HERE / sys.argv[1]
    ids = json.loads((folder / "id-map.json").read_text())
    rows = [r for f in sorted(folder.glob(f"{reader}-*.json")) for r in json.loads(f.read_text())]
    return {ids[r["id"]]: r for r in rows}


def main():
    """Print reader agreement, then every article where a reader leaves the expected answer."""
    key = json.loads((HERE / "key-now.json").read_text())
    a, b = load("A"), load("B")
    print(f"articles: A {len(a)}, B {len(b)}")
    for q in QUESTIONS:
        same = sum(a[i][q] == b[i][q] for i in a)
        print(f"readers agree on {q}: {same} of {len(a)}")
    for i in sorted(a, key=int):
        expect = {**{q: key[i][q] for q in QUESTIONS}, **WANTED.get(i, {})}
        lines = []
        for q in QUESTIONS:
            got = (a[i][q], b[i][q])
            if got != (expect[q], expect[q]):
                lines.append(f"   {q}: expected {expect[q]} (today {key[i][q]}); A {got[0]}, B {got[1]}")
        kind = "wanted move" if i in WANTED else "should not move"
        if lines:
            print(f"#{i} [{kind}] {a[i]['main_claim'][:110]}")
            print("\n".join(lines))
            print(f"   A: {a[i]['note'][:260]}\n   B: {b[i]['note'][:260]}")
        elif i in WANTED:
            print(f"#{i} [wanted move] OK: both readers gave {expect['fact']}")


if __name__ == "__main__":
    main()
