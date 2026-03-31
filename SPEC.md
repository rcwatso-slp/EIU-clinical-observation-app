# Clinical Observation Notes App — Project Specification

## Overview

A browser-based clinical supervision tool for speech-language pathology clinical instructors at Eastern Illinois University. The app enables supervisors to record real-time observation notes during therapy sessions, track observation hours across the semester, tag notes to competency areas from the department's evaluation form, and export per-clinician Excel files for accreditation and compliance.

**Phase 1 (this build):** Single-supervisor pilot for ~8 clinicians using IndexedDB for local persistence and manual Excel export to OneDrive.

**Phase 2 (future):** Swap IndexedDB for Microsoft Graph API to read/write directly to OneDrive. Add multi-supervisor support and student access with EIU Microsoft SSO. This requires Azure AD app registration (currently blocked by university IT — revisit after proof of concept).

---

## Architecture

### Hosting
- **GitHub Pages** — static site hosting from a GitHub repository
- **GitHub Actions** — CI/CD for automatic deployment on push to main branch

### Storage (Phase 1)
- **IndexedDB** — browser-native persistent storage on the user's machine
- **Excel export** — user manually saves exported .xlsx files to their OneDrive folder
- Build storage as a **swappable module** (`/src/storage/`) with a defined interface so Phase 2 can replace IndexedDB with Microsoft Graph API by changing one file

### Storage Interface

All storage operations go through a single module that implements these methods:

```javascript
// src/storage/storage.js — Phase 1: IndexedDB implementation
// Phase 2: swap this file for graph-api-storage.js

export async function saveClinician(clinician) {}
export async function getClinician(id) {}
export async function getAllClinicians() {}
export async function deleteClinician(id) {}

export async function saveObservation(clinicianId, observation) {}
export async function getObservations(clinicianId) {}
export async function deleteObservation(clinicianId, observationId) {}

export async function saveSemesterSettings(settings) {}
export async function getSemesterSettings() {}
```

### Tech Stack
- **HTML/CSS/JavaScript** — no framework needed for Phase 1 (keep it simple for GitHub Pages)
- **SheetJS (xlsx)** — for Excel file generation in the browser
- **IndexedDB** via idb wrapper library (lightweight IndexedDB promise wrapper)
- No build step required — vanilla JS with ES modules, or a minimal Vite setup if preferred

---

## Data Model

### Semester Settings
```json
{
  "id": "SP26",
  "name": "SP26",
  "startDate": "2026-01-13",
  "endDate": "2026-04-30",
  "supervisor": "Watson"
}
```

### Clinician
```json
{
  "id": "uuid",
  "name": "Hannah Hout",
  "clientInitials": "RA",
  "sessionDays": "MW",
  "sessionTime": "09:00",
  "room": "2120",
  "sessionLengthMin": 45,
  "schedule": [
    { "date": "2026-01-19", "skipped": false },
    { "date": "2026-01-21", "skipped": false },
    { "date": "2026-01-26", "skipped": true }
  ]
}
```

### Observation Note
```json
{
  "id": "uuid",
  "clinicianId": "uuid",
  "date": "2026-01-19",
  "sessionType": "tx",
  "totalMinutes": 45,
  "minutesObserved": 22,
  "notes": "Free-text observation notes written during the session...",
  "competencyTags": ["cs4", "cs7", "cf2"],
  "createdAt": "2026-01-19T10:15:00Z",
  "updatedAt": "2026-01-19T10:15:00Z"
}
```

---

## Competency Framework

These come directly from the department's CDS 4900/5900 Midterm/Final Evaluation Form and must be used exactly as defined.

### Clinical Skills (16 items, rated 1-3 on evaluations)

| ID | Short Label | Full Description |
|----|-------------|-----------------|
| cs1 | Case history | Collects case history information and integrates information from clients/patients, family, caregivers, teachers, and relevant others, including other professionals (CFCC V-B, 1b) |
| cs2 | Eval procedures | Selects appropriate evaluation procedures (CFCC V-B, 1c) |
| cs3 | Test admin | Administers non-standardized and standardized tests correctly (CFCC V-B, 1c) |
| cs4 | Tx planning | Develops setting-appropriate intervention plans with measurable and achievable goals (CFCC IV-D, V-B, 2a) |
| cs5 | Materials | Selects or develops and uses appropriate materials and instrumentation (CFCC V-B, 2c) |
| cs6 | Task intro | Provides appropriate introduction/explanation of tasks |
| cs7 | Cues/models | Uses appropriate models, prompts or cues. Allows time for patient response. |
| cs8 | Behavior mgmt | Demonstrates effective behavior management skills and motivates client |
| cs9 | Data collection | Measures and evaluates client/patient performance and progress (CFCC V-B, 2d) |
| cs10 | Plan modification | Modifies intervention plans, strategies, materials, or instrumentation to meet individual client/patient needs (CFCC V-B, 2e) |
| cs11 | Documentation | Includes complete and accurate details in therapy plans and SOAP notes |
| cs12 | Report writing | Appropriately summarizes and organizes relevant information in reports |
| cs13 | Impressions | Generates appropriate clinical impressions and recommendations specific to client in reports |
| cs14 | Grammar/format | Uses appropriate grammar, format and spelling in weekly documentation and reports |
| cs15 | EBP | Finds and implements appropriate EBP to guide clinical decisions |
| cs16 | Oral comm | Demonstrates skills in oral communication sufficient for entry into professional practice (CFCC V-A) |

