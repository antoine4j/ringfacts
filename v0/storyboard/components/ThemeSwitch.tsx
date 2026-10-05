"use client";
// Auto, light or dark. Auto follows the system; a choice is remembered in this
// browser and set on <html data-theme>, which globals.css reads. THEME_SCRIPT
// runs before the page paints, so a dark choice never flashes light first.

import { useEffect, useState } from "react";

const STORAGE_KEY = "storyboard-theme";
const CHOICES = ["auto", "light", "dark"] as const;
type Theme = (typeof CHOICES)[number];

/** Inlined in <head> by the layout: applies the remembered choice before the first paint. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

/**
 * Applies a choice to the page and remembers it.
 *
 * @param theme  The choice.
 */
function applyTheme(theme: Theme): void {
  if (theme === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
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

  // After the first render, show what THEME_SCRIPT applied.
  useEffect(() => {
    const applied = document.documentElement.dataset.theme;
    if (applied === "light" || applied === "dark") setTheme(applied);
  }, []);

  return (
    <span className="theme" role="group" aria-label="Theme">
      {CHOICES.map((choice) => (
        <button
          key={choice}
          type="button"
          aria-pressed={theme === choice}
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
