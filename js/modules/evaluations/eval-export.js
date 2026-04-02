// Evaluation export — Excel (matching CDS 4900/5900 layout) and PDF
import { CLINICAL_SKILLS, CLINICAL_FOUNDATIONS, ESSENTIAL_FUNCTIONS } from '../../utils/competencies.js';

let XLSX = null;

async function loadSheetJS() {
  if (XLSX) return XLSX;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
    script.onload = () => { XLSX = window.XLSX; resolve(XLSX); };
    script.onerror = () => reject(new Error('Failed to load SheetJS'));
    document.head.appendChild(script);
  });
}

function fmtRating(val) {
  if (val === null || val === undefined) return '';
  if (val === 'na') return 'N/A';
  return val;
}

function fmtAvg(ratings, period) {
  const values = Object.values(ratings)
    .map((r) => r[period])
    .filter((v) => v !== null && v !== undefined && v !== 'na');
  if (values.length === 0) return '';
  return (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2);
}

function calcGrade(avgStr) {
  const avg = parseFloat(avgStr);
  if (isNaN(avg)) return '';
  if (avg >= 2.4) return 'A';
  if (avg >= 1.86) return 'B';
  if (avg >= 1.0) return 'C';
  return '';
}

export async function exportEvaluationExcel(clinician, evaluation, settings) {
  const xlsx = await loadSheetJS();
  const wb = xlsx.utils.book_new();

  buildEvalSheet(xlsx, wb, clinician, evaluation, settings);
  buildEFSheet(xlsx, wb, clinician, evaluation);

  const semName = settings ? settings.name : 'export';
  const fileName = `${clinician.name.replace(/\s+/g, '_')}_${semName}_Evaluation.xlsx`;
  xlsx.writeFile(wb, fileName);
}