### Clinical Foundations (5 items, rated 1-3 on evaluations)

| ID | Short Label | Full Description |
|----|-------------|-----------------|
| cf1 | Initiative | Demonstrates initiative (actively participates, generates ideas, seeks collaboration and resources) |
| cf2 | Analysis | Demonstrates analysis (interprets, integrates, synthesizes, engages in self evaluation) |
| cf3 | Critical thinking | Demonstrates critical thinking for decision making (integrates EBP, clinical judgement, recommendations, diagnosis, problem solving) |
| cf4 | Flexibility | Demonstrates ability to monitor and display flexibility (engages in self evaluation, aware of bias, makes adjustments, anticipates needs, implements feedback) |
| cf5 | Professionalism | Demonstrates professionalism (adheres to code of ethics; receptive to feedback; prepared and organized; maintains appropriate physical appearance; adheres to timelines, has good attendance and is punctual; demonstrates empathy, enthusiasm; effective collaboration; and passion for client) |

### Rating Scale (used on midterm/final evaluations, NOT on observation notes)
- 3 = Established
- 2 = Developing
- 1 = Emerging

### Grading Scale
- A = 2.4–3.0
- B = 1.86–2.39
- C = 1.0–1.85

---

## Features

### 1. Semester & Roster Setup

**Semester settings:**
- Semester name (e.g., "SP26")
- Start date and end date (user sets manually each semester)
- Supervisor name

**Add clinician form fields:**
- Clinician name (required)
- Client initials (required)
- Session days: Monday/Wednesday or Tuesday/Thursday (dropdown)
- Session time (time input)
- Room number
- Session length in minutes (default: 45)

**On adding a clinician:**
- Auto-generate all session dates between semester start and end dates based on MW or TR schedule
- Dates are displayed in a schedule view where the supervisor can:
  - **Skip** dates (for spring break, holidays, cancellations) — skipped dates are struck through and excluded from totals
  - **Restore** previously skipped dates
  - **Add extra dates** manually (e.g., makeup sessions)

**Roster management:**
- View all clinicians with their schedule info
- Edit clinician details
- Remove a clinician (with confirmation)

### 2. Observation Note Entry

This is the primary workflow — used 16 times per week during live video observation of therapy sessions.

