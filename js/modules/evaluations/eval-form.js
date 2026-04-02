// Evaluation form — main module for the Evaluations view
import * as storage from '../../storage/storage.js';
import { CLINICAL_SKILLS, CLINICAL_FOUNDATIONS, GRADING_SCALE } from '../../utils/competencies.js';
import { formatDateDisplay, uuid } from '../../utils/dates.js';
import { renderCommentsSection } from './eval-comments.js';
import { renderEFSection } from './eval-ef.js';
import { exportEvaluationExcel, exportEvaluationPdf } from './eval-export.js';

// --- Helpers ---

export function createEmptyEvaluation(clinicianId, semesterId) {
  const csRatings = {};
  CLINICAL_SKILLS.forEach((cs) => { csRatings[cs.id] = { midterm: null, final: null }; });
  const cfRatings = {};
  CLINICAL_FOUNDATIONS.forEach((cf) => { cfRatings[cf.id] = { midterm: null, final: null }; });
  return {
    id: uuid(),
    clinicianId,
    semesterId: semesterId || 'default',
    status: 'draft',
    midtermDate: null,
    finalDate: null,
    clinicalSkillRatings: csRatings,
    clinicalFoundationRatings: cfRatings,
    midtermComments: '',
    finalComments: '',
    essentialFunctions: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function calcAverage(ratings, period) {
  const values = Object.values(ratings)
    .map((r) => r[period])
    .filter((v) => v !== null && v !== undefined && v !== 'na');
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function calcGrade(avg) {
  if (avg === null || avg === undefined) return '—';
  for (const { grade, min, max } of GRADING_SCALE) {
    if (avg >= min && avg <= max) return grade;
  }
  return '—';
}

function ratingClass(val) {
  if (val === null || val === undefined || val === '') return '';
  if (val === 'na') return 'rating-na';
  const v = parseFloat(val);
  if (v <= 1.5) return 'rating-emerging';
  if (v <= 2.5) return 'rating-developing';
  return 'rating-established';
}

function gradeClass(grade) {
  if (grade === 'A') return 'grade-a';
  if (grade === 'B') return 'grade-b';
  if (grade === 'C') return 'grade-c';
  return '';
}

function fmtAvg(v) {
  return (v !== null && v !== undefined) ? v.toFixed(2) : '—';
}

function ratingSelectHtml(value, name) {
  const opts = [
    { v: '', l: '—' },
    { v: '1', l: '1 — Emerging' },
    { v: '1.5', l: '1.5' },
    { v: '2', l: '2 — Developing' },
    { v: '2.5', l: '2.5' },
    { v: '3', l: '3 — Established' },
    { v: 'na', l: 'N/A' },
  ];
  const strVal = (value !== null && value !== undefined) ? String(value) : '';
  return `<select class="rating-select ${ratingClass(strVal)}" data-name="${name}">
    ${opts.map((o) => `<option value="${o.v}" ${strVal === o.v ? 'selected' : ''}>${o.l}</option>`).join('')}
  </select>`;
}

// --- Main render ---

export async function renderEvaluation(clinician, evaluation, settings, observations, onSaved) {
  const container = document.getElementById('view-evaluations');

  // Auto-create evaluation if none exists
  if (!evaluation) {
    const semId = settings ? (settings.id || settings.name || 'default') : 'default';
    evaluation = createEmptyEvaluation(clinician.id, semId);
    await storage.saveEvaluation(evaluation);
  }

  const semName    = settings ? settings.name : '';
  const supervisor = settings ? settings.supervisor : '';

  const csAvgMid = calcAverage(evaluation.clinicalSkillRatings, 'midterm');
  const csAvgFin = calcAverage(evaluation.clinicalSkillRatings, 'final');
  const cfAvgMid = calcAverage(evaluation.clinicalFoundationRatings, 'midterm');
  const cfAvgFin = calcAverage(evaluation.clinicalFoundationRatings, 'final');

  function totalAvg(csA, cfA) {
    if (csA !== null && cfA !== null) return (csA + cfA) / 2;
    return csA !== null ? csA : cfA;
  }

  const totMid = totalAvg(csAvgMid, cfAvgMid);
  const totFin = totalAvg(csAvgFin, cfAvgFin);

  const statusLabel = evaluation.status === 'final_complete'   ? 'Final Complete'
                    : evaluation.status === 'midterm_complete' ? 'Midterm Complete'
                    : 'Draft';

  container.innerHTML = `
    <div class="clinician-header">
      <div>
        <span class="clinician-header-name">${clinician.name}</span>
        <span class="badge badge-${clinician.sessionDays.toLowerCase()}">${clinician.sessionDays}</span>
        <span class="badge eval-status-badge eval-status-${evaluation.status}">${statusLabel}</span>
      </div>
      <div class="clinician-header-details">
        <span>Client: ${clinician.clientInitials}</span>
        <span>Supervisor: ${supervisor}</span>
        ${semName ? `<span>${semName}</span>` : ''}
        ${evaluation.midtermDate ? `<span>Midterm: ${evaluation.midtermDate}</span>` : ''}
        ${evaluation.finalDate   ? `<span>Final: ${evaluation.finalDate}</span>` : ''}
      </div>
    </div>

    <div class="rating-legend card">
      <strong>Rating Scale:</strong>
      <span class="rating-pill rating-emerging">1 = Emerging</span>
      <span class="rating-pill rating-developing">2 = Developing</span>
      <span class="rating-pill rating-established">3 = Established</span>
      <span class="legend-divider"></span>
      <strong>Grades:</strong>
      <span>A = 2.4–3.0</span>
      <span>B = 1.86–2.39</span>
      <span>C = 1.0–1.85</span>
    </div>

    <div class="card">
      <h3 class="section-header">Clinical Skills</h3>
      <table class="eval-table">
        <thead>
          <tr>
            <th class="eval-col-num">#</th>
            <th class="eval-col-desc">Competency</th>
            <th class="eval-col-rating">Midterm</th>
            <th class="eval-col-rating">Final</th>
          </tr>
        </thead>
        <tbody id="cs-tbody">
          ${CLINICAL_SKILLS.map((cs) => `
            <tr class="eval-row" data-competency="${cs.id}">
              <td class="eval-num">${cs.id.toUpperCase()}</td>
              <td class="eval-desc">
                <div class="eval-label">${cs.label}</div>
                <div class="eval-full-desc">${cs.description}</div>
              </td>
              <td class="eval-rating">${ratingSelectHtml(evaluation.clinicalSkillRatings[cs.id]?.midterm, `${cs.id}-midterm`)}</td>
              <td class="eval-rating">${ratingSelectHtml(evaluation.clinicalSkillRatings[cs.id]?.final, `${cs.id}-final`)}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr class="eval-avg-row">
            <td colspan="2"><strong>Clinical Skills Average</strong></td>
            <td id="cs-avg-mid" class="eval-avg-cell">${fmtAvg(csAvgMid)}</td>
            <td id="cs-avg-fin" class="eval-avg-cell">${fmtAvg(csAvgFin)}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div class="card">
      <h3 class="section-header">Clinical Foundations</h3>
      <table class="eval-table">
        <thead>
          <tr>
            <th class="eval-col-num">#</th>
            <th class="eval-col-desc">Competency</th>
            <th class="eval-col-rating">Midterm</th>
            <th class="eval-col-rating">Final</th>
          </tr>
        </thead>
        <tbody id="cf-tbody">
          ${CLINICAL_FOUNDATIONS.map((cf) => `
            <tr class="eval-row" data-competency="${cf.id}">
              <td class="eval-num">${cf.id.toUpperCase()}</td>
              <td class="eval-desc">
                <div class="eval-label">${cf.label}</div>
                <div class="eval-full-desc">${cf.description}</div>
              </td>
              <td class="eval-rating">${ratingSelectHtml(evaluation.clinicalFoundationRatings[cf.id]?.midterm, `${cf.id}-midterm`)}</td>
              <td class="eval-rating">${ratingSelectHtml(evaluation.clinicalFoundationRatings[cf.id]?.final, `${cf.id}-final`)}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr class="eval-avg-row">
            <td colspan="2"><strong>Clinical Foundations Average</strong></td>
            <td id="cf-avg-mid" class="eval-avg-cell">${fmtAvg(cfAvgMid)}</td>
            <td id="cf-avg-fin" class="eval-avg-cell">${fmtAvg(cfAvgFin)}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div class="card eval-overall-card">
      <div class="eval-overall-grid">
        <div></div>
        <div class="eval-overall-header">Midterm</div>
        <div class="eval-overall-header">Final</div>

        <div class="eval-overall-label">Total Rating</div>
        <div id="total-mid" class="eval-total-val">${fmtAvg(totMid)}</div>
        <div id="total-fin" class="eval-total-val">${fmtAvg(totFin)}</div>

        <div class="eval-overall-label">Grade</div>
        <div id="grade-mid" class="eval-grade ${gradeClass(calcGrade(totMid))}">${calcGrade(totMid)}</div>
        <div id="grade-fin" class="eval-grade ${gradeClass(calcGrade(totFin))}">${calcGrade(totFin)}</div>
      </div>
    </div>

    <div id="eval-comments-section"></div>
    <div id="eval-ef-section"></div>
    <div id="eval-obs-ref-section"></div>

    <div class="form-actions" style="margin-top:4px;margin-bottom:24px;">
      <button id="btn-save-eval" class="btn btn-primary">Save</button>
      <button id="btn-export-eval-excel" class="btn btn-secondary">Export Excel</button>
      <button id="btn-export-eval-pdf" class="btn btn-secondary">Export PDF</button>
    </div>
  `;

  // Render sub-sections
  renderCommentsSection(container.querySelector('#eval-comments-section'), evaluation);
  renderEFSection(container.querySelector('#eval-ef-section'), clinician, evaluation, (ef) => {
    evaluation.essentialFunctions = ef;
  });
  renderObsRefSection(container.querySelector('#eval-obs-ref-section'), observations);

  // --- Wire rating selects ---
  function recalculate() {
    const csAMid = calcAverage(evaluation.clinicalSkillRatings, 'midterm');
    const csAFin = calcAverage(evaluation.clinicalSkillRatings, 'final');
    const cfAMid = calcAverage(evaluation.clinicalFoundationRatings, 'midterm');
    const cfAFin = calcAverage(evaluation.clinicalFoundationRatings, 'final');
    const tMid = totalAvg(csAMid, cfAMid);
    const tFin = totalAvg(csAFin, cfAFin);

    container.querySelector('#cs-avg-mid').textContent = fmtAvg(csAMid);
    container.querySelector('#cs-avg-fin').textContent = fmtAvg(csAFin);
    container.querySelector('#cf-avg-mid').textContent = fmtAvg(cfAMid);
    container.querySelector('#cf-avg-fin').textContent = fmtAvg(cfAFin);
    container.querySelector('#total-mid').textContent = fmtAvg(tMid);
    container.querySelector('#total-fin').textContent = fmtAvg(tFin);

    const gMid = calcGrade(tMid);
    const gFin = calcGrade(tFin);
    const gradeMidEl = container.querySelector('#grade-mid');
    const gradeFinEl = container.querySelector('#grade-fin');
    gradeMidEl.textContent = gMid;
    gradeMidEl.className   = `eval-grade ${gradeClass(gMid)}`;
    gradeFinEl.textContent = gFin;
    gradeFinEl.className   = `eval-grade ${gradeClass(gFin)}`;
  }

  container.querySelectorAll('.rating-select').forEach((sel) => {
    sel.addEventListener('change', () => {
      const lastDash = sel.dataset.name.lastIndexOf('-');
      const compId   = sel.dataset.name.slice(0, lastDash);
      const period   = sel.dataset.name.slice(lastDash + 1);
      const val      = sel.value === '' ? null : sel.value === 'na' ? 'na' : parseFloat(sel.value);

      if (compId.startsWith('cs')) {
        evaluation.clinicalSkillRatings[compId][period] = val;
      } else {
        evaluation.clinicalFoundationRatings[compId][period] = val;
      }

      sel.className = `rating-select ${ratingClass(sel.value)}`;
      recalculate();
    });
  });

  // --- Wire competency row click → filter obs reference panel ---
  container.querySelectorAll('.eval-row').forEach((row) => {
    row.querySelector('.eval-desc').addEventListener('click', () => {
      const compId = row.dataset.competency;
      showObsRef(container.querySelector('#eval-obs-ref-section'), compId, observations);
    });
  });

  // --- Wire save ---
  container.querySelector('#btn-save-eval').addEventListener('click', async () => {
    const midComments = container.querySelector('#eval-midterm-comments');
    const finComments = container.querySelector('#eval-final-comments');
    if (midComments) evaluation.midtermComments = midComments.value;
    if (finComments) evaluation.finalComments = finComments.value;

    const hasMidterm = Object.values(evaluation.clinicalSkillRatings).some((r) => r.midterm !== null)
                    || Object.values(evaluation.clinicalFoundationRatings).some((r) => r.midterm !== null);
    const hasFinal   = Object.values(evaluation.clinicalSkillRatings).some((r) => r.final !== null)
                    || Object.values(evaluation.clinicalFoundationRatings).some((r) => r.final !== null);

    if (hasFinal) {
      evaluation.status    = 'final_complete';
      evaluation.finalDate = evaluation.finalDate || new Date().toISOString().slice(0, 10);
    } else if (hasMidterm) {
      evaluation.status       = 'midterm_complete';
      evaluation.midtermDate  = evaluation.midtermDate || new Date().toISOString().slice(0, 10);
    }

    evaluation.updatedAt = new Date().toISOString();
    await storage.saveEvaluation(evaluation);

    // Brief saved feedback
    const btn = container.querySelector('#btn-save-eval');
    btn.textContent = 'Saved!';
    btn.disabled = true;
    setTimeout(() => { btn.textContent = 'Save'; btn.disabled = false; }, 1500);

    // Update status badge
    const badge = container.querySelector('.eval-status-badge');
    if (badge) {
      const newLabel = evaluation.status === 'final_complete'   ? 'Final Complete'
                     : evaluation.status === 'midterm_complete' ? 'Midterm Complete'
                     : 'Draft';
      badge.textContent = newLabel;
      badge.className   = `badge eval-status-badge eval-status-${evaluation.status}`;
    }

    if (onSaved) onSaved(evaluation);
  });

  // --- Wire exports ---
  container.querySelector('#btn-export-eval-excel').addEventListener('click', () => {
    syncComments(container, evaluation);
    exportEvaluationExcel(clinician, evaluation, settings);
  });

  container.querySelector('#btn-export-eval-pdf').addEventListener('click', () => {
    syncComments(container, evaluation);
    exportEvaluationPdf(clinician, evaluation, settings);
  });
}

// --- Observation Notes Reference Panel ---

function renderObsRefSection(container, observations) {
  if (!observations || observations.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="card">
      <div class="collapsible-header" id="obs-ref-toggle">
        <h3>Observation Notes Reference</h3>
        <span class="collapsible-chevron" id="obs-ref-chevron">▼ Show</span>
      </div>
      <div id="obs-ref-content" hidden>
        <p class="text-sm text-muted" style="margin-bottom:8px;">
          Click a competency description above to filter by that skill.
          <button class="btn btn-sm btn-secondary" id="obs-ref-show-all" style="margin-left:6px;">Show All</button>
        </p>
        <div id="obs-ref-feed"></div>
      </div>
    </div>
  `;

  const toggle  = container.querySelector('#obs-ref-toggle');
  const content = container.querySelector('#obs-ref-content');
  const chevron = container.querySelector('#obs-ref-chevron');

  toggle.addEventListener('click', () => {
    content.hidden = !content.hidden;
    chevron.textContent = content.hidden ? '▼ Show' : '▲ Hide';
    if (!content.hidden) showObsRef(container, null, observations);
  });

  container.querySelector('#obs-ref-show-all').addEventListener('click', () => {
    showObsRef(container, null, observations);
  });
}

function showObsRef(container, compId, observations) {
  const content = container.querySelector('#obs-ref-content');
  const feed    = container.querySelector('#obs-ref-feed');
  if (!content || !feed) return;

  content.hidden = false;
  const chevron = container.querySelector('#obs-ref-chevron');
  if (chevron) chevron.textContent = '▲ Hide';

  const filtered = compId
    ? observations.filter((o) => (o.competencyTags || []).includes(compId))
    : [...observations];

  filtered.sort((a, b) => b.date.localeCompare(a.date));

  if (filtered.length === 0) {
    feed.innerHTML = `<p class="text-muted text-sm">No observations tagged with <strong>${compId}</strong>.</p>`;
    return;
  }

  feed.innerHTML = filtered.map((obs) => {
    const tags = (obs.competencyTags || [])
      .map((id) => `<span class="tag tag-readonly tag-${id.startsWith('cs') ? 'cs' : 'cf'}" style="font-size:10px;padding:1px 5px;">${id}</span>`)
      .join(' ');
    return `
      <div class="obs-ref-card">
        <div class="obs-ref-meta">
          <strong>${formatDateDisplay(obs.date)}</strong>
          <span class="text-muted"> · ${obs.minutesObserved || 0}/${obs.totalMinutes || 0} min</span>
          ${tags ? `<span style="margin-left:6px;">${tags}</span>` : ''}
        </div>
        ${obs.notes ? `<div class="obs-ref-notes">${obs.notes}</div>` : ''}
      </div>
    `;
  }).join('');
}

// Sync textarea values into evaluation object before export
function syncComments(container, evaluation) {
  const midComments = container.querySelector('#eval-midterm-comments');
  const finComments = container.querySelector('#eval-final-comments');
  if (midComments) evaluation.midtermComments = midComments.value;
  if (finComments) evaluation.finalComments = finComments.value;
}