function buildEvalSheet(xlsx, wb, clinician, evaluation, settings) {
  const supervisor = settings ? settings.supervisor : '';
  const semName    = settings ? settings.name : '';

  const csAvgMid = fmtAvg(evaluation.clinicalSkillRatings, 'midterm');
  const csAvgFin = fmtAvg(evaluation.clinicalSkillRatings, 'final');
  const cfAvgMid = fmtAvg(evaluation.clinicalFoundationRatings, 'midterm');
  const cfAvgFin = fmtAvg(evaluation.clinicalFoundationRatings, 'final');

  // Total = average of CS avg and CF avg
  function totalAvg(csA, cfA) {
    const a = parseFloat(csA), b = parseFloat(cfA);
    if (isNaN(a) && isNaN(b)) return '';
    if (isNaN(a)) return b.toFixed(2);
    if (isNaN(b)) return a.toFixed(2);
    return ((a + b) / 2).toFixed(2);
  }

  const totMid = totalAvg(csAvgMid, cfAvgMid);
  const totFin = totalAvg(csAvgFin, cfAvgFin);

  const rows = [];

  // Row 1-2: Title
  rows.push(['CDS 4900/5900 Midterm/Final Evaluation']);
  rows.push(['Eastern Illinois University — Department of Communication Disorders & Sciences']);
  // Row 3-4: Clinician info
  rows.push([`Clinician: ${clinician.name}`, '', `Client: ${clinician.clientInitials}`]);
  rows.push([`Supervisor: ${supervisor}`, '', `Semester: ${semName}`]);
  // Row 5: blank
  rows.push([]);
  // Row 6-8: Rating/grading scale
  rows.push(['Rating Scale:', '3 = Established', '2 = Developing', '1 = Emerging']);
  rows.push(['Grading Scale:', 'A = 2.4–3.0', 'B = 1.86–2.39', 'C = 1.0–1.85']);
  rows.push([`Midterm Date: ${evaluation.midtermDate || ''}`, '', `Final Date: ${evaluation.finalDate || ''}`]);
  // Row 9-10: blank + column headers
  rows.push([]);
  rows.push(['', 'CLINICAL SKILLS', '', 'Midterm', 'Final']); // row index 9 = spreadsheet row 10
  // Rows 11-26: Clinical skills (row indices 10-25)
  CLINICAL_SKILLS.forEach((cs) => {
    rows.push([
      cs.id.toUpperCase(),
      cs.label,
      cs.description,
      fmtRating(evaluation.clinicalSkillRatings[cs.id]?.midterm),
      fmtRating(evaluation.clinicalSkillRatings[cs.id]?.final),
    ]);
  });
  // Row 27: CS average
  rows.push(['', 'Clinical Skills Average', '', csAvgMid, csAvgFin]);
  // Row 28: blank
  rows.push([]);
  // Row 29: CF header
  rows.push(['', 'CLINICAL FOUNDATIONS', '', 'Midterm', 'Final']);
  // Rows 30-34: Clinical foundations
  CLINICAL_FOUNDATIONS.forEach((cf) => {
    rows.push([
      cf.id.toUpperCase(),
      cf.label,
      cf.description,
      fmtRating(evaluation.clinicalFoundationRatings[cf.id]?.midterm),
      fmtRating(evaluation.clinicalFoundationRatings[cf.id]?.final),
    ]);
  });
  // Row 35: CF average
  rows.push(['', 'Clinical Foundations Average', '', cfAvgMid, cfAvgFin]);
  // Row 36: blank
  rows.push([]);
  // Row 37-38: Total + Grade
  rows.push(['', 'TOTAL RATING', '', totMid, totFin]);
  rows.push(['', 'GRADE', '', calcGrade(totMid), calcGrade(totFin)]);
  // Rows 39-40: blank
  rows.push([]);
  rows.push([]);
  // Row 41+: Comments
  rows.push(['MIDTERM COMMENTS']);
  rows.push([evaluation.midtermComments || '']);
  rows.push([]);
  rows.push(['FINAL COMMENTS']);
  rows.push([evaluation.finalComments || '']);

  const ws = xlsx.utils.aoa_to_sheet(rows);

  ws['!cols'] = [
    { wch: 8 },  // ID
    { wch: 22 }, // Label
    { wch: 50 }, // Description
    { wch: 12 }, // Midterm
    { wch: 12 }, // Final
  ];

  // Bold title rows and headers
  const boldRows = new Set([0, 1, 9, 27, 28, 34, 35, 36, 37, 38, 39, 40]);
  const range = xlsx.utils.decode_range(ws['!ref']);
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = xlsx.utils.encode_cell({ r, c });
      if (!ws[addr]) continue;
      if (!ws[addr].s) ws[addr].s = {};
      ws[addr].s.alignment = { wrapText: true, vertical: 'top' };
      if (r === 0) ws[addr].s.font = { bold: true, sz: 14 };
      else if (boldRows.has(r)) ws[addr].s.font = { bold: true };
    }
  }

  xlsx.utils.book_append_sheet(wb, ws, 'Evaluation');
}

function buildEFSheet(xlsx, wb, clinician, evaluation) {
  const allItems = Object.values(ESSENTIAL_FUNCTIONS).flatMap((c) => c.items);
  const activeDates = (clinician.schedule || []).filter((s) => !s.skipped).map((s) => s.date);

  const rows = [];
  rows.push([`Essential Functions — ${clinician.name}`]);
  rows.push([]);

  // Domain header row
  const domainRow = ['Date'];
  Object.entries(ESSENTIAL_FUNCTIONS).forEach(([domain, cat]) => {
    domainRow.push(cat.label);
    for (let i = 1; i < cat.items.length; i++) domainRow.push('');
  });
  rows.push(domainRow);

  // Item header row
  rows.push(['Date', ...allItems]);

  // Data rows
  for (const date of activeDates) {
    const dateData = (evaluation.essentialFunctions || {})[date] || {};
    rows.push([date, ...allItems.map((item) => (dateData[item] ? '✓' : ''))]);
  }

  // Totals row
  const totalsRow = ['Total'];
  for (const item of allItems) {
    const n = activeDates.reduce((sum, date) => {
      const dd = (evaluation.essentialFunctions || {})[date] || {};
      return sum + (dd[item] ? 1 : 0);
    }, 0);
    totalsRow.push(n || '');
  }
  rows.push(totalsRow);

  const ws = xlsx.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, ...allItems.map(() => ({ wch: 5 }))];

  const range = xlsx.utils.decode_range(ws['!ref']);
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = xlsx.utils.encode_cell({ r, c });
      if (!ws[addr]) continue;
      if (!ws[addr].s) ws[addr].s = {};
      ws[addr].s.alignment = { horizontal: 'center', vertical: 'top' };
      if (r === 0) ws[addr].s.font = { bold: true, sz: 13 };
      if (r === 2 || r === 3) ws[addr].s.font = { bold: true };
    }
  }

  xlsx.utils.book_append_sheet(wb, ws, 'Essential Functions');
}

