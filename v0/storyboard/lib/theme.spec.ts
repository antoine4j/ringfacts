import { test } from "node:test";
import assert from "node:assert/strict";
import { STORAGE_KEY, sunIsUp, THEME_SCRIPT } from "./theme.ts";

const PACIFIC = 480;

/**
 * The model's sunrise and sunset for one Pacific day, in minutes after midnight Pacific.
 *
 * @param day  The day, YYYY-MM-DD.
 * @param utcHoursAtMidnight  Hours from midnight Pacific to midnight UTC that day (7 in summer time, 8 in winter).
 * @returns Sunrise and sunset.
 */
function sunTimes(day: string, utcHoursAtMidnight: number): { rise: number; set: number } {
  const midnight = Date.parse(`${day}T00:00:00Z`) + utcHoursAtMidnight * 3_600_000;
  const minutes = Array.from({ length: 1440 }, (_, minute) => sunIsUp(midnight + minute * 60_000, PACIFIC));
  return { rise: minutes.indexOf(true), set: minutes.lastIndexOf(true) + 1 };
}

/** Within 20 minutes of a published San Francisco time (hours, minutes). */
function near(actual: number, hours: number, minutes: number): boolean {
  return Math.abs(actual - (hours * 60 + minutes)) <= 20;
}

test("the sun rises and sets near San Francisco's published times, through the seasons", () => {
  const october = sunTimes("2026-10-05", 7);
  assert.ok(near(october.rise, 7, 12) && near(october.set, 18, 50), JSON.stringify(october));
  const june = sunTimes("2026-06-21", 7);
  assert.ok(near(june.rise, 5, 48) && near(june.set, 20, 35), JSON.stringify(june));
  const december = sunTimes("2026-12-21", 8);
  assert.ok(near(december.rise, 7, 21) && near(december.set, 16, 54), JSON.stringify(december));
});

test("noon is light and midnight dark, and an unreadable zone falls back to Pacific", () => {
  assert.equal(sunIsUp(Date.parse("2026-10-05T19:00:00Z"), PACIFIC), true);
  assert.equal(sunIsUp(Date.parse("2026-10-06T07:00:00Z"), PACIFIC), false);
  assert.equal(sunIsUp(Date.parse("2026-10-05T19:00:00Z"), Number.NaN), true);
  assert.equal(sunIsUp(Date.parse("2026-10-06T07:00:00Z"), Number.NaN), false);
});

test("the zone moves the sun: noon in Kyiv is night in San Francisco's zone", () => {
  const kyivNoon = Date.parse("2026-10-05T09:00:00Z");
  assert.equal(sunIsUp(kyivNoon, -120), true);
  assert.equal(sunIsUp(kyivNoon, PACIFIC), false);
});

/**
 * Runs THEME_SCRIPT against a stand-in page.
 *
 * @param stored  What localStorage holds for the theme, or null.
 * @returns The theme it set.
 */
function runScript(stored: string | null): string | undefined {
  const html = { dataset: {} as Record<string, string> };
  const page = { localStorage: { getItem: (key: string) => (key === STORAGE_KEY ? stored : null) }, document: { documentElement: html } };
  new Function("localStorage", "document", THEME_SCRIPT)(page.localStorage, page.document);
  return html.dataset.theme;
}

test("the head script applies a chosen theme, or the sun's on auto", () => {
  assert.equal(runScript("light"), "light");
  assert.equal(runScript("dark"), "dark");
  assert.ok(["light", "dark"].includes(runScript(null) ?? ""));
});
