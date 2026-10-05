// The frame around every page: the title, the navigation, the page itself.

import { Suspense, type ReactNode } from "react";
import { Nav } from "../components/Nav.tsx";
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
    <html lang="en">
      <body>
        <header className="top">
          <strong className="brand">v0 storyboard</strong>
          <Suspense fallback={null}>
            <Nav />
          </Suspense>
          <span className="muted small">times in Pacific</span>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
