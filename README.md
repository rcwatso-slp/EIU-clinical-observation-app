# Clinical Observation Notes App

A browser-based clinical supervision tool for speech-language pathology clinical instructors at Eastern Illinois University.

## What It Does

- Record real-time observation notes during live video therapy sessions
- Track observation hours and running percentages across the semester (critical for ASHA accreditation)
- Tag notes to competency areas from the CDS 4900/5900 evaluation form (16 clinical skills + 5 clinical foundations)
- Manage clinician rosters and session schedules (MW/TR with skip/restore)
- Export per-clinician Excel files for student compliance records

## Quick Start

1. Open the app at [rcwatso-slp.github.io/EIU-clinical-observation-app](https://rcwatso-slp.github.io/EIU-clinical-observation-app/)
2. Click **Roster Setup** to configure your semester dates and add clinicians
3. Select a clinician tab and start entering observation notes

## Architecture

- **Vanilla HTML/CSS/JavaScript** — no framework, no build step
- **IndexedDB** for local browser storage (data stays on your machine)
- **SheetJS** for in-browser Excel file generation
- **GitHub Pages** for hosting via GitHub Actions

No backend, no database server, no accounts. All data is stored locally in your browser.

## Data Safety

- Use **Data > Export Backup** to save a JSON backup of all app data
- Use **Data > Import Backup** to restore from a backup file
- Back up regularly in case browser data is cleared

## Phase 2 (Future)

When EIU IT approves Azure AD app registration, the storage layer can be swapped to read/write directly to OneDrive via Microsoft Graph API. The storage interface (`js/storage/storage.js`) was designed to make this a one-file replacement.

## File Structure

```
├── index.html              — app shell
├── css/styles.css          — all styles
├── js/
│   ├── app.js              — initialization and routing
│   ├── storage/storage.js  — IndexedDB storage (swappable)
│   ├── components/         — UI components (roster, observer, history, schedule, nav)
│   ├── export/excel.js     — Excel export via SheetJS
│   └── utils/              — date utilities and competency definitions
├── .github/workflows/      — GitHub Pages deployment
└── SPEC.md                 — full project specification
```
