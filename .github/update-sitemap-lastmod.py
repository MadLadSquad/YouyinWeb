#!/usr/bin/env python3
"""Refresh <lastmod> in sitemap.xml from git history.

Run from the repo root in CI. For every <url> entry we set <lastmod> to the most
recent git commit date among the source files that affect that page's rendered
output: its own template plus the shared chrome and translations. The date is
derived from git, so a page's <lastmod> only moves when that page (or something
it depends on) actually changed — "when needed", and idempotent across runs.

Edits are done as targeted text replacements so the file's comments, formatting
and xhtml:link alternates are preserved and the diff stays minimal.
"""

import re
import subprocess
import sys

SITEMAP = "sitemap.xml"

# Shared by every page — a change here changes every rendered page.
SHARED = [
    "Components/head.tmpl.html",
    "Components/header.tmpl.html",
    "Components/footer.tmpl.html",
    "Translations/en_US.yaml",
    "Translations/bg_BG.yaml",
]

# Production URL path (no scheme/host, no trailing slash) -> page source file(s).
PAGE_SOURCES = {
    "/en_US": ["index.html"],
    "/en_US/marketplace": ["marketplace.html"],
    "/en_US/deck": ["deck.html"],
    "/en_US/account": ["account.html"],
}


def last_modified(files):
    """Most recent git committer date (YYYY-MM-DD) across the given files, or None."""
    dates = []
    for f in files:
        out = subprocess.run(
            ["git", "log", "-1", "--format=%cs", "--", f],
            capture_output=True, text=True,
        ).stdout.strip()
        if out:
            dates.append(out)
    return max(dates) if dates else None


def loc_key(loc):
    return loc.split("youyin.madladsquad.com", 1)[-1].rstrip("/")


def update_block(block):
    loc = re.search(r"<loc>\s*(.*?)\s*</loc>", block)
    if not loc:
        return block
    sources = PAGE_SOURCES.get(loc_key(loc.group(1)))
    if not sources:
        print(f"warning: no source mapping for {loc.group(1)}", file=sys.stderr)
        return block
    date = last_modified(sources + SHARED)
    if not date:
        return block
    return re.sub(r"<lastmod>.*?</lastmod>",
                  f"<lastmod>{date}</lastmod>", block, count=1)


def main():
    with open(SITEMAP, encoding="utf-8") as fh:
        text = fh.read()
    new = re.sub(r"<url>.*?</url>", lambda m: update_block(m.group(0)),
                 text, flags=re.S)
    if new != text:
        with open(SITEMAP, "w", encoding="utf-8") as fh:
            fh.write(new)
        print("sitemap.xml: <lastmod> dates updated")
    else:
        print("sitemap.xml: already up to date")


if __name__ == "__main__":
    main()
