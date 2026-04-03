// PDF export for SOAP notes via browser print.
// Opens a formatted print window with all session note content.

export function exportSoapPdf(note, clinician) {
  const html = buildPrintHtml(note, clinician);
  const win  = window.open('', '_blank');
  if (!win) { alert('Please allow pop-ups to export PDF.'); return; }
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 400);
}

function buildPrintHtml(note, clinician) {
  const date = note.sessionDate
    ? new Date(note.sessionDate + 'T12:00:00').toLocaleDateString('en-US', {month:'long', day:'numeric', year:'numeric'})
    : '—';

  const objectives = (note.plan.objectives || []).map((obj, i) => `
    <p><strong>Objective ${i + 1}:</strong> ${esc(obj.objectiveText)}</p>
    ${obj.condition ? `<p style="margin-left:16px">Condition: ${esc(obj.condition)}</p>` : ''}
    ${obj.criterion ? `<p style="margin-left:16px">Criterion: ${esc(obj.criterion)}</p>` : ''}
    <p style="margin-left:16px">Cueing: ${esc(obj.cueingLevel)}</p>
  `).join('');

  const dataRows = (note.soap.objectiveData || []).map((row) => `
    <tr>
      <td>${esc(row.target)}</td>
      <td>${row.trials ?? '—'}</td>
      <td>${row.correct ?? '—'}</td>
      <td>${row.accuracy != null ? row.accuracy + '%' : '—'}</td>
      <td>${esc(row.cueing)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Session Note — ${esc(clinician.name)} Session ${note.sessionNumber}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Times New Roman', serif; font-size: 12pt; color: #000; margin: 0; padding: 32px; }
    h1 { font-size: 16pt; text-align: center; margin: 0 0 4px; }
    .subtitle { text-align: center; font-size: 11pt; margin: 0 0 20px; color: #444; }
    h2 { font-size: 13pt; border-bottom: 1px solid #000; padding-bottom: 2px; margin: 20px 0 8px; }
    h3 { font-size: 12pt; margin: 12px 0 4px; }
    p { margin: 0 0 6px; line-height: 1.5; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 11pt; }
    th, td { border: 1px solid #666; padding: 4px 8px; text-align: left; }
    th { background: #eee; font-weight: bold; }
    .field-label { font-weight: bold; }
    .empty { color: #666; font-style: italic; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>EIU CDS Clinical Supervision Hub</h1>
  <p class="subtitle">Session Note — ${esc(clinician.name)} &nbsp;|&nbsp; Session ${note.sessionNumber} &nbsp;|&nbsp; ${date}</p>

  <h2>Therapy Plan</h2>

  <h3>Long-Term Goal</h3>
  <p>${note.plan.longTermGoal ? esc(note.plan.longTermGoal) : '<span class="empty">Not specified</span>'}</p>

  <h3>Short-Term Objectives</h3>
  ${objectives || '<p class="empty">No objectives</p>'}

  <h3>Methods / Procedures</h3>
  <p>${note.plan.methods ? esc(note.plan.methods) : '<span class="empty">—</span>'}</p>

  <h3>Materials / Stimuli</h3>
  <p>${note.plan.materials ? esc(note.plan.materials) : '<span class="empty">—</span>'}</p>

  <h3>Data Collection Plan</h3>
  <p>${note.plan.dataCollectionPlan ? esc(note.plan.dataCollectionPlan) : '<span class="empty">—</span>'}</p>

  <h2>SOAP Note</h2>

  <h3>Subjective</h3>
  <p>${note.soap.subjective ? esc(note.soap.subjective) : '<span class="empty">—</span>'}</p>

  <h3>Objective Narrative</h3>
  <p>${note.soap.objectiveNarrative ? esc(note.soap.objectiveNarrative) : '<span class="empty">—</span>'}</p>

  <h3>Objective Data</h3>
  ${dataRows ? `
    <table>
      <thead><tr><th>Target</th><th>Trials</th><th>Correct</th><th>Accuracy</th><th>Cueing</th></tr></thead>
      <tbody>${dataRows}</tbody>
    </table>` : '<p class="empty">No data rows</p>'}

  <h3>Assessment</h3>
  <p>${note.soap.assessment ? esc(note.soap.assessment) : '<span class="empty">—</span>'}</p>

  <h3>Plan</h3>
  <p>${note.soap.soapPlan ? esc(note.soap.soapPlan) : '<span class="empty">—</span>'}</p>

</body>
</html>`;
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}
