"""Merge the readers' labels into the answer key.

    python3 build_key.py            # the 59 key articles: readers/ → key.json, disputes.json
    python3 build_key.py --rest     # the other 241: readers-rest/ → labels-rest.json, disputes-rest.json

Readers A and B (Fable) label every key article blind. Where they agree,
that is the key value ("agreed"). Where they differ, reader C (Opus, also
blind, asked only the disputed questions) decides: two of three make the
value ("majority"); three different answers make it "split", which the
scorer leaves out and Anton rules on. Until C has answered, a difference is
"disputed" and listed in disputes.json for C.
"""
import json, os, glob, sys

HERE = os.path.dirname(os.path.abspath(__file__))
QUESTIONS = ["centrality", "source", "act", "fact", "firmness",
             "reports_his_result", "reports_his_next_fight", "reports_his_health", "he_speaks"]


def read(reader, folder):
    """All of one reader's labels.

    @param reader: "A", "B" or "C"
    @param folder: "readers" or "readers-rest"
    @returns: article id → that reader's object
    """
    out = {}
    for path in sorted(glob.glob(os.path.join(HERE, f"{folder}/{reader}-*.json"))):
        for entry in json.load(open(path)): out[str(entry["id"])] = entry
    return out


def main():
    """Write the key and the list of disputes."""
    rest = "--rest" in sys.argv
    folder, out_name, disputes_name = ("readers-rest", "labels-rest.json", "disputes-rest.json") if rest else ("readers", "key.json", "disputes.json")
    a, b, c = read("A", folder), read("B", folder), read("C", folder)
    # the key's own tune / held-back parts; the other articles are labels to correct, never tuned on
    parts = ({article_id: "not_key" for article_id in a} if rest else
             {k["id"]: k["part"] for k in json.load(open(os.path.join(HERE, "key-articles.json")))["articles"]})
    key, disputes = {}, {}
    for article_id, part in parts.items():
        if article_id not in a or article_id not in b: continue
        answers = {}
        for q in QUESTIONS:
            va, vb = a[article_id][q], b[article_id][q]
            if va == vb:
                answers[q] = {"value": va, "status": "agreed"}
                continue
            vc = c.get(article_id, {}).get(q)
            if vc is None:
                answers[q] = {"value": None, "status": "disputed", "readers": [va, vb]}
                disputes.setdefault(article_id, []).append(q)
            elif vc in (va, vb):
                answers[q] = {"value": vc, "status": "majority", "readers": [va, vb, vc]}
            else:
                answers[q] = {"value": None, "status": "split", "readers": [va, vb, vc]}
        key[article_id] = {"part": part, "answers": answers,
                           "notes": {"A": a[article_id].get("note", ""), "B": b[article_id].get("note", ""),
                                     "C": c.get(article_id, {}).get("note", "")}}
    note = ("provisional labels for the 241 golden articles outside the key: Fable readers A and B, Opus reader C on their "
            "differences; for Anton to correct, never to tune questions on" if rest else
            "provisional answer key: Fable readers A and B, Opus reader C on their differences; not Anton's labels")
    json.dump({"note": note, "articles": key}, open(os.path.join(HERE, out_name), "w"), indent=1, ensure_ascii=False)
    json.dump(disputes, open(os.path.join(HERE, disputes_name), "w"), indent=1)
    statuses = [e["status"] for k in key.values() for e in k["answers"].values()]
    print(f"{len(key)} articles; " + ", ".join(f"{s} {statuses.count(s)}" for s in ("agreed", "majority", "disputed", "split")))
    for q in QUESTIONS:
        n = sum(k["answers"][q]["status"] == "agreed" for k in key.values())
        print(f"  {q:24} agreed {n}/{len(key)}")


if __name__ == "__main__":
    main()
