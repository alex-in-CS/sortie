"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LIVE = [
  { href: "/", label: "Overview" },
  { href: "/jobs", label: "Jobs" },
  { href: "/applications", label: "Applications" },
  { href: "/companies", label: "Companies" },
  { href: "/profile", label: "Profile" },
  { href: "/searches", label: "Searches" },
  { href: "/answers", label: "Answers" },
  { href: "/preferences", label: "Preferences" },
];

// Later phases, shown so the shape of the tool is visible from day one.
const UPCOMING = ["Inbox", "Telegram"];

export function Nav() {
  const pathname = usePathname();
  return (
    <aside className="border-b border-line bg-panel md:sticky md:top-0 md:h-screen md:w-56 md:shrink-0 md:border-b-0 md:border-r">
      <div className="flex items-center gap-6 px-4 py-3 md:block md:px-5 md:py-6">
        <Link href="/" className="flex items-center gap-2 font-mono text-sm font-semibold tracking-tight">
          <span aria-hidden className="inline-block size-2.5 rotate-45 bg-accent" />
          sortie
        </Link>
        <nav className="flex gap-1 overflow-x-auto md:mt-8 md:flex-col md:gap-0.5">
          {LIVE.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                  active ? "bg-sunken font-medium text-ink" : "text-muted hover:bg-sunken hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden md:mt-8 md:block">
          <p className="px-2.5 font-mono text-[11px] uppercase tracking-wider text-faint">Coming up</p>
          <ul className="mt-2 space-y-0.5">
            {UPCOMING.map((label) => (
              <li key={label} className="px-2.5 py-1.5 text-sm text-faint">
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
}
