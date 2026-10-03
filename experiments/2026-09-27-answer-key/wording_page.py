"""Build the wording review page: every question and answer option, today's text beside the proposed text.

Reads the labelling guide (what the readers see), the v6 classifier questions (what JEV sees) and
wording-proposal.json (the proposed edits), and fills wording-template.html. Changes nothing else.

    python3 wording_page.py   ->  wording-draft.html
"""
import json
import re
from pathlib import Path

HERE = Path(__file__).parent
GUIDE = HERE / "status-pilot" / "guide-before.md"  # the guide before the wording was adopted
CLASSIFIER = HERE.parent / "2026-09-27-axes-v6" / "classifier-v6" / "questions.json"
PROPOSAL = HERE / "wording-proposal.json"
TEMPLATE = HERE / "wording-template.html"
OUT = HERE / "wording-draft.html"

LABELS = {
    "centrality": "How central is he to the article?",
    "source": "Whose words or act is the new information?",
    "act": "What does the source do regarding him?",
    "fact": "What new fact about him does the article carry?",
    "firmness": "How firm is that fact?",
    "reports_his_result": "Does it report his result?",
    "reports_his_next_fight": "Does it report his next fight?",
    "reports_his_health": "Does it report his health?",
    "he_speaks": "Does he speak?",
}
KINDS = {"choice": "pick one", "score": "scale", "noul": "yes / no"}
# the guide and the classifier name two values differently, and each has a value the other lacks
READER_NAME = {"other_fighter": "other_fighter_side"}
READER_ABSENT = {"only_mentions_him": "Not a value in the guide. Readers answer none_of_these for this case."}
CLS_ABSENT = {"none": "Not asked. The code sets none when the fact answer is no fact."}
SCALE_VALUES = {
    "centrality": ["not_in_content", "only_mentioned", "one_of_several", "main_subject"],
    "firmness": ["wish", "rumour", "reported", "official_or_done"],
}


def clean(text):
    """Drop markdown marks and collapse whitespace, so guide text diffs word by word."""
    return re.sub(r"\s+", " ", text.replace("**", "").replace("`", "")).strip()


def paragraphs(lines):
    """Group lines into paragraphs split by blank lines."""
    out, cur = [], []
    for line in lines + [""]:
        if line.strip():
            cur.append(line)
        elif cur:
            out.append(clean(" ".join(cur)))
            cur = []
    return out


def parse_guide(text):
    """Split the guide into its opening, the five table questions, the yes/no block and the output example."""
    parts = re.split(r"^## ", text, flags=re.M)
    guide = {"opening": paragraphs(parts[0].splitlines()[1:]), "questions": {}}
    for part in parts[1:]:
        title, _, body = part.partition("\n")
        lines = body.splitlines()
        table = re.match(r"(\d)\. (\w+) — ", title)
        if table:
            # table rows are the values; every other line is the question's own text
            rows = [re.match(r"\| `(\w+)` \| (.*) \|$", line) for line in lines]
            values = {m.group(1): clean(m.group(2)) for m in rows if m}
            prose = [line for line, m in zip(lines, rows) if not m and not line.startswith("|")]
            guide["questions"][table.group(2)] = {"text": paragraphs(prose), "values": values}
        elif title.startswith("6–9"):
            first = next(i for i, line in enumerate(lines) if line.startswith("- **"))
            guide["news_questions"] = paragraphs(lines[:first])
            for bullet in re.split(r"^- \*\*", "\n".join(lines[first:]), flags=re.M)[1:]:
                name, _, rest = bullet.partition("** — ")
                rest, _, tail = rest.partition("\n\n")
                guide["questions"][name] = {"text": [clean(rest)], "values": {}}
                if tail.strip():
                    guide["news_questions"].append(clean(tail))
        elif title.startswith("Output"):
            guide["output"] = [clean(body.replace("```json", "").replace("```", ""))]
    return guide


def edit(texts, change):
    """Apply one proposed reader edit (replace / replace_many / append / set) to a list of paragraphs."""
    if not change:
        return list(texts)
    if "set" in change:
        return [change["set"]]
    out = list(texts) or [""]
    pairs = change.get("replace_many", []) + ([change["replace"]] if "replace" in change else [])
    for old, new in pairs:
        hit = [i for i, t in enumerate(out) if old in t]
        assert hit, f"proposal text not found in guide: {old[:60]}"
        out[hit[0]] = out[hit[0]].replace(old, new)
    if "append" in change:
        out[-1] += change["append"]
    return out


def fields(cur, prop, keys=None):
    """Pair current and proposed texts into the {k, cur, prop} rows the page diffs."""
    keys = keys or [""] * max(len(cur), len(prop))
    cur, prop = cur + [""] * (len(keys) - len(cur)), prop + [""] * (len(keys) - len(prop))
    return [{"k": k, "cur": c, "prop": p} for k, c, p in zip(keys, cur, prop)]


