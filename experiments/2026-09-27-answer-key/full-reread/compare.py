"""Compare the two blind readers of the full re-read with each other and with the key.

    python3 compare.py <folder of dumped corrections>   ->  key-now.json, result.json, a printed summary

The key is the original readers' answers (golden/answers/readers-v1.json) with Anton's
corrections laid over them. Changes nothing outside this folder.
"""
import collections
import glob
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).parent
REPO = HERE.parents[2]
QUESTIONS = ["centrality", "source", "act", "fact", "firmness", "reports_his_result",
             "reports_his_next_fight", "reports_his_health", "he_speaks"]


def load_key(dump):
    """Effective answers per article, and which cards Anton has checked."""
    base = json.loads((REPO / "golden/answers/readers-v1.json").read_text())["articles"]
    key, checked = {}, set()
    for article, entry in base.items():
        key[article] = {q: entry["answers"][q]["value"] for q in QUESTIONS}
        path = Path(dump) / f"{article}.json"
        if path.exists():
            doc = json.loads(path.read_text())
            doc = doc.get("data", doc)
            for q, fix in (doc.get("fixes") or {}).items():
                key[article][q] = fix["value"]
            if doc.get("reviewed"):
                checked.add(article)
    return key, checked


def load_reader(reader, ids):
    """One reader's answers keyed by real article number."""
    rows = [r for f in sorted(glob.glob(str(HERE / f"out-{reader}-*.json"))) for r in json.loads(Path(f).read_text())]
    return {ids[r["id"]]: r for r in rows}


def main():
    """Print agreement per question and the kinds of difference; write key-now.json and result.json."""
    ids = json.loads((HERE / "id-map.json").read_text())
    key, checked = load_key(sys.argv[1])
    a, b = load_reader("A", ids), load_reader("B", ids)
    print(f"articles: A {len(a)}, B {len(b)}, checked by Anton {len(checked)}")
    rows, moves = [], collections.defaultdict(collections.Counter)
    for q in QUESTIONS:
        same = sum(a[i][q] == b[i][q] for i in key)
        both_key = sum(a[i][q] == b[i][q] == key[i][q] for i in key)
        print(f"{q:24} readers agree {same:3}   both give the key's answer {both_key:3}   of {len(key)}")
    for i in sorted(key, key=int):
        for q in QUESTIONS:
            got = (a[i][q], b[i][q])
            if got == (key[i][q], key[i][q]):
                continue
            kind = "split" if got[0] != got[1] else ("both_against_checked" if i in checked else "both_against_unchecked")
            rows.append({"id": i, "question": q, "key": key[i][q], "A": got[0], "B": got[1], "kind": kind,
                         "A_note": a[i]["note"], "B_note": b[i]["note"]})
            if got[0] == got[1]:
                moves[kind][(q, key[i][q], got[0])] += 1
    for kind in ["both_against_unchecked", "both_against_checked", "split"]:
        mine = [r for r in rows if r["kind"] == kind]
        print(f"\n{kind}: {len(mine)} answers on {len({r['id'] for r in mine})} articles")
        for (q, old, new), n in moves[kind].most_common(40):
            print(f"   {n:3}  {q}: {old} -> {new}")
    clean = len(key) - len({r["id"] for r in rows})
    print(f"\narticles where both readers give the key's answer on all nine: {clean} of {len(key)}")
    (HERE / "key-now.json").write_text(json.dumps(key, indent=1))
    (HERE / "result.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
