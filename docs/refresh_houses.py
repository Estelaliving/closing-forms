# -*- coding: utf-8 -*-
# Rebuilds assets/houses-data.js from the closing pipeline (every Sold or
# Settled house), prints what changed (added / removed / updated homes), then
# stamps a new cache version so everyone's browser picks up the new list.
#
# Two sources work:
#   - a JSON file of Estela Data (Cube) houses_summary rows — the normal way
#     since Nov 2026, see docs/REFRESH.md for the exact query;
#   - a "Closing Pipeline_Table" CSV export from the Looker Studio report.
#
# Hand-added homes are kept: any entry whose id starts with TEST or MANUAL-
# stays at the top of the list, unless its address now appears in the report
# (then the real report row replaces it).
#
# Usage:
#   python docs/refresh_houses.py path/to/cube-rows.json
#   python docs/refresh_houses.py path/to/file.csv
#   python docs/refresh_houses.py                 # newest CSV export in ~/Downloads
#   python docs/refresh_houses.py ... --dry-run   # show changes, write nothing
import csv
import glob
import json
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


def to_iso(date):
    date = clean(date)
    if not date:
        return ""
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", date[:10]):  # Cube: YYYY-MM-DD
        return date[:10]
    return datetime.strptime(date, "%m/%d/%Y").strftime("%Y-%m-%d")


def norm_address(address):
    return re.sub(r"[^a-z0-9]", "", address.lower())


def code(value):
    # Since Nov 2026 the report labels codes, e.g. "MO-Marion Oaks", "A2-";
    # keep just the code before the first dash.
    return clean(value).split("-", 1)[0].strip()


# Field -> accepted report column names (older export name first).
COLUMNS = {
    "settDate": ["Sett. Date"],
    "company": ["Comp."],
    "dev": ["Dev."],
    "houseNumber": ["House Number", "House"],
    "model": ["Model"],
    "elevCode": ["Elev. Code", "Elev."],
    "address": ["Address"],
    "buyer": ["Buyer", "Buyer name"],
    "pm": ["PM"],
}


# Field -> Estela Data houses_summary dimension. The pipeline's closing date
# is expected_settlement_date (the settlement date once settled).
CUBE_FIELDS = {
    "settDate": "expected_settlement_date",
    "company": "company_code",
    "dev": "development",
    "houseNumber": "house_number",
    "model": "model",
    "elevCode": "elevation",
    "address": "address",
    "buyer": "buyer_name",
    "pm": "superuser_id",
}


def read_cube_json(path):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    # Accept the query result as Claude saves it: [{"type": "text", "text": "<json>"}].
    if isinstance(data, list) and data and isinstance(data[0], dict) and data[0].get("type") == "text":
        data = json.loads("".join(part.get("text", "") for part in data))
    if isinstance(data, dict) and data.get("truncated"):
        sys.exit(f"ERROR: {path} is a truncated query result — raise the limit and query again.")
    rows = data["rows"] if isinstance(data, dict) else data
    if not rows:
        sys.exit(f"ERROR: {path} has no rows.")
    missing = [d for d in CUBE_FIELDS.values() if d not in rows[0]]
    if missing:
        sys.exit(f"ERROR: {path} rows are missing {missing} — rerun the houses_summary query in docs/REFRESH.md.")
    if "sale_status" in rows[0]:
        rows = [r for r in rows if r["sale_status"] in ("Sold", "Settled")]
    return to_houses([{field: r.get(dim) or "" for field, dim in CUBE_FIELDS.items()} for r in rows])


def read_csv(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    header = rows[0].keys() if rows else []
    col = {}
    for field, names in COLUMNS.items():
        found = [n for n in names if n in header]
        if not found:
            sys.exit(f"ERROR: {path} has no {' / '.join(repr(n) for n in names)} column — "
                     "is this a Closing Pipeline_Table export?")
        col[field] = found[0]
    return to_houses([{field: r[name] for field, name in col.items()} for r in rows])


def to_houses(rows):
    houses = []
    seen = set()
    for r in rows:
        house_number = clean(r["houseNumber"])
        if not house_number:
            continue
        # The report sometimes repeats a home (e.g. once per lender record);
        # the forms are keyed by house number, so keep the first row only.
        if house_number in seen:
            print(f"  duplicate row in report, keeping first: {house_number} {clean(r['address'])}")
            continue
        seen.add(house_number)
        houses.append({
            "id": house_number,
            "settDate": to_iso(r["settDate"]),
            "company": code(r["company"]),
            "dev": code(r["dev"]),
            "houseNumber": house_number,
            "model": code(r["model"]),
            "elevCode": code(r["elevCode"]),
            "address": clean(r["address"]),
            "buyer": clean(r["buyer"]),
            "pm": clean(r["pm"]),
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

    report = read_cube_json(csv_path) if csv_path.lower().endswith(".json") else read_csv(csv_path)
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
    # Estela Data returns no elevation for some older houses whose elevation
    # has no master row (the Looker report showed just the code, e.g. "A2").
    # Keep the code we already have rather than blanking it.
    for i in new.keys() & old.keys():
        if not new[i]["elevCode"] and old[i].get("elevCode"):
            new[i]["elevCode"] = old[i]["elevCode"]
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
