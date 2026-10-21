# -*- coding: utf-8 -*-
# Rebuilds assets/houses-data.js from a "Closing Pipeline_Table" CSV export,
# prints what changed (added / removed / updated homes), then stamps a new
# cache version so everyone's browser picks up the new list.
#
# Hand-added homes are kept: any entry whose id starts with TEST or MANUAL-
# stays at the top of the list, unless its address now appears in the report
# (then the real report row replaces it).
#
# Usage:
#   python docs/refresh_houses.py                 # newest export in ~/Downloads
#   python docs/refresh_houses.py path/to/file.csv
#   python docs/refresh_houses.py --dry-run       # show changes, write nothing
import csv
import glob
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "assets" / "houses-data.js"
EXPORT_GLOB = os.path.join(Path.home(), "Downloads", "*Closing Pipeline_Table*.csv")
FIELDS = ["id", "settDate", "company", "dev", "houseNumber", "model", "elevCode", "address", "buyer", "pm"]

# A full export has ~150 rows; filtered exports from the report are much
# smaller. Refuse to drop more than this share of homes without --force.
MAX_REMOVED_SHARE = 0.25


def clean(value):
    value = (value or "").strip()
    return "" if value == "-" else value


def to_iso(us_date):
    us_date = clean(us_date)
    if not us_date:
        return ""
    return datetime.strptime(us_date, "%m/%d/%Y").strftime("%Y-%m-%d")


def norm_address(address):
    return re.sub(r"[^a-z0-9]", "", address.lower())


def read_csv(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    required = ["Sett. Date", "Comp.", "Dev.", "House Number", "Model", "Elev. Code", "Address", "Buyer", "PM"]
    missing = [c for c in required if c not in (rows[0].keys() if rows else [])]
    if missing:
        sys.exit(f"ERROR: {path} is missing columns {missing} — is this a Closing Pipeline_Table export?")
    houses = []
    seen = set()
    for r in rows:
        house_number = clean(r["House Number"])
        if not house_number:
            continue
        # The report sometimes repeats a home (e.g. once per lender record);
        # the forms are keyed by house number, so keep the first row only.
        if house_number in seen:
            print(f"  duplicate row in report, keeping first: {house_number} {clean(r['Address'])}")
            continue
        seen.add(house_number)
        houses.append({
            "id": house_number,
            "settDate": to_iso(r["Sett. Date"]),
            "company": clean(r["Comp."]),
            "dev": clean(r["Dev."]),
            "houseNumber": house_number,
            "model": clean(r["Model"]),
            "elevCode": clean(r["Elev. Code"]),
            "address": clean(r["Address"]),
            "buyer": clean(r["Buyer"]),
            "pm": clean(r["PM"]),
        })
    # Newest closing first, same as the existing file.
    houses.sort(key=lambda h: h["settDate"], reverse=True)
    return houses


def read_existing():
    text = DATA_FILE.read_text(encoding="utf-8")
    houses = []
    for line in re.findall(r"^\s*\{ id: .*\},?\s*$", text, re.M):
        houses.append(dict(re.findall(r'(\w+): "((?:[^"\\]|\\.)*)"', line)))
    return text, houses


def js_str(value):
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def render(text, houses):
    lines = ["    { " + ", ".join(f"{k}: {js_str(h.get(k, ''))}" for k in FIELDS) + " },"
             for h in houses]
    start = text.index("const houses = [")
    end = text.index("];", start)
    return text[:start] + "const houses = [\n" + "\n".join(lines) + "\n  " + text[end:]


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry_run = "--dry-run" in sys.argv
    force = "--force" in sys.argv
    if args:
        csv_path = args[0]
    else:
        exports = glob.glob(EXPORT_GLOB)
        if not exports:
            sys.exit(f"ERROR: no export found matching {EXPORT_GLOB}")
        csv_path = max(exports, key=os.path.getmtime)
    print(f"Report: {csv_path}")
    print(f"  exported {datetime.fromtimestamp(os.path.getmtime(csv_path)):%Y-%m-%d %H:%M}")

    report = read_csv(csv_path)
    text, existing = read_existing()

    report_addresses = {norm_address(h["address"]) for h in report}
    manual = []
    for h in existing:
        if not h["id"].startswith(("TEST", "MANUAL-")):
            continue
        if h["id"].startswith("MANUAL-") and norm_address(h["address"]) in report_addresses:
            print(f"  manual entry now in report, dropping placeholder: {h['address']}")
            continue
        manual.append(h)

    old = {h["id"]: h for h in existing if not h["id"].startswith(("TEST", "MANUAL-"))}
    new = {h["id"]: h for h in report}
    added = [new[i] for i in new if i not in old]
    removed = [old[i] for i in old if i not in new]
    changed = []
    for i in new.keys() & old.keys():
        diffs = [f"{k}: {old[i].get(k, '')!r} -> {new[i][k]!r}" for k in FIELDS if old[i].get(k, "") != new[i][k]]
        if diffs:
            changed.append((new[i], diffs))

    print(f"\n{len(report)} homes in report ({len(old)} before) — +{len(added)} added / -{len(removed)} removed / {len(changed)} updated")
    for h in added:
        print(f"  + {h['id']}  {h['address']}  ({h['buyer']}, closing {h['settDate'] or 'TBD'})")
    for h in removed:
        print(f"  - {h['id']}  {h['address']}  ({h['buyer']})")
    for h, diffs in changed:
        print(f"  ~ {h['id']}  {h['address']}: " + "; ".join(diffs))

    if old and len(removed) > MAX_REMOVED_SHARE * len(old) and not force:
        sys.exit(f"\nSTOPPED: this would remove {len(removed)} of {len(old)} homes. The export is probably "
                 "filtered — re-export the full Closing Pipeline table, or rerun with --force if it's right.")
    if dry_run:
        print("\n--dry-run: nothing written.")
        return

    DATA_FILE.write_text(render(text, manual + report), encoding="utf-8")
    print(f"\nWrote {DATA_FILE.relative_to(ROOT)} ({len(manual) + len(report)} entries incl. {len(manual)} manual/test)")
    subprocess.run([sys.executable, str(ROOT / "docs" / "bump_cache_version.py")], check=True)
    print(f"\nSuggested commit message:\n  Daily Closing Pipeline refresh — {len(report)} homes "
          f"(+{len(added)} added / -{len(removed)} removed)")


if __name__ == "__main__":
    main()