def cls_fields(cur, change):
    """Rows for one classifier option, level or yes/no question: each named field, joined lists."""
    flat = lambda v: " / ".join(v) if isinstance(v, list) else (v or "")
    cur, new = cur or {}, {**(cur or {}), **(change or {})}
    order = ["instructions", "what", "not_for", "examples", "summary", "signals", "true", "false"]
    names = {"not_for": "not for", "true": "yes when", "false": "no when"}
    return [{"k": names.get(k, k), "cur": flat(cur.get(k)), "prop": flat(new.get(k))} for k in order if k in new]


def tag(*sides):
    """new / chg / same for a card, from its reader and classifier rows."""
    rows = [f for side in sides if side and "fields" in side for f in side["fields"]]
    if rows and all(not f["cur"] for f in rows):
        return "new"
    return "chg" if any(f["cur"] != f["prop"] for f in rows) else "same"


def build_question(qid, guide_q, cls_q, plan):
    """One question: its text, then every answer option, each with reader and classifier rows."""
    options_plan = plan.get("options", {})
    extra = ["extra rule"] * (len(guide_q["text"]) - 1)
    reader_q = {"fields": fields(guide_q["text"], edit(guide_q["text"], plan.get("reader_question")), [""] + extra)}
    criteria = cls_q["criteria"]
    if cls_q["type"] == "noul":
        cls_cur = {"instructions": cls_q["instructions"], **criteria}
        cls_side, order = {"fields": cls_fields(cls_cur, plan.get("cls_question"))}, []
    else:
        cls_side = {"fields": cls_fields({"instructions": cls_q["instructions"]}, plan.get("cls_question"))}
        if cls_q["type"] == "score":
            criteria = dict(zip(SCALE_VALUES[qid], criteria))
        order = list(criteria)
        # values only the guide has go first (firmness none); new values go after the one they name
        order = [v for v in guide_q["values"] if READER_NAME.get(v, v) not in order and v not in order
                 and v not in READER_NAME.values()] + order
        for name, change in options_plan.items():
            if change.get("new"):
                order.insert(order.index(change["after"]) + 1, name)
    question = {"id": qid, "label": LABELS[qid], "kind": KINDS[cls_q["type"]], "why": plan.get("why", ""),
                "q": {"reader": reader_q, "cls": cls_side, "why": plan.get("reader_question", {}).get("why", "")},
                "options": []}
    question["q"]["tag"] = tag(reader_q, cls_side)
    for name in order:
        change = options_plan.get(name, {})
        reader_name = READER_NAME.get(name, name)
        if name in READER_ABSENT:
            reader = {"absent": READER_ABSENT[name]}
        else:
            cur = [guide_q["values"][reader_name]] if reader_name in guide_q["values"] else []
            reader = {"fields": fields(cur, edit(cur, change.get("reader")))}
        cls = {"absent": CLS_ABSENT[name]} if name in CLS_ABSENT else {"fields": cls_fields(criteria.get(name), change.get("cls"))}
        shown = name if reader_name == name else f"{name} (readers: {reader_name})"
        question["options"].append({"id": shown, "why": change.get("why", ""), "reader": reader, "cls": cls,
                                    "tag": tag(reader, cls)})
    changed = question["q"]["tag"] != "same" or any(o["tag"] != "same" for o in question["options"])
    question["tag"] = "chg" if changed else "same"
    return question


def build_notes(guide, plan):
    """The reader-only parts of the guide: opening, the shared yes/no rule, the output example."""
    notes = []
    for key, title in [("opening", "Opening of the guide"), ("news_questions", "Shared rule for the yes/no questions"),
                       ("output", "Output example")]:
        reader = {"fields": fields(guide[key], edit(guide[key], plan.get(key)))}
        notes.append({"title": title, "why": plan.get(key, {}).get("why", ""), "reader": reader, "tag": tag(reader)})
    return notes


def main():
    """Build the page and print how many questions and options changed."""
    guide = parse_guide(GUIDE.read_text())
    classifier = json.loads(CLASSIFIER.read_text())
    proposal = json.loads(PROPOSAL.read_text())
    questions = [build_question(q, guide["questions"][q], classifier[q], proposal.get(q, {})) for q in classifier]
    data = {"questions": questions, "notes": build_notes(guide, proposal["_notes"])}
    OUT.write_text(TEMPLATE.read_text().replace("/*DATA*/", json.dumps(data, ensure_ascii=False)))
    for q in questions:
        moved = [o["id"] for o in q["options"] if o["tag"] != "same"]
        print(f"{q['id']:24} {q['tag']:5} question text: {q['q']['tag']:5} options: {len(q['options'])} changed: {moved}")
    print("notes:", [(n["title"], n["tag"]) for n in data["notes"]])


if __name__ == "__main__":
    main()
