"""Render classifier-v4/questions.json as a page for review before a run.

    python3 review.py OUT.html

Shows every question exactly as the classifier gets it - choice options with
their what / not for / examples, score levels in order with their signals,
yes/no questions - numbered as Anton refers to them. No calls, no spending.
"""
import json, html, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
TYPE_LABEL = {"choice": "choice · picks one option; every option gets a probability",
              "score": "score · a position on ordered levels, low to high; every level gets a probability",
              "noul": "yes / no · returns the probability of yes"}
e = html.escape


def option_cell(value):
    """One choice option's definition: a plain string, or what / not for / examples.

    @param value: the option's definition as sent
    @returns: html
    """
    if isinstance(value, str):
        return e(value)
    parts = [e(value["what"])]
    if value.get("not_for"):
        parts.append(f'<div class="nf"><b>Not for:</b> {e(value["not_for"])}</div>')
    if value.get("examples"):
        parts.append(f'<div class="ex"><b>Examples:</b> {"; ".join(e(x) for x in value["examples"])}</div>')
    return "".join(parts)


def section(number, key, question):
    """One question as a block, by its type.

    @param number: 1-based question number
    @param key: the question's key
    @param question: the question as sent
    @returns: html
    """
    kind = question["type"]
    if kind == "choice":
        body = "".join(f'<tr><td class="o">{e(o.replace("_", " "))}</td><td>{option_cell(d)}</td></tr>' for o, d in question["criteria"].items())
        body = f"<table>{body}</table>"
    elif kind == "score":
        rows = []
        for level, d in enumerate(question["criteria"]):
            signals = "".join(f"<li>{e(s)}</li>" for s in d.get("signals", []))
            rows.append(f'<tr><td class="o">level {level}</td><td>{e(d["summary"])}{f"<ul>{signals}</ul>" if signals else ""}</td></tr>')
        body = f"<table>{''.join(rows)}</table>"
    elif "criteria" in question:
        body = "".join(f'<tr><td class="o">{answer}</td><td>{e(question["criteria"][side])}</td></tr>' for side, answer in (("true", "yes"), ("false", "no")))
        body = f"<table>{body}</table>"
    else:
        body = ""
    fit = " fit" if key.endswith("_fit") else ""
    return (f'<section class="{kind}{fit}"><h2><span class="n">Q{number}</span> {e(key.replace("_", " "))} <code>{e(TYPE_LABEL[kind])}</code></h2>'
            f'<p class="ins">{e(question["instructions"])}</p>{body}</section>')


def main():
    """Write the review page to the path given on the command line."""
    questions = json.load(open(os.path.join(HERE, "classifier-v4/questions.json")))
    blocks = "".join(section(i, k, q) for i, (k, q) in enumerate(questions.items(), 1))
    page = open(os.path.join(HERE, "review-template.html")).read().replace("<!--QUESTIONS-->", blocks)
    open(sys.argv[1], "w").write(page)


main()
