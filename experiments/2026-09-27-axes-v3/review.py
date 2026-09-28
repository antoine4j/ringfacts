"""Render classifier-v3/questions.json as a page for review before a run.

    python3 review.py OUT.html

Reads the questions exactly as the classifier will get them; writes one
self-contained page. No calls, no spending.
"""
import json, html, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
TITLES = {"gate": "Gate: is it about him?", "source": "Source: whose words or act?",
          "act": "Act: what do they do regarding him?", "fact": "Fact asserted", "firmness": "How firm"}


def section(number, key, question):
    """One question as a block: instruction, then every option with its definition.

    @param number: 1-based question number, as Anton refers to it ("Q3")
    @param key: the question's key in the JSON
    @param question: its instructions and criteria
    @returns: html for the block
    """
    rows = "".join(f'<tr><td class="o">{html.escape(o.replace("_", " "))}</td><td>{html.escape(d)}</td></tr>'
                   for o, d in question["criteria"].items())
    return (f'<section><h2><span class="n">Q{number}</span> {html.escape(TITLES[key])} <code>{key}</code></h2>'
            f'<p class="ins">{html.escape(question["instructions"])}</p><table>{rows}</table></section>')


def main():
    """Write the review page to the path given on the command line."""
    questions = json.load(open(os.path.join(HERE, "classifier-v3/questions.json")))
    blocks = "".join(section(i, k, q) for i, (k, q) in enumerate(questions.items(), 1))
    page = open(os.path.join(HERE, "review-template.html")).read().replace("<!--QUESTIONS-->", blocks)
    open(sys.argv[1], "w").write(page)


main()
