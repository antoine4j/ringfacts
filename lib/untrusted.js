// The untrusted-source rule: a domain whose archive record is mostly
// wrong-subject holds AND has never yielded an article body is keyword spam
// that names the subject to get indexed. Its items are held before they can
// post. Three conditions, all required — a ratio alone would muzzle real
// outlets whose surname-filtered feeds run 35-45% wrong-subject, and a blocked
// fetcher alone would muzzle real outlets that 403 cloud IPs.
// History: docs/decisions.md#untrusted-source

/**
 * The domain an item is judged under: the hostname of its real address,
 * without a www prefix. Never the display source name — the same spam arrives
 * labelled both "Mshale" and "mshale.com".
 *
 * @param {string|null} url
 * @returns {string|null}  null when the input is not a URL
 */
export function domainOf(url) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * The thresholds as configured: overridable per environment, and a kill
 * switch that turns the rule off without a deploy.
 *
 * @returns {{ minItems: number, minRatio: number, off: boolean }}
 */
export function configuredThresholds() {
  return {
    minItems: Number(process.env.UNTRUSTED_MIN_ITEMS || 5),
    minRatio: Number(process.env.UNTRUSTED_MIN_RATIO || 0.5),
    off: process.env.UNTRUSTED_SOURCE_OFF === "1",
  };
}

/**
 * Has this domain earned a hold? All three must be true: enough history to
 * judge, a majority of it wrong-subject, and not one body ever extracted.
 *
 * @param {{ items: number, wrongSubject: number, bodies: number }|null} record
 * @param {{ minItems?: number, minRatio?: number, off?: boolean }} [thresholds]
 * @returns {boolean}
 */
export function isUntrustedSource(record, thresholds = configuredThresholds()) {
  if (thresholds.off || !record) return false;
  const minItems = thresholds.minItems ?? 5;
  const minRatio = thresholds.minRatio ?? 0.5;

  const hasHistory = record.items >= minItems;
  const mostlyJunk = record.items > 0 && record.wrongSubject / record.items >= minRatio;
  const neverReadable = record.bodies === 0;
  return hasHistory && mostlyJunk && neverReadable;
}
