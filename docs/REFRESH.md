# Refreshing the home list

The list of homes in the app lives in `assets/houses-data.js`. It is rebuilt
from the **Closing Pipeline** report in Estela Living Operations. Do this
whenever homes are added or closing dates move (Luis did it a few times a week).

## Steps

1. In Estela Living Operations, open the **Closing Pipeline** table with **no
   filters applied** and export it to CSV. It saves to Downloads as
   `Estela Living Operations_Closing Pipeline_Table (N).csv`.
2. From the repo folder, preview the changes:

   ```
   python docs/refresh_houses.py --dry-run
   ```

   It picks the newest export in Downloads and lists homes added (+),
   removed (-) and updated (~). Read it over: removals mean a home dropped
   off the report.
3. Apply it:

   ```
   python docs/refresh_houses.py
   ```

   This rewrites `assets/houses-data.js` and runs `bump_cache_version.py`
   so browsers load the new list.
4. Commit and push using the commit message the script prints:

   ```
   git add -A
   git commit -m "Daily Closing Pipeline refresh — N homes (+X added / -Y removed)"
   git push
   ```

   GitHub Pages republishes the site within a minute or two.

## Good to know

- **Use a specific file:** `python docs/refresh_houses.py "C:\path\to\export.csv"`.
- **Filtered export guard:** if a refresh would remove more than 25% of the
  homes, the script stops, because that usually means the export was filtered.
  Re-export the full table, or add `--force` if the removals are real.
- **Duplicate rows:** the report sometimes lists a home twice. The script keeps
  the first row and prints a note.
- **Homes missing from the report:** add them by hand to `houses-data.js`
  with an id starting `MANUAL-` (see `MANUAL-8703SW135THPL`). The refresh keeps
  them at the top and removes them automatically once the address shows up
  in the report. The `TEST0001` practice home is always kept.
- **Saved forms are safe:** forms are stored in Supabase by house number, so
  a refresh never deletes form data. A home that drops off the report and
  comes back reappears with its forms intact.
