# Anton's rulings on the extraction experiment — append only

His words, verbatim, on the ruler (which articles are one story) and on the
claims. **The only ground truth in this folder.** A ruling on the ruler
outranks every score here: when one lands, `clusters.json` is rebuilt from it
and every arm is re-scored, and the old numbers are kept in `ITERATIONS.md`.

Format, one block per ruling:

    ## YYYY-MM-DD — #a and #b are one story / are different stories / claim on #n is wrong
    > his words
    What changed as a result, and where.

## 2026-09-22 — story-125 (#1146, #1150, #1160): the grouping is right

Anton, by voice, reviewing REPORT.html:

> "I reviewed the first story, story 125. And I noticed that two of the three
> extracts are very similar. And the third extract provides more details …
> Makhachev said something about Amosov and then it also details why he
> thinks that. And two other articles just say what he thinks, but don't
> mention why. That's interesting. But the grouping is right."

**Ruling on the ruler:** the three articles are one story. First human ruling
in this folder. **On the claims:** checked — the reason ("I saw the fight
where someone stopped his wrestling") is in the text of all three articles;
the extractor kept it in #1146 and dropped it in #1150 and #1160. Fidelity
lost by the one-sentence rule, not by the source. Evidence for README 9b.

The ruler's own eight low-confidence pair rulings are in
`clusters.json` under `low_confidence_rulings` and flagged in `REPORT.html`
under "the ruler was unsure".
