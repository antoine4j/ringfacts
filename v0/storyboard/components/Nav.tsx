"use client";
// The links along the top. They keep ?schema=replay when the page has it, so
// moving around the golden replay stays in the golden replay.

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

/** Every page, in the order the nav shows them. */
const PAGES = [
  { path: "/", name: "Claims" },
  { path: "/readings", name: "Readings" },
  { path: "/settings", name: "Settings" },
  { path: "/digests", name: "Digests" },
  { path: "/runs", name: "Runs" },
  { path: "/compare", name: "Compare" },
  { path: "/replay", name: "Replay" },
];

/**
 * The navigation bar, with the current page marked and a switch between live data and the replay.
 *
 * @returns The links.
 */
export function Nav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inReplay = searchParams.get("schema") === "replay";
  const suffix = inReplay ? "?schema=replay" : "";

  // The page is current when the address is it, or a page under it.
  const isCurrent = (path: string) => (path === "/" ? pathname === "/" || pathname.startsWith("/claims") : pathname.startsWith(path));

  return (
    <nav className="nav">
      {PAGES.map((page) => (
        <Link key={page.path} href={page.path + suffix} className={isCurrent(page.path) ? "current" : ""}>
          {page.name}
        </Link>
      ))}
      <Link href={inReplay ? pathname : `${pathname}?schema=replay`} className={inReplay ? "schema replay" : "schema"}>
        {inReplay ? "reading: golden replay (switch to live)" : "reading: live (switch to replay)"}
      </Link>
    </nav>
  );
}
