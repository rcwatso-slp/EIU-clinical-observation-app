// Student shell — observation history, evaluation summary, and SOAP note writing/review
import {
  getStudentLink,
  getObservationsAsStudent,
  getEvaluationAsStudent,
  getClinicianAsStudent,
  getSettingsAsStudent,
} from '../../storage/firebase-storage.js';
import { renderSignOutButton } from '../auth/auth.js';
import { CLINICAL_SKILLS, CLINICAL_FOUNDATIONS } from '../../utils/competencies.js';
import { renderSoapList } from '../soap/soap-list.js';
import { renderSoapEditor, createEmptyNote } from '../soap/soap-editor.js';
import {
  getSoapNotesByClinicianAsStudent,
  saveSoapNoteAsStudent,
  deleteSoapNote,
} from '../soap/soap-storage.js';

// Student context — set once at init, used by SOAP section
let _studentCtx = null;

export async function initStudentView(user, onSignedOut) {
  const shell = document.getElementById('student-shell');
  shell.hidden = false;
  document.getElementById('supervisor-shell').hidden = true;
  document.getElementById('view-auth').hidden = true;

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

    _studentCtx = { user, supervisorId, clinicianId, clinician, settings };

    const semId = settings ? (settings.id || settings.name || 'default') : 'default';
    const [observations, evaluation, soapNotes] = await Promise.all([
      getObservationsAsStudent(supervisorId, clinicianId),
      getEvaluationAsStudent(supervisorId, clinicianId, semId),
      getSoapNotesByClinicianAsStudent(supervisorId, clinicianId),
    ]);

    renderStudentShell(content, clinician, settings, observations, evaluation, soapNotes);
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><p>Error loading data: ${err.message}</p></div>`;
    console.error(err);
  }
}

// ── Shell layout: tabs across the top ────────────────────────────────────────

function renderStudentShell(container, clinician, settings, observations, evaluation, soapNotes) {
  const semName = settings ? (settings.name || 'Current Semester') : 'Current Semester';

  container.innerHTML = `
    <div class="student-welcome card">
      <h2>${escHtml(clinician.name)}</h2>
      <p class="text-muted">${escHtml(semName)}</p>
    </div>

    <div class="student-module-tabs">
      <button class="student-module-tab active" data-stab="soap">SOAP Notes</button>
      <button class="student-module-tab" data-stab="eval">Evaluation</button>
      <button class="student-module-tab" data-stab="obs">Observation Notes</button>
    </div>

    <div id="student-tab-content"></div>
  `;

  const tabContent = container.querySelector('#student-tab-content');
  let activeTab = 'soap';

  function showTab(tab) {
    activeTab = tab;
    container.querySelectorAll('.student-module-tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.stab === tab);
    });
    if (tab === 'soap')  renderStudentSoapSection(tabContent);
    if (tab === 'eval')  renderStudentEval(tabContent, evaluation);
    if (tab === 'obs')   renderStudentObs(tabContent, observations);
  }

  container.querySelectorAll('.student-module-tab').forEach((t) => {
    t.addEventListener('click', () => showTab(t.dataset.stab));
  });

  showTab('soap');
}

// ── SOAP Notes section (student writes + reviews) ─────────────────────────────

async function renderStudentSoapSection(container, reloadNotes = false) {
  const { supervisorId, clinicianId, clinician } = _studentCtx;

  if (reloadNotes) {
    const notes = await getSoapNotesByClinicianAsStudent(supervisorId, clinicianId);
    _renderSoapList(container, notes, clinician, supervisorId);
  } else {
    container.innerHTML = '<div class="loading-state">Loading notes…</div>';
    const notes = await getSoapNotesByClinicianAsStudent(supervisorId, clinicianId);
    _renderSoapList(container, notes, clinician, supervisorId);
  }
}

function _renderSoapList(container, notes, clinician, supervisorId) {
  container.innerHTML = '<div class="card" id="student-soap-list-card"></div>';
  const card = container.querySelector('#student-soap-list-card');

  renderSoapList(card, notes, {
    viewMode: 'student',
    onOpen:   (note) => _openSoapEditor(container, note, clinician, supervisorId),
    onCreate: () => _showNewNoteModal(container, notes, clinician, supervisorId),
    onDelete: async (id) => {
      // Students can only delete their own draft notes
      const note = notes.find((n) => n.id === id);
      if (note && note.planStatus !== 'draft' && note.soapStatus !== 'draft') {
        alert('Cannot delete a submitted note. Contact your supervisor.');
        return;
      }
      await saveSoapNoteAsStudent({...note, _deleted: true}, supervisorId);
      renderStudentSoapSection(container, true);
    },
  });
}

function _openSoapEditor(container, note, clinician, supervisorId) {
  container.innerHTML = '<div id="student-soap-editor-wrap"></div>';
  const wrap = container.querySelector('#student-soap-editor-wrap');
  renderSoapEditor(wrap, note, {
    viewMode:    'student',
    clinician,
    supervisorId,
  },
  () => renderStudentSoapSection(container, true),  // onBack
  (saved) => {}                                      // onSave
  );
}

function _showNewNoteModal(container, existingNotes, clinician, supervisorId) {
  const nextSession = (existingNotes.length > 0
    ? Math.max(...existingNotes.map((n) => n.sessionNumber || 0)) + 1
    : 1);

  const overlay = document.createElement('div');
  overlay.className = 'soap-new-modal-overlay';
  overlay.innerHTML = `
    <div class="soap-new-modal">
      <h3>New Session Note</h3>
      <div class="form-group">
        <label>Session Date</label>
        <input type="date" id="new-note-date" value="${new Date().toISOString().slice(0,10)}">
      </div>
      <div class="form-group">
        <label>Session Number</label>
        <input type="number" id="new-note-session" value="${nextSession}" min="1">
      </div>
      <div class="form-actions" style="margin-top:16px">
        <button class="btn btn-primary" id="btn-create-note">Create</button>
        <button class="btn btn-secondary" id="btn-cancel-note">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#btn-cancel-note').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#btn-create-note').addEventListener('click', async () => {
    const date    = overlay.querySelector('#new-note-date').value;
    const session = parseInt(overlay.querySelector('#new-note-session').value) || nextSession;
    const note    = createEmptyNote(clinician.id, session, date);
    await saveSoapNoteAsStudent(note, supervisorId);
    overlay.remove();
    _openSoapEditor(container, note, clinician, supervisorId);
  });
}

// ── Evaluation (read-only) ────────────────────────────────────────────────────

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
      ${renderEvalComments(evaluation)}
    </div>`;
}

function renderEvalComments(evaluation) {
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

// ── Observation notes (read-only) ─────────────────────────────────────────────

function renderStudentObs(container, observations) {
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
    const dateStr = obs.date
      ? new Date(obs.date + 'T12:00:00').toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'})
      : '—';
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

// ── Helpers ───────────────────────────────────────────────────────────────────

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
