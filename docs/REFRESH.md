# Refreshing the home list

The list of homes in the app lives in `assets/houses-data.js`. It is the
**closing pipeline**: every house that is Sold or Settled in MarkSystems.

Since November 2026 it is refreshed **automatically every morning** by a
scheduled Claude task on Jacob's PC ("closing-forms-daily-refresh"), which reads
Estela Data directly. You only need the steps below to run it by hand, or as a
fallback when Estela Data is unavailable.

## Normal way: from Estela Data

1. Ask Claude (with the Estela Data connector) to run this query:

   - view: `houses_summary`
   - dimensions: `house_number`, `expected_settlement_date`, `company_code`,
     `development`, `model`, `elevation`, `address`, `buyer_name`, `superuser_id`
   - filter: `sale_status` equals `Sold`, `Settled`
   - order: `house_number`, limit: `500`

   Save the result as JSON. The script accepts the plain result
   (`{"rows": [...]}`), a bare list of rows, or the file Claude saves large
   tool results to (`[{"type": "text", "text": "..."}]`).
2. Preview, then apply:

   ```
   python docs/refresh_houses.py path/to/result.json --dry-run
   python docs/refresh_houses.py path/to/result.json
   ```
3. Commit and push with the commit message the script prints:

   ```
   git add assets/houses-data.js index.html nho-form.html closing-checklist.html
   git commit -m "Daily Closing Pipeline refresh — N homes (+X added / -Y removed)"
   git push
   ```

   GitHub Pages republishes the site within a minute or two.

## Fallback: from the Looker Studio export

In the Closing Pipeline report, export the table to CSV with **no filters
applied** (it saves to Downloads as `Estela Living Operations_Closing
Pipeline_Table (N).csv`). Then run the same commands with the CSV path, or with
no path to use the newest export in Downloads. Both the old (House Number /
Elev. Code / Buyer) and the November 2026 (House / Elev. / Buyer name) column
layouts work.

## Good to know

- **Big-removal guard:** if a refresh would remove more than 25% of the homes,
  the script stops (a filtered export or a bad query). Fix the source, or add
  `--force` if the removals are real. Truncated query results are refused.
- **Elevation:** Estela Data returns no elevation for ~20 older houses (their
  elevation has no master row). The script keeps the code already in the list.
- **Duplicates:** if the source lists a home twice, the first row is kept.
- **Homes missing from the source:** add them by hand to `houses-data.js`
  with an id starting `MANUAL-` (see `MANUAL-8703SW135THPL`). The refresh keeps
  them at the top and drops them automatically once the address shows up.
  The `TEST0001` practice home is always kept.
- **Saved forms are safe:** forms are stored in Supabase by house number, so
  a refresh never deletes form data. A home that drops off (e.g. a cancelled
  sale) and comes back reappears with its forms intact.
