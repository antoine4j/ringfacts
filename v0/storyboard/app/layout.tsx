// The frame around every page: the title, the navigation, the page itself.

import { Suspense, type ReactNode } from "react";
import { Nav } from "../components/Nav.tsx";
import { THEME_SCRIPT, ThemeSwitch } from "../components/ThemeSwitch.tsx";
import "./globals.css";

export const metadata = { title: "v0 storyboard", description: "RingFacts v0, read live from its database." };

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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <header className="top">
          <strong className="brand" title="All times in Pacific">v0</strong>
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
