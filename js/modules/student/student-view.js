// Student read-only view — shows their observation history and evaluation summary
import {
  getStudentLink,
  getObservationsAsStudent,
  getEvaluationAsStudent,
  getClinicianAsStudent,
  getSettingsAsStudent,
} from '../../storage/firebase-storage.js';
import { renderSignOutButton } from '../auth/auth.js';
import { CLINICAL_SKILLS, CLINICAL_FOUNDATIONS } from '../../utils/competencies.js';

export async function initStudentView(user, onSignedOut) {
  const shell = document.getElementById('student-shell');
  shell.hidden = false;
  document.getElementById('supervisor-shell').hidden = true;
  document.getElementById('view-auth').hidden = true;

  // Header
  const header = shell.querySelector('#student-header');
  header.innerHTML = `
    <h1 class="app-title">EIU Clinical Supervision Hub</h1>
    <div class="top-actions">
      <span class="student-badge">Student View</span>
    </div>
  `;
  renderSignOutButton(header.querySelector('.top-actions'), onSignedOut);

  const content = shell.querySelector('#student-content');
  content.innerHTML = '<div class="loading-state">Loading your data…</div>';

  try {
    const link = await getStudentLink(user.email);
    if (!link) {
      content.innerHTML = `
        <div class="empty-state">
          <h2>No account linked</h2>
          <p>Your supervisor hasn't linked your email to a clinician account yet.
             Ask them to add your email in the Roster settings.</p>
        </div>`;
      return;
    }

    const { supervisorId, clinicianId } = link;
    const [clinician, settings] = await Promise.all([
      getClinicianAsStudent(supervisorId, clinicianId),
      getSettingsAsStudent(supervisorId),
    ]);

    if (!clinician) {
      content.innerHTML = `<div class="empty-state"><p>Clinician record not found.</p></div>`;
      return;
    }

    const semId = settings ? (settings.id || settings.name || 'default') : 'default';
    const [observations, evaluation] = await Promise.all([
      getObservationsAsStudent(supervisorId, clinicianId),
      getEvaluationAsStudent(supervisorId, clinicianId, semId),
    ]);

    renderStudentContent(content, clinician, settings, observations, evaluation);
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><p>Error loading data: ${err.message}</p></div>`;
    console.error(err);
  }
}

function renderStudentContent(container, clinician, settings, observations, evaluation) {
  const semName = settings ? (settings.name || 'Current Semester') : 'Current Semester';

  container.innerHTML = `
    <div class="student-welcome card">
      <h2>${escHtml(clinician.name)}</h2>
      <p class="text-muted">${escHtml(semName)}</p>
    </div>

    <div id="student-eval-section"></div>
    <div id="student-obs-section"></div>
  `;

  renderStudentEval(container.querySelector('#student-eval-section'), evaluation);
  renderStudentObs(container.querySelector('#student-obs-section'), observations, settings);
}

function renderStudentEval(container, evaluation) {
  if (!evaluation) {
    container.innerHTML = `
      <div class="card">
        <h3 class="section-header">Evaluation</h3>
        <p class="text-muted">No evaluation on record for this semester.</p>
      </div>`;
    return;
  }

  const status = {
    draft:             'In Progress',
    midterm_complete:  'Midterm Complete',
    final_complete:    'Final Complete',
  }[evaluation.status] || evaluation.status;

  const allSkills = [...CLINICAL_SKILLS, ...CLINICAL_FOUNDATIONS];
  let rows = '';
  for (const item of allSkills) {
    const ratings = evaluation.clinicalSkillRatings?.[item.id] || evaluation.clinicalFoundationRatings?.[item.id] || {};
    const mid = fmtRating(ratings.midterm);
    const fin = fmtRating(ratings.final);
    rows += `
      <tr>
        <td class="eval-num">${item.id.toUpperCase()}</td>
        <td class="eval-desc"><div class="eval-label">${escHtml(item.label)}</div></td>
        <td class="eval-rating">${mid}</td>
        <td class="eval-rating">${fin}</td>
      </tr>`;
  }

  container.innerHTML = `
    <div class="card">
      <div class="section-header-row">
        <h3 class="section-header">Evaluation</h3>
        <span class="eval-status-badge eval-status-${evaluation.status}">${escHtml(status)}</span>
      </div>
      <div class="table-scroll">
        <table class="eval-table">
          <thead>
            <tr>
              <th class="eval-col-num">#</th>
              <th class="eval-col-desc">Competency</th>
              <th class="eval-col-rating">Midterm</th>
              <th class="eval-col-rating">Final</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${renderComments(evaluation)}
    </div>`;
}

function renderComments(evaluation) {
  if (!evaluation.midtermComments && !evaluation.finalComments) return '';
  let html = '<div class="student-comments">';
  if (evaluation.midtermComments) {
    html += `<div class="form-group"><label>Midterm Comments</label>
      <div class="student-comment-box">${escHtml(evaluation.midtermComments)}</div></div>`;
  }
  if (evaluation.finalComments) {
    html += `<div class="form-group"><label>Final Comments</label>
      <div class="student-comment-box">${escHtml(evaluation.finalComments)}</div></div>`;
  }
  html += '</div>';
  return html;
}

function renderStudentObs(container, observations, settings) {
  if (!observations || observations.length === 0) {
    container.innerHTML = `
      <div class="card">
        <h3 class="section-header">Observation Notes</h3>
        <p class="text-muted">No observation notes on record.</p>
      </div>`;
    return;
  }

  const sorted = [...observations].sort((a, b) => new Date(b.date) - new Date(a.date));
  let rows = '';
  for (const obs of sorted) {
    const dateStr = obs.date ? new Date(obs.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
    rows += `
      <div class="history-card">
        <div class="history-meta">
          <span class="history-date">${dateStr}</span>
          ${obs.isAbsent ? '<span class="absent-badge">Absent</span>' : ''}
        </div>
        ${obs.notes ? `<div class="history-notes">${obs.notes}</div>` : ''}
      </div>`;
  }

  container.innerHTML = `
    <div class="card">
      <h3 class="section-header">Observation Notes (${sorted.length})</h3>
      <div class="history-list">${rows}</div>
    </div>`;
}

function fmtRating(val) {
  if (val === null || val === undefined || val === '') return '<span class="text-muted">—</span>';
  if (val === 'na') return '<span class="rating-na-text">N/A</span>';
  return `<strong>${val}</strong>`;
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
