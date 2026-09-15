// Which language a headline is really written in. A feed's edition says where
// an article was FOUND, not what it says: Google's English edition carries
// Spanish and French articles too, and they arrived tagged "en" and posted
// untranslated. This reads the headline itself — offline, no API call.
// History: docs/decisions.md#translation-rules

// The "small" n-gram table: same accuracy as "medium" on real headlines (22 vs
// 21 of 768 missed), ~180 MB resident instead of ~230, inside a 512 MiB job.
import { eld } from "eld/small";

// Only the languages the press around this sport actually writes in. With the
// full set, fighter names alone read as Tagalog or Slovenian: 27 of 304 real
// English headlines were misread; with this subset, 0 (the 2 flagged were
// genuinely French and Spanish). Measured 2026-09-15 on Google News headlines.
eld.setLanguageSubset(["en", "es", "fr", "pt", "it", "de", "uk", "ru"]);

const CYRILLIC = /[Ѐ-ӿ]/;

/**
 * The language of a Latin-script headline that is clearly not English, or
 * null. Null covers English, too-short-to-tell, and every Cyrillic headline —
 * short Ukrainian reads as Russian, so Cyrillic keeps trusting its edition.
 * A null never removes a translation; it only means "no reason to add one".
 *
 * @param {string} text
 * @returns {string|null}  An ISO 639-1 code, e.g. "es".
 */
export function foreignHeadlineLanguage(text) {
  if (!text || CYRILLIC.test(text)) return null;
  const result = eld.detect(text);
  if (!result.language || result.language === "en" || !result.isReliable()) return null;
  return result.language;
}