**Interface requirements:**
- Select clinician from a tab/button row at the top
- On selection, show clinician header: name, client, room, session days/time, semester
- Auto-suggest the next unlogged session date from the clinician's schedule
- Session type dropdown: Treatment (Tx) or Evaluation
- Minute tracking:
  - Total session minutes (defaults to clinician's session length)
  - Minutes observed (defaults to half of session length since supervisor observes ~22 min of a 45 min session)
  - Auto-calculated observation percentage for this session
  - Running semester observation percentage (cumulative across all logged sessions)
  - Session number (auto-incremented)
- **Large text area** for free-form observation notes (this is where the supervisor types real-time notes during the session)
- **Competency tags** (optional): clickable tag buttons for all 16 clinical skills and 5 clinical foundations
  - Clinical skills tags in one color group
  - Clinical foundations tags in a distinct color group
  - Multiple tags can be selected per observation
  - Tags are for organizing notes by competency area — they help aggregate feedback at evaluation time
- Save button — saves the observation and clears the form for the next entry
- Clear button — resets the form without saving

### 3. Session History View

Per-clinician view of all logged observations with summary statistics:

**Summary stats (displayed as metric cards):**
- Sessions logged / total scheduled (e.g., "12 / 27")
- Total minutes observed
- Running observation percentage (this is critical for accreditation — must be easily visible)
- Total session minutes / total possible semester minutes

**Note feed:**
- Reverse chronological list of all observations for the selected clinician
- Each entry shows: date, session type (Tx/Eval), minutes observed/total, the full observation text, and any competency tags applied

### 4. Schedule View

Per-clinician view of all semester dates:
- Shows all generated dates with status: logged (checkmark), upcoming, or skipped (struck through)
- Skip/restore toggle for unlogged dates
- Add extra date button
- Visual indicator of which dates have observation notes

### 5. Excel Export

**One Excel file per clinician** matching the structure of the existing observation form.

**The exported Excel file should contain:**

**Sheet 1: Observation Notes**
- Header: Clinician name, Client initials, Supervisor name, Semester
- For each session date: date, minutes observed (Tx), total Tx minutes, Tx % observed, minutes observed (Eval), total Eval minutes, Eval % observed
- Running totals of all minutes and percentages
- Below each date block: the observation notes text
- Summary statistics: total sessions, total minutes observed, overall observation percentage

**Sheet 2: Essential Functions** (tracking grid)
- Rows = session dates
- Columns = Essential function categories:
  - A: Communication Abilities (A1-A8)
  - B: Intellectual/Cognitive (B1-B5)
  - C: Behavioral/Social (C1-C10)
  - D: Motor Abilities (D1-D7)
  - E: Sensory/Observational (E1 a.-i., E2, E3)
- This sheet is currently tracked as checkmarks — the app should include a way to mark these per session (can be a simple checkbox grid)

**Export action:**
- Button labeled "Export Excel" or "Download for OneDrive"
- Generates the .xlsx file in the browser using SheetJS
- Browser download dialog — user saves to their OneDrive folder manually

### 6. Data Management

- **Backup/restore:** Option to export all app data as a JSON file and import it back (safety net in case browser data is cleared)
- **Semester reset:** Ability to archive current semester data and start fresh for a new semester
- **Data persists** in IndexedDB across browser sessions on the same machine

---

## UI Design

### Layout
- Maximum width ~760px, centered
- Clean, flat design — no gradients or heavy shadows
- Professional and utilitarian aesthetic appropriate for a clinical education tool

### Navigation
- Top bar: App title, "Roster Setup" button, "Export Excel" button
- Clinician selector: horizontal row of buttons/tabs showing clinician first names
- View toggle: "New observation" | "Session history" | "Schedule" tabs within each clinician view

### Color Coding
- Clinical skills tags: blue tones
- Clinical foundations tags: purple tones
- MW schedule badge: teal/green
- TR schedule badge: purple
- Logged sessions: blue checkmark
- Skipped sessions: struck through, muted text

### Responsive Considerations
- Primary use is laptop in an office alongside a video observation window
- Should work at ~50% screen width (side-by-side with video feed)
- Mobile is secondary but nice to have for quick checks

---

## File Structure (suggested)

```
clinical-observation-app/
├── index.html
├── css/
│   └── styles.css
├── js/
│   ├── app.js              — main app initialization and routing
│   ├── storage/
│   │   ├── storage.js      — IndexedDB implementation (Phase 1)
│   │   └── types.js        — data type definitions
│   ├── components/
│   │   ├── roster.js       — roster setup UI
│   │   ├── observer.js     — observation note entry form
│   │   ├── history.js      — session history view
│   │   ├── schedule.js     — schedule management view
│   │   └── nav.js          — navigation and clinician selector
│   ├── export/
│   │   └── excel.js        — SheetJS Excel generation
│   └── utils/
│       ├── dates.js        — semester date generation logic
│       └── competencies.js — competency definitions (CS and CF arrays)
├── .github/
│   └── workflows/
│       └── deploy.yml      — GitHub Actions deployment to Pages
├── SPEC.md                 — this file
└── README.md
```

---

## GitHub Actions Deployment

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: '.'
      - id: deployment
        uses: actions/deploy-pages@v4
```

---

## Phase 2 Upgrade Path (Future — OneDrive Integration)

When university IT approves Azure AD app registration:

1. Register app in Azure portal with Microsoft Graph permissions: `Files.ReadWrite` and `User.Read`
2. Implement MSAL.js authentication flow for EIU Microsoft accounts
3. Create `js/storage/graph-storage.js` implementing the same storage interface
4. Swap the import in `app.js` from `storage.js` to `graph-storage.js`
5. App reads/writes clinician files directly to a designated OneDrive folder
6. Each clinician's data is stored as a JSON file in OneDrive (or directly as .xlsx)
7. Add multi-supervisor support: each supervisor authenticates with their own account
8. Add student read-only access: students authenticate and see only their own feedback

---

## Context for Claude Code

- The supervisor (Rud Watson) observes 8 clinicians per week, 2 sessions each (16 total sessions/week)
- Each clinician has one client under this supervisor (they have a second client with a different supervisor)
- Sessions are 45 minutes but the supervisor observes approximately 22 minutes per session (sometimes observing 2 clinicians in one 45-minute block)
- Observation notes are written in real time during video observation from the supervisor's office
- The app will be used alongside a video observation window — design for side-by-side use
- SOAP notes are separate documents (Word files) — not part of this app
- The running observation percentage across all semester sessions is critical for ASHA accreditation compliance
- Each clinician's observation file must be exportable independently — one Excel file per clinician — because they go into individual student compliance files
- The existing evaluation form uses half-point ratings (e.g., 1.5, 2.5) in addition to whole numbers
- The Essential Functions tracking sheet uses checkmarks per session date across 5 domains with multiple sub-items each
