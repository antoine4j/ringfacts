"""Write the proposed guide: key-guide.md with wording-proposal.json applied, as markdown for the readers.

    python3 make_guide.py   ->  guide.md
"""
import json
import re
from pathlib import Path

HERE = Path(__file__).parent
PROPOSAL = json.loads((HERE.parent / "wording-proposal.json").read_text())


def tick(text):
    """Put value names (words with an underscore) in backticks, as the guide writes them."""
    return re.sub(r"(?<!`)\b([a-z]+(?:_[a-z]+)+)\b(?!`)", r"`\1`", text)


def swap(guide, old, new):
    """Replace one passage, ignoring how the guide wraps its lines; fail if it is not there exactly once."""
    pattern = r"\s+".join(re.escape(word) for word in old.split())
    assert len(re.findall(pattern, guide)) == 1, old[:60]
    return re.sub(pattern, lambda m: new, guide)


def main():
    """Apply every reader edit of the proposal to the guide and save the result."""
    guide = (HERE.parent / "key-guide.md").read_text()
    fact, firm = PROPOSAL["fact"], PROPOSAL["firmness"]["options"]
    options = fact["options"]
    guide = swap(guide, fact["reader_question"]["replace"][0], tick(fact["reader_question"]["replace"][1]))
    for name in ["next_fight", "fight_week_event"]:
        guide = swap(guide, options[name]["reader"]["replace"][0], tick(options[name]["reader"]["replace"][1]))
    # rows that only gain text at the end
    rows = {"health": "injury, medical issue, surgery, recovery, as news",
            "no_fact": "opinion or talk only; no new fact about him",
            "none_of_these": "a new fact of a kind not listed; say which"}
    for name, text in rows.items():
        guide = swap(guide, f"| `{name}` | {text} |", f"| `{name}` | {text}{tick(options[name]['reader']['append'])} |")
    personal = next(line for line in guide.splitlines() if line.startswith("| `personal_life` |"))
    guide = guide.replace(personal, personal + "\n| `status_update` | " + tick(options["status_update"]["reader"]["set"]) + " |")
    guide = swap(guide, "(e.g. his coach says he'll be ready in December) |",
                 "(e.g. his coach says he'll be ready in December)" + tick(firm["reported"]["reader"]["append"]) + " |")
    guide = swap(guide, "or it has happened (a fight result) |",
                 "or it has happened (a fight result)" + tick(firm["official_or_done"]["reader"]["append"]) + " |")
    bullet = re.search(r"- \*\*reports_his_next_fight\*\* — (.*?)(?=\n- \*\*)", guide, re.S).group(1)
    guide = guide.replace(bullet, tick(PROPOSAL["reports_his_next_fight"]["reader_question"]["set"]).replace(" no for only", " `no` for only"))
    notes = PROPOSAL["_notes"]
    guide = swap(guide, "(a coach gives his return date and how the recovery is going: fact `next_fight`, health `yes`)",
                 "(a fight report that also names his next opponent: fact `result`, next fight `yes`)")
    for old, new in notes["output"]["replace_many"]:
        guide = swap(guide, old, new)
    (HERE / "guide.md").write_text(guide)


if __name__ == "__main__":
    main()
