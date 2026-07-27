#!/usr/bin/env node
/**
 * Widens the outer content wrapper on every admin page from a narrow
 * max-w-{3xl,4xl,5xl,6xl} container to a near-full-screen max-w-[1800px],
 * per explicit direction ("make all the pages as entire screen pages not
 * like container"). Deliberately narrow in scope: only touches the
 * wrapper div that immediately follows a `min-h-screen` root div (the
 * page's own outer content column), found within the next 3 lines --
 * never touches modals, cards, or other max-w-constrained elements deeper
 * in a page, which are narrow on purpose.
 *
 * Re-runnable: pages already at max-w-7xl or wider, or without the
 * min-h-screen -> max-w-Nxl pattern, are left untouched.
 *
 * Usage: node scripts/widen-admin-pages.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

const NARROW = ["max-w-3xl", "max-w-4xl", "max-w-5xl", "max-w-6xl"];
const WIDE = "max-w-[1800px]";

const files = execSync(
  `grep -rlE 'className="min-h-screen' src/app/admin --include=page.tsx`,
  { cwd: process.cwd(), encoding: "utf8" }
)
  .trim()
  .split("\n")
  .filter(Boolean);

let changed = 0;

for (const file of files) {
  const original = readFileSync(file, "utf8");
  const lines = original.split("\n");
  let touched = false;

  for (let i = 0; i < lines.length; i++) {
    if (!/className="min-h-screen/.test(lines[i])) continue;
    // Look at this line and the next 2 for the narrow max-w wrapper.
    for (let j = i; j < Math.min(i + 3, lines.length); j++) {
      for (const cls of NARROW) {
        if (lines[j].includes(cls) && lines[j].includes("mx-auto")) {
          lines[j] = lines[j].replace(cls, WIDE);
          touched = true;
        }
      }
    }
  }

  if (touched) {
    writeFileSync(file, lines.join("\n"));
    changed++;
    console.log(`widened: ${file}`);
  }
}

console.log(`\nDone. ${changed} file(s) widened.`);
