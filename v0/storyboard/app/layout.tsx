// The frame around every page: the title, the navigation, the page itself.

import { Barlow_Condensed, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { Suspense, type ReactNode } from "react";
import { Nav } from "../components/Nav.tsx";
import { ThemeSwitch } from "../components/ThemeSwitch.tsx";
import { THEME_SCRIPT } from "../lib/theme.ts";
import "./globals.css";

export const metadata = { title: "RingFacts storyboard", description: "RingFacts v0, read live from its database." };

// The type, as the Golden Set Map sets it: a condensed display face for titles,
// a plain sans for text, a mono for times, ids and counts. Served with the site.
const display = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-display" });
const body = IBM_Plex_Sans({ subsets: ["latin", "cyrillic"], weight: ["400", "500", "600"], variable: "--font-body" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

// Every page reads the database when it is opened; nothing is built ahead of time.
export const dynamic = "force-dynamic";

/**
 * The page frame.
 *
 * @param props.children  The page.
 * @returns The HTML document.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <header className="top">
          <a href="/" className="brand" title="RingFacts v0 storyboard. All times in Pacific">
            <span className="brand-name">RingFacts</span>
            <span className="brand-version">v0</span>
          </a>
          <Suspense fallback={null}>
            <Nav />
          </Suspense>
          <ThemeSwitch />
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
