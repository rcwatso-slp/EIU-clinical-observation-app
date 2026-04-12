// Student shell — observation history, evaluation summary, and SOAP note writing/review
import {
  getStudentLink,
  getObservationsAsStudent,
  getEvaluationAsStudent,
  getClinicianAsStudent,
  getSettingsAsStudent,
  getStudentSemesterHistory,
  getArchivedObservationsAsStudent,
  getArchivedEvaluationAsStudent,
  getArchivedSoapNotesAsStudent,
  getArchivedItpAsStudent,
} from '../../storage/firebase-storage.js';
import { renderSignOutButton } from '../auth/auth.js';
import { CLINICAL_SKILLS, CLINICAL_FOUNDATIONS } from '../../utils/competencies.js';
import { renderSoapList } from '../soap/soap-list.js';
import { renderSoapEditor } from '../soap/soap-editor.js';
import { createEmptyNote } from '../soap/soap-storage.js';
import {
  getSoapNotesByClinicianAsStudent,
  saveSoapNoteAsStudent,
  deleteSoapNote,
} from '../soap/soap-storage.js';
import { renderItpEditor } from '../itp/itp-editor.js';
import { getItpAsStudent } from '../itp/itp-storage.js';

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
    // Load current link and past semester history in parallel
    const [link, semesterHistory] = await Promise.all([
      getStudentLink(user.email),
      getStudentSemesterHistory(user.email).catch(() => []),
    ]);

    if (!link) {
      // Show past semesters if available, otherwise empty state
      if (semesterHistory.length > 0) {
        renderStudentSemesterPicker(content, null, semesterHistory);
      } else {
        content.innerHTML = `
          <div class="empty-state">
            <h2>Not yet linked</h2>
            <p>You haven't been added to a semester yet. Contact your supervisor to get started.</p>
          </div>`;
      }
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

    renderStudentSemesterPicker(content, link, semesterHistory);
    renderStudentShell(content, clinician, settings, observations, evaluation, soapNotes);
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><p>Error loading data: ${err.message}</p></div>`;
    console.error(err);
  }
}

// ── Semester picker (shown above shell when past semesters exist) ─────────────

function renderStudentSemesterPicker(content, currentLink, semesterHistory) {
  if (semesterHistory.length === 0) return;

  // Remove existing picker if present
  content.querySelector('.student-semester-picker')?.remove();

  const picker = document.createElement('div');
  picker.className = 'student-semester-picker card';
  picker.innerHTML = `
    <label class="roster-archive-label">Previous Semesters</label>
    <select id="student-sem-select" class="roster-archive-select">
      ${currentLink ? '<option value="">Current Semester</option>' : '<option value="" disabled selected>Select a semester</option>'}
      ${semesterHistory.map((s) => `<option value="${escHtml(s.semesterName)}" data-sup="${escHtml(s.supervisorId)}" data-clin="${escHtml(s.clinicianId)}">${escHtml(s.semesterName)}</option>`).join('')}
    </select>
  `;
  content.prepend(picker);

  picker.querySelector('#student-sem-select').addEventListener('change', async (e) => {
    const semName = e.target.value;
    if (!semName) {
      // Switch back to current semester
      const { supervisorId, clinicianId } = currentLink;
      const [clinician, settings] = await Promise.all([
        getClinicianAsStudent(supervisorId, clinicianId),
        getSettingsAsStudent(supervisorId),
      ]);
      _studentCtx = { supervisorId, clinicianId, clinician, settings };
      const semId = settings ? (settings.id || settings.name || 'default') : 'default';
      const [observations, evaluation, soapNotes] = await Promise.all([
        getObservationsAsStudent(supervisorId, clinicianId),
        getEvaluationAsStudent(supervisorId, clinicianId, semId),
        getSoapNotesByClinicianAsStudent(supervisorId, clinicianId),
      ]);
      // Remove old shell content below picker
      content.querySelector('.student-welcome')?.remove();
      content.querySelector('.student-module-tabs')?.remove();
      content.querySelector('#student-tab-content')?.remove();
      renderStudentShell(content, clinician, settings, observations, evaluation, soapNotes);
      return;
    }

    // Load archived semester
    const opt = e.target.options[e.target.selectedIndex];
    const supervisorId = opt.dataset.sup;
    const clinicianId  = opt.dataset.clin;
    const semId        = semName; // semId === semName in archive

    content.querySelector('.student-welcome')?.remove();
    content.querySelector('.student-module-tabs')?.remove();
    content.querySelector('#student-tab-content')?.remove();

    const archShell = document.createElement('div');
    content.appendChild(archShell);
    archShell.innerHTML = '<div class="loading-state">Loading archived semester…</div>';

    try {
      const [clinician, observations, evaluation, soapNotes] = await Promise.all([
        getClinicianAsStudent(supervisorId, clinicianId).catch(() => null),
        getArchivedObservationsAsStudent(supervisorId, semId, clinicianId),
        getArchivedEvaluationAsStudent(supervisorId, semId, clinicianId),
        getArchivedSoapNotesAsStudent(supervisorId, semId, clinicianId),
      ]);
      archShell.remove();
      // Temporarily update context so sub-sections can reference it
      _studentCtx = { supervisorId, clinicianId, clinician: clinician || {}, settings: { name: semName } };
      renderStudentArchivedShell(content, clinician, semName, supervisorId, clinicianId, semId, observations, evaluation, soapNotes);
    } catch (err) {
      archShell.innerHTML = `<div class="empty-state"><p>Error loading archived data: ${escHtml(err.message)}</p></div>`;
    }
  });
}

// ── Archived semester shell (read-only) ───────────────────────────────────────

function renderStudentArchivedShell(content, clinician, semName, supervisorId, clinicianId, semId, observations, evaluation, soapNotes) {
  const name = clinician ? clinician.name : 'Archived Record';

  const shell = document.createElement('div');
  shell.innerHTML = `
    <div class="student-welcome card">
      <h2>${escHtml(name)}</h2>
      <p class="text-muted">${escHtml(semName)} — Read Only</p>
    </div>
    <div class="student-module-tabs">
      <button class="student-module-tab active" data-stab="itp">Treatment Plan</button>
      <button class="student-module-tab" data-stab="soap">SOAP Notes</button>
      <button class="student-module-tab" data-stab="eval">Evaluation</button>
      <button class="student-module-tab" data-stab="obs">Observation Notes</button>
    </div>
    <div id="student-tab-content"></div>
  `;
  content.appendChild(shell);

  const tabContent = shell.querySelector('#student-tab-content');

  async function showArchivedTab(tab) {
    shell.querySelectorAll('.student-module-tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.stab === tab);
    });

    if (tab === 'itp') {
      tabContent.innerHTML = '<div class="loading-state">Loading…</div>';
      const itp = await getArchivedItpAsStudent(supervisorId, semId, clinicianId).catch(() => null);
      tabContent.innerHTML = '';
      if (!itp) {
        tabContent.innerHTML = '<div class="card"><p class="text-muted">No treatment plan on record for this semester.</p></div>';
        return;
      }
      const wrap = document.createElement('div');
      tabContent.appendChild(wrap);
      const { renderItpEditor } = await import('../itp/itp-editor.js');
      renderItpEditor(wrap, itp, { viewMode: 'student', readOnly: true, clinician: clinician || {}, supervisorId, semesterId: semId, settings: { name: semName } }, () => showArchivedTab('itp'));
    } else if (tab === 'soap') {
      tabContent.innerHTML = '<div class="card" id="student-soap-list-card"></div>';
      const { renderSoapList } = await import('../soap/soap-list.js');
      renderSoapList(tabContent.querySelector('#student-soap-list-card'), soapNotes, {
        viewMode: 'student',
        readOnly: true,
        onOpen: async (note) => {
          const { renderSoapEditor } = await import('../soap/soap-editor.js');
          tabContent.innerHTML = '<div id="student-soap-editor-wrap"></div>';
          renderSoapEditor(tabContent.querySelector('#student-soap-editor-wrap'), note, { viewMode: 'student', readOnly: true, clinician: clinician || {} }, () => showArchivedTab('soap'), () => {});
        },
        onCreate: () => {},
        onDelete: () => {},
      });
    } else if (tab === 'eval') {
      renderStudentEval(tabContent, evaluation);
    } else if (tab === 'obs') {
      renderStudentObs(tabContent, observations);
    }
  }

  shell.querySelectorAll('.student-module-tab').forEach((t) => {
    t.addEventListener('click', () => showArchivedTab(t.dataset.stab));
  });

  showArchivedTab('itp');
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
      <button class="student-module-tab active" data-stab="itp">Treatment Plan</button>
      <button class="student-module-tab" data-stab="soap">SOAP Notes</button>
      <button class="student-module-tab" data-stab="eval">Evaluation</button>
      <button class="student-module-tab" data-stab="obs">Observation Notes</button>
    </div>

    <div id="student-tab-content"></div>
  `;

  const tabContent = container.querySelector('#student-tab-content');
  let activeTab = 'itp';

  function showTab(tab) {
    activeTab = tab;
    container.querySelectorAll('.student-module-tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.stab === tab);
    });
    if (tab === 'itp')  renderStudentItpSection(tabContent);
    if (tab === 'soap') renderStudentSoapSection(tabContent);
    if (tab === 'eval') renderStudentEval(tabContent, evaluation);
    if (tab === 'obs')  renderStudentObs(tabContent, observations);
  }

  container.querySelectorAll('.student-module-tab').forEach((t) => {
    t.addEventListener('click', () => showTab(t.dataset.stab));
  });

  showTab('itp');
}