// --- PDF export via print window ---

export function exportEvaluationPdf(clinician, evaluation, settings) {
  const supervisor = settings ? settings.supervisor : '';
  const semName    = settings ? settings.name : '';

  function fmtR(val) {
    if (val === null || val === undefined) return '—';
    if (val === 'na') return 'N/A';
    return val;
  }

  function avg(ratings, period) {
    const values = Object.values(ratings)
      .map((r) => r[period])
      .filter((v) => v !== null && v !== undefined && v !== 'na');
    if (values.length === 0) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  function grade(a) {
    if (a === null) return '—';
    if (a >= 2.4) return 'A';
    if (a >= 1.86) return 'B';
    if (a >= 1.0) return 'C';
    return '—';
  }

  const csAMid = avg(evaluation.clinicalSkillRatings, 'midterm');
  const csAFin = avg(evaluation.clinicalSkillRatings, 'final');
  const cfAMid = avg(evaluation.clinicalFoundationRatings, 'midterm');
  const cfAFin = avg(evaluation.clinicalFoundationRatings, 'final');

  function totalAvg(a, b) {
    if (a === null && b === null) return null;
    if (a === null) return b;
    if (b === null) return a;
    return (a + b) / 2;
  }

  const totMid = totalAvg(csAMid, cfAMid);
  const totFin = totalAvg(csAFin, cfAFin);

  function fmtA(v) { return v !== null ? v.toFixed(2) : '—'; }

  function ratingColor(v) {
    if (v === null || v === undefined) return '';
    if (v <= 1.5) return 'color:#92400e;background:#fef3c7;';
    if (v <= 2.5) return 'color:#374151;background:#f3f4f6;';
    return 'color:#065f46;background:#d1fae5;';
  }

  function ratingRows(competencies, ratings) {
    return competencies.map((item) => {
      const mid = ratings[item.id]?.midterm ?? null;
      const fin = ratings[item.id]?.final ?? null;
      return `<tr>
        <td style="font-size:11px;color:#6b7280;width:50px;">${item.id.toUpperCase()}</td>
        <td>${item.label}<br><span style="font-size:10px;color:#9ca3af;">${item.description}</span></td>
        <td style="text-align:center;padding:4px 8px;">
          <span style="padding:2px 8px;border-radius:4px;font-weight:600;${ratingColor(mid)}">${fmtR(mid)}</span>
        </td>
        <td style="text-align:center;padding:4px 8px;">
          <span style="padding:2px 8px;border-radius:4px;font-weight:600;${ratingColor(fin)}">${fmtR(fin)}</span>
        </td>
      </tr>`;
    }).join('');
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Evaluation — ${clinician.name} — ${semName}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 24px; }
    h1 { font-size: 16px; margin-bottom: 2px; }
    h2 { font-size: 13px; margin: 16px 0 6px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 12px; font-size: 12px; }
    .legend { font-size: 11px; color: #555; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    th { text-align: left; font-size: 11px; background: #f3f4f6; padding: 4px 6px; border: 1px solid #e5e7eb; }
    td { padding: 5px 6px; border: 1px solid #e5e7eb; vertical-align: top; font-size: 11px; }
    .avg-row td { font-weight: bold; background: #f9fafb; }
    .overall { display: grid; grid-template-columns: 1fr 120px 120px; gap: 8px; margin-bottom: 16px; }
    .overall-label { font-weight: 600; font-size: 13px; }
    .overall-val { text-align: center; font-size: 20px; font-weight: 800; }
    .grade-A { color: #065f46; }
    .grade-B { color: #1e40af; }
    .grade-C { color: #92400e; }
    .comments-section { margin-bottom: 12px; }
    .comments-label { font-weight: 600; font-size: 12px; margin-bottom: 4px; }
    .comments-body { font-size: 12px; white-space: pre-wrap; border: 1px solid #e5e7eb; padding: 8px; border-radius: 4px; min-height: 40px; }
    @media print { body { margin: 12px; } }
  </style>
</head>
<body>
  <h1>CDS 4900/5900 Midterm/Final Evaluation</h1>
  <div class="meta">
    <div><strong>Clinician:</strong> ${clinician.name}</div>
    <div><strong>Client:</strong> ${clinician.clientInitials}</div>
    <div><strong>Supervisor:</strong> ${supervisor}</div>
    <div><strong>Semester:</strong> ${semName}</div>
    <div><strong>Midterm Date:</strong> ${evaluation.midtermDate || '—'}</div>
    <div><strong>Final Date:</strong> ${evaluation.finalDate || '—'}</div>
  </div>
  <div class="legend">
    Rating Scale: 3 = Established &nbsp;|&nbsp; 2 = Developing &nbsp;|&nbsp; 1 = Emerging &nbsp;&nbsp;&nbsp;
    Grades: A = 2.4–3.0 &nbsp;|&nbsp; B = 1.86–2.39 &nbsp;|&nbsp; C = 1.0–1.85
  </div>

  <h2>Clinical Skills</h2>
  <table>
    <thead>
      <tr><th style="width:50px;">#</th><th>Description</th><th style="width:80px;text-align:center;">Midterm</th><th style="width:80px;text-align:center;">Final</th></tr>
    </thead>
    <tbody>
      ${ratingRows(CLINICAL_SKILLS, evaluation.clinicalSkillRatings)}
    </tbody>
    <tfoot>
      <tr class="avg-row">
        <td colspan="2">Clinical Skills Average</td>
        <td style="text-align:center;">${fmtA(csAMid)}</td>
        <td style="text-align:center;">${fmtA(csAFin)}</td>
      </tr>
    </tfoot>
  </table>

  <h2>Clinical Foundations</h2>
  <table>
    <thead>
      <tr><th style="width:50px;">#</th><th>Description</th><th style="width:80px;text-align:center;">Midterm</th><th style="width:80px;text-align:center;">Final</th></tr>
    </thead>
    <tbody>
      ${ratingRows(CLINICAL_FOUNDATIONS, evaluation.clinicalFoundationRatings)}
    </tbody>
    <tfoot>
      <tr class="avg-row">
        <td colspan="2">Clinical Foundations Average</td>
        <td style="text-align:center;">${fmtA(cfAMid)}</td>
        <td style="text-align:center;">${fmtA(cfAFin)}</td>
      </tr>
    </tfoot>
  </table>

  <div class="overall">
    <div class="overall-label">Total Rating</div>
    <div class="overall-val">${fmtA(totMid)}</div>
    <div class="overall-val">${fmtA(totFin)}</div>
    <div class="overall-label" style="font-size:11px;color:#6b7280;">Midterm / Final</div>
    <div></div><div></div>
    <div class="overall-label">Grade</div>
    <div class="overall-val ${`grade-${grade(totMid)}`}">${grade(totMid)}</div>
    <div class="overall-val ${`grade-${grade(totFin)}`}">${grade(totFin)}</div>
  </div>

  <div class="comments-section">
    <div class="comments-label">Midterm Comments</div>
    <div class="comments-body">${evaluation.midtermComments || ''}</div>
  </div>
  <div class="comments-section">
    <div class="comments-label">Final Comments</div>
    <div class="comments-body">${evaluation.finalComments || ''}</div>
  </div>

  <script>window.onload = function() { window.print(); }<\/script>
</body>
</html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
}
