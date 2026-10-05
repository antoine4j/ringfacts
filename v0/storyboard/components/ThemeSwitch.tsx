"use client";
// Auto, light or dark. Auto is light from sunrise to sunset (lib/theme.ts); a
// choice is remembered in this browser. The theme in force is set on
// <html data-theme>, which globals.css reads. THEME_SCRIPT runs before the
// page paints, so the page never flashes the wrong theme first.

import { useEffect, useState } from "react";
import { autoTheme, STORAGE_KEY } from "../lib/theme.ts";

const CHOICES = ["auto", "light", "dark"] as const;
type Theme = (typeof CHOICES)[number];

/** How often an open page checks whether the sun has risen or set. */
const SUN_CHECK_MS = 60_000;

/**
 * Sets the theme in force for a choice.
 *
 * @param theme  The choice.
 */
function showTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme === "auto" ? autoTheme(new Date()) : theme;
}

/**
 * Applies a choice to the page and remembers it.
 *
 * @param theme  The choice.
 */
function applyTheme(theme: Theme): void {
  showTheme(theme);
  try {
    if (theme === "auto") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage can be blocked; the choice then lasts until the page reloads.
  }
}

/**
 * The three-way switch.
 *
 * @returns The buttons.
 */
export function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>("auto");

  // After the first render, show the remembered choice.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "light" || stored === "dark") setTheme(stored);
    } catch {
      // No storage: auto.
    }
  }, []);

  // While on auto, follow sunrise and sunset on a page left open.
  useEffect(() => {
    if (theme !== "auto") return;
    const timer = setInterval(() => showTheme("auto"), SUN_CHECK_MS);
    return () => clearInterval(timer);
  }, [theme]);

  return (
    <span className="theme" role="group" aria-label="Theme">
      {CHOICES.map((choice) => (
        <button
          key={choice}
          type="button"
          aria-pressed={theme === choice}
          title={choice === "auto" ? "Light from sunrise to sunset, dark after" : undefined}
          onClick={() => {
            setTheme(choice);
            applyTheme(choice);
          }}
        >
          {choice}
        </button>
      ))}
    </span>
  );
}