// ── ITP (Treatment Plan) section ──────────────────────────────────────────────

async function renderStudentItpSection(container) {
  const { supervisorId, clinicianId, clinician, settings } = _studentCtx;
  const semId = settings ? (settings.id || settings.name || 'default') : 'default';
  container.innerHTML = '<div class="loading-state">Loading treatment plan…</div>';
  try {
    const itp = await getItpAsStudent(supervisorId, clinicianId, semId, clinician, settings);
    container.innerHTML = '<div id="student-itp-wrap"></div>';
    renderItpEditor(
      container.querySelector('#student-itp-wrap'),
      itp,
      { viewMode: 'student', clinician, supervisorId, semesterId: semId, settings },
      () => renderStudentItpSection(container),
    );
  } catch (err) {
    container.innerHTML = `<div class="card"><p class="text-muted">Could not load treatment plan: ${escHtml(err.message)}</p></div>`;
  }
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

async function _openSoapEditor(container, note, clinician, supervisorId) {
  const { settings } = _studentCtx;
  const semId = settings ? (settings.id || settings.name || 'default') : 'default';
  const itp   = await getItpAsStudent(supervisorId, clinician.id, semId, clinician, settings);
  container.innerHTML = '<div id="student-soap-editor-wrap"></div>';
  const wrap = container.querySelector('#student-soap-editor-wrap');
  renderSoapEditor(wrap, note, {
    viewMode: 'student',
    clinician,
    supervisorId,
    itp,
  },
  () => renderStudentSoapSection(container, true),
  (saved) => {}
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
