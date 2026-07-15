# -*- coding: utf-8 -*-
# Stamps a fresh ?v=<version> query string onto every local assets/ reference
# (styles.css, and every assets/*.js) across index.html, nho-form.html, and
# closing-checklist.html. Run this and commit BEFORE every push so nobody's
# browser can silently keep serving an old cached copy of the app after an
# update — each deploy gets a brand new URL for every asset file.
#
# Usage: python docs/bump_cache_version.py
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGES = ["index.html", "nho-form.html", "closing-checklist.html"]
VERSION = time.strftime("%Y%m%d%H%M%S", time.gmtime())

pattern = re.compile(r'(assets/[a-zA-Z0-9_\-]+\.(?:js|css))(\?v=[^"]*)?"')

def bump(path):
    text = path.read_text(encoding="utf-8")
    new_text, count = pattern.subn(lambda m: f'{m.group(1)}?v={VERSION}"', text)
    if new_text != text:
        path.write_text(new_text, encoding="utf-8")
    return count

def main():
    total = 0
    for name in PAGES:
        p = ROOT / name
        if not p.exists():
            print(f"SKIP (not found): {name}")
            continue
        n = bump(p)
        print(f"{name}: stamped {n} asset reference(s) with v={VERSION}")
        total += n
    print(f"Done. New version: {VERSION} ({total} references updated across {len(PAGES)} pages)")

if __name__ == "__main__":
    main()
