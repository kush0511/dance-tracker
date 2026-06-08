# Dance Tracker

Mobile-first GitHub Pages site for a chrome-black dance practice deck powered by a Google Sheet.

## Data Source

The site reads from this Google Sheet:

https://docs.google.com/spreadsheets/d/1GNIUlLSlFTDkhrSnxI1LlMSjP72bmB3ggdLRjviJpFc/edit?usp=sharing

The first row is treated as headers. Columns with names like `Dance Name`, `Song`, `Title`, or `Name` become the row title. Columns with names like `YT Link`, `YouTube`, `Video`, `Link`, or `URL` become the inline YouTube embed.

## Local Preview

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.
