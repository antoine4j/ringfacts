// A fighter's name in an article's text, found the way the pipeline finds it:
// by the surname stems in watchlist.js (matchNames), in any letter case, so a
// declined Ukrainian form still matches (Топурії contains Топурі). The
// reading page uses it to highlight why an article was read for a fighter.

/** A piece of text, and whether it is one of the names. */
export type TextPiece = { text: string; isName: boolean };

/**
 * A regular expression for a string, matched literally.
 *
 * @param text  The string.
 * @returns It with every special character escaped.
 */
function literal(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Splits text into the names and the text between them.
 *
 * @param text  The headline or body.
 * @param stems  The fighter's name stems; none means nothing is marked.
 * @returns The pieces in order; joined, they give the text back unchanged.
 */
export function splitOnNames(text: string, stems: string[]): TextPiece[] {
  const usable = stems.filter((stem) => stem.trim() !== "");
  if (usable.length === 0 || text === "") return text === "" ? [] : [{ text, isName: false }];

  // Longest stem first, so a stem inside another never cuts the longer one short.
  const pattern = new RegExp(`(${[...usable].sort((a, b) => b.length - a.length).map(literal).join("|")})`, "giu");
  return text
    .split(pattern)
    .map((piece, index) => ({ text: piece, isName: index % 2 === 1 }))
    .filter((piece) => piece.text !== "");
}

/**
 * How many times the names appear in some pieces.
 *
 * @param pieces  From splitOnNames.
 * @returns The count of name pieces.
 */
export function nameCount(pieces: TextPiece[]): number {
  return pieces.filter((piece) => piece.isName).length;
}
