// What the "auto" theme means: light from sunrise to sunset where the browser
// is, dark the rest of the day. No location is asked for: the sun is worked
// out for San Francisco's latitude on the meridian of the browser's time zone,
// which puts sunrise and sunset within about half an hour of the real ones
// anywhere at a similar latitude (in San Francisco, about ten minutes early).

export const STORAGE_KEY = "storyboard-theme";

/** Pacific standard time, minutes behind UTC: the fallback when the browser's zone cannot be read. */
const PACIFIC_OFFSET = 480;

/**
 * Whether the sun is up at a moment. Self-contained (no outside names), so
 * THEME_SCRIPT can inline its source and run it before the page paints.
 *
 * The standard sunrise equation: find the solar noon nearest the moment, the
 * sun's declination that day, and the hour angle at which its centre sits
 * 0.833° below the horizon (refraction plus the sun's radius).
 *
 * @param nowMs  The moment, in milliseconds since 1970.
 * @param standardOffset  The time zone's standard-time offset in minutes behind UTC, as getTimezoneOffset reports it (480 for Pacific); anything not a number means Pacific.
 * @returns True between sunrise and sunset.
 */
export function sunIsUp(nowMs: number, standardOffset: number): boolean {
  const offset = Number.isFinite(standardOffset) ? standardOffset : 480;
  const rad = Math.PI / 180;
  const latitude = 37.77 * rad;
  const longitude = -offset / 4;

  // Days since noon UTC on 1 January 2000, and the local solar noon nearest now.
  const days = nowMs / 86400000 + 2440587.5 - 2451545;
  const noon = Math.round(days + longitude / 360) - longitude / 360;

  // The sun's position on the ecliptic that day, then its declination.
  const anomaly = (357.5291 + 0.98560028 * noon) * rad;
  const centre = 1.9148 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly) + 0.0003 * Math.sin(3 * anomaly);
  const ecliptic = anomaly + (centre + 180 + 102.9372) * rad;
  const transit = noon + 0.0053 * Math.sin(anomaly) - 0.0069 * Math.sin(2 * ecliptic);
  const declination = Math.asin(Math.sin(ecliptic) * Math.sin(23.4397 * rad));

  // Half the day's length, as a fraction of a day; polar day and night clamp to all or nothing.
  const cosine = (Math.sin(-0.833 * rad) - Math.sin(latitude) * Math.sin(declination)) / (Math.cos(latitude) * Math.cos(declination));
  const halfDay = Math.acos(Math.min(1, Math.max(-1, cosine))) / (2 * Math.PI);
  return days >= transit - halfDay && days <= transit + halfDay;
}

/**
 * The browser's standard-time offset: the larger of January's and July's, so summer time does not move the meridian.
 *
 * @param now  Any date in the year.
 * @returns Minutes behind UTC (480 for Pacific).
 */
export function standardOffset(now: Date): number {
  const year = now.getFullYear();
  return Math.max(new Date(year, 0, 1).getTimezoneOffset(), new Date(year, 6, 1).getTimezoneOffset());
}

/**
 * The theme "auto" means at a moment.
 *
 * @param now  The moment.
 * @returns "light" while the sun is up, else "dark".
 */
export function autoTheme(now: Date): "light" | "dark" {
  let offset = PACIFIC_OFFSET;
  try {
    offset = standardOffset(now);
  } catch {
    // An unreadable zone keeps Pacific.
  }
  return sunIsUp(now.getTime(), offset) ? "light" : "dark";
}

/** Inlined in <head> by the layout: applies the remembered choice, or the sun's, before the first paint. */
export const THEME_SCRIPT = `try{var c=null;try{c=localStorage.getItem("${STORAGE_KEY}")}catch(e){}var n=new Date(),o=${PACIFIC_OFFSET};try{o=(${standardOffset.toString()})(n)}catch(e){}document.documentElement.dataset.theme=c==="light"||c==="dark"?c:((${sunIsUp.toString()})(n.getTime(),o)?"light":"dark")}catch(e){}`;
