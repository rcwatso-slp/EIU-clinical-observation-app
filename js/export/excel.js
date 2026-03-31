// Excel export using SheetJS — generates one .xlsx file per clinician
// SheetJS loaded from CDN at runtime

let XLSX = null;

async function loadSheetJS() {
  if (XLSX) return XLSX;

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
    script.onload = () => {
      XLSX = window.XLSX;
      resolve(XLSX);
    };
    script.onerror = () => reject(new Error('Failed to load SheetJS'));
    document.head.appendChild(script);
  });
}

export async function exportClinicianExcel(clinician, observations, settings) {
  const xlsx = await loadSheetJS();

  const wb = xlsx.utils.book_new();

  // --- Sheet 1: Observation Notes ---
  buildObservationSheet(xlsx, wb, clinician, observations, settings);

  // --- Sheet 2: Essential Functions ---
  buildEssentialFunctionsSheet(xlsx, wb, clinician, observations);

  // Download
  const semName = settings ? settings.name : 'export';
  const fileName = `${clinician.name.replace(/\s+/g, '_')}_${semName}_Observations.xlsx`;
  xlsx.writeFile(wb, fileName);
}

function buildObservationSheet(xlsx, wb, clinician, observations, settings) {
  const rows = [];

  // Header
  rows.push(['Clinical Observation Notes']);
  rows.push(['Clinician:', clinician.name]);
  rows.push(['Client:', clinician.clientInitials]);
  rows.push(['Supervisor:', settings ? settings.supervisor : '']);
  rows.push(['Semester:', settings ? settings.name : '']);
  rows.push([]);

  // Column headers
  rows.push([
    'Date', 'Session #', 'Type',
    'Min Observed', 'Total Min', '% Observed',
    'Notes', 'Competency Tags',
  ]);

  // Sort by date
  const sorted = [...observations].sort((a, b) => a.date.localeCompare(b.date));

  let runningObserved = 0;
  let runningTotal = 0;

  sorted.forEach((obs, i) => {
    runningObserved += obs.minutesObserved || 0;
    runningTotal += obs.totalMinutes || 0;
    const pct = obs.totalMinutes > 0 ? (obs.minutesObserved / obs.totalMinutes) : 0;

    rows.push([
      obs.date,
      i + 1,
      obs.sessionType === 'eval' ? 'Eval' : 'Tx',
      obs.minutesObserved || 0,
      obs.totalMinutes || 0,
      Math.round(pct * 100) + '%',
      obs.notes || '',
      (obs.competencyTags || []).join(', '),
    ]);
  });

  // Summary
  rows.push([]);
  const overallPct = runningTotal > 0 ? Math.round((runningObserved / runningTotal) * 100) : 0;
  rows.push(['TOTALS', sorted.length, '', runningObserved, runningTotal, overallPct + '%']);

  const ws = xlsx.utils.aoa_to_sheet(rows);

  // Set column widths
  ws['!cols'] = [
    { wch: 12 }, // Date
    { wch: 10 }, // Session #
    { wch: 6 },  // Type
    { wch: 14 }, // Min Observed
    { wch: 12 }, // Total Min
    { wch: 12 }, // % Observed
    { wch: 60 }, // Notes
    { wch: 30 }, // Tags
  ];

  xlsx.utils.book_append_sheet(wb, ws, 'Observation Notes');
}

function buildEssentialFunctionsSheet(xlsx, wb, clinician, observations) {
  const sorted = [...observations].sort((a, b) => a.date.localeCompare(b.date));

  // Essential function categories
  const categories = {
    A: { label: 'Communication Abilities', items: ['A1','A2','A3','A4','A5','A6','A7','A8'] },
    B: { label: 'Intellectual/Cognitive', items: ['B1','B2','B3','B4','B5'] },
    C: { label: 'Behavioral/Social', items: ['C1','C2','C3','C4','C5','C6','C7','C8','C9','C10'] },
    D: { label: 'Motor Abilities', items: ['D1','D2','D3','D4','D5','D6','D7'] },
    E: { label: 'Sensory/Observational', items: ['E1a','E1b','E1c','E1d','E1e','E1f','E1g','E1h','E1i','E2','E3'] },
  };

  const allItems = Object.values(categories).flatMap((c) => c.items);

  const rows = [];
  rows.push(['Essential Functions Tracking — ' + clinician.name]);
  rows.push([]);

  // Header row with category groupings
  const headerRow = ['Date'];
  for (const cat of Object.values(categories)) {
    headerRow.push(...cat.items);
  }
  rows.push(headerRow);

  // One row per session date (placeholder — checkmarks not stored yet)
  for (const obs of sorted) {
    const row = [obs.date];
    for (const item of allItems) {
      row.push(''); // Empty — to be filled in manually or via future UI
    }
    rows.push(row);
  }

  const ws = xlsx.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, ...allItems.map(() => ({ wch: 5 }))];

  xlsx.utils.book_append_sheet(wb, ws, 'Essential Functions');
}
