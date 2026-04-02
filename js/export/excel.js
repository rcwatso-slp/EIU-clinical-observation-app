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

function stripHtml(html) {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
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
  const headerRowIdx = 6;
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
      stripHtml(obs.notes),
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

  // Apply text wrapping and formatting to all cells
  const range = xlsx.utils.decode_range(ws['!ref']);
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = xlsx.utils.encode_cell({ r, c });
      if (!ws[addr]) continue;

      // Initialize style if not present
      if (!ws[addr].s) ws[addr].s = {};

      // Wrap text on all cells, especially notes (col 6) and tags (col 7)
      ws[addr].s.alignment = { wrapText: true, vertical: 'top' };

      // Bold the title row
      if (r === 0) {
        ws[addr].s.font = { bold: true, sz: 14 };
      }

      // Bold the header labels (rows 1-4, col 0)
      if (r >= 1 && r <= 4 && c === 0) {
        ws[addr].s.font = { bold: true };
      }

      // Bold column headers row
      if (r === headerRowIdx) {
        ws[addr].s.font = { bold: true };
        ws[addr].s.fill = { fgColor: { rgb: 'E8E8E8' } };
        ws[addr].s.border = {
          bottom: { style: 'thin', color: { rgb: '999999' } },
        };
      }

      // Bold totals row
      if (r === rows.length - 1) {
        ws[addr].s.font = { bold: true };
        ws[addr].s.border = {
          top: { style: 'thin', color: { rgb: '999999' } },
        };
      }
    }
  }

  // Set row heights for data rows — estimate based on notes length
  ws['!rows'] = [];
  for (let r = 0; r < rows.length; r++) {
    if (r > headerRowIdx && r < rows.length - 2) {
      // Data rows: estimate height from notes text length
      const notes = rows[r][6] || '';
      // ~80 chars per line at column width 60, minimum 1 line
      const lineCount = Math.max(1, Math.ceil(notes.length / 80));
      ws['!rows'][r] = { hpt: Math.max(20, lineCount * 15) };
    } else {
      ws['!rows'][r] = { hpt: 20 };
    }
  }

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

  // Header row
  const headerRow = ['Date'];
  for (const cat of Object.values(categories)) {
    headerRow.push(...cat.items);
  }
  rows.push(headerRow);

  // One row per session date
  for (const obs of sorted) {
    const row = [obs.date];
    for (const item of allItems) {
      row.push('');
    }
    rows.push(row);
  }

  const ws = xlsx.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, ...allItems.map(() => ({ wch: 5 }))];

  // Apply formatting
  const range = xlsx.utils.decode_range(ws['!ref']);
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = xlsx.utils.encode_cell({ r, c });
      if (!ws[addr]) continue;
      if (!ws[addr].s) ws[addr].s = {};

      ws[addr].s.alignment = { wrapText: true, vertical: 'top' };

      if (r === 0) {
        ws[addr].s.font = { bold: true, sz: 14 };
      }

      if (r === 2) {
        ws[addr].s.font = { bold: true };
        ws[addr].s.fill = { fgColor: { rgb: 'E8E8E8' } };
      }
    }
  }

  xlsx.utils.book_append_sheet(wb, ws, 'Essential Functions');
}
