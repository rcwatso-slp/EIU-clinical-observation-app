// Observation note entry form — primary workflow
import * as storage from '../storage/storage.js';
import { CLINICAL_SKILLS, CLINICAL_FOUNDATIONS } from '../utils/competencies.js';
import { formatDateDisplay, uuid } from '../utils/dates.js';

// --- Quill loader ---
let quillLoaded = false;
function loadQuill() {
  if (quillLoaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.quilljs.com/1.3.7/quill.min.js';
    script.onload = () => { quillLoaded = true; resolve(); };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// --- Draft persistence (localStorage, keyed per clinician) ---
function draftKey(clinicianId) { return `obs-draft-${clinicianId}`; }

function loadDraft(clinicianId) {
  try {
    const raw = localStorage.getItem(draftKey(clinicianId));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveDraft(clinicianId, data) {
  try { localStorage.setItem(draftKey(clinicianId), JSON.stringify(data)); } catch {}
}

function clearDraft(clinicianId) {
  localStorage.removeItem(draftKey(clinicianId));
}

export async function renderObserver(clinician, observations, settings, onSaved, editObs = null) {
  const container = document.getElementById('view-observer');

  // Find next unlogged date
  const loggedDates = new Set(observations.map((o) => o.date));
  const activeDates = (clinician.schedule || []).filter((s) => !s.skipped);
  const nextDate = activeDates.find((s) => !loggedDates.has(s.date));
  const suggestedDate = nextDate ? nextDate.date : '';

  // Running stats
  const statsObs = editObs ? observations.filter((o) => o.id !== editObs.id) : observations;
  const totalMinutesObserved = statsObs.reduce((sum, o) => sum + (o.minutesObserved || 0), 0);
  const totalSessionMinutes  = statsObs.reduce((sum, o) => sum + (o.totalMinutes || 0), 0);
  const runningPct = totalSessionMinutes > 0 ? Math.round((totalMinutesObserved / totalSessionMinutes) * 100) : 0;
  const sessionNumber = editObs
    ? observations.sort((a, b) => a.date.localeCompare(b.date)).indexOf(editObs) + 1 || '—'
    : observations.length + 1;

  const isEditing = !!editObs;
  const draft = isEditing ? null : loadDraft(clinician.id);
  const hasDraft = !!draft;

  const defaultTotal    = clinician.sessionLengthMin || 45;
  const defaultObserved = Math.round(defaultTotal / 2);

  const formDate     = editObs ? editObs.date           : (draft?.date            ?? suggestedDate);
  const formType     = editObs ? editObs.sessionType     : (draft?.sessionType     ?? 'tx');
  const formAbsent   = editObs ? !!editObs.absent        : (draft?.absent          ?? false);
  const formTotal    = editObs ? editObs.totalMinutes    : (draft?.totalMinutes    ?? defaultTotal);
  const formObserved = editObs ? editObs.minutesObserved : (draft?.minutesObserved ?? defaultObserved);
  const formNotes    = editObs ? editObs.notes           : (draft?.notes           ?? '');
  const formTags     = new Set(editObs ? (editObs.competencyTags || []) : (draft?.competencyTags || []));
  const formPct      = formAbsent ? 0 : (formTotal > 0 ? Math.round((formObserved / formTotal) * 100) : 0);

  container.innerHTML = `
    <div class="clinician-header">
      <div>
        <span class="clinician-header-name">${clinician.name}</span>
        <span class="badge badge-${clinician.sessionDays.toLowerCase()}">${clinician.sessionDays}</span>
      </div>
      <div class="clinician-header-details">
        <span>Client: ${clinician.clientInitials}</span>
        <span>Room ${clinician.room}</span>
        <span>${clinician.sessionTime}</span>
        ${settings ? `<span>${settings.name}</span>` : ''}
      </div>
    </div>

    ${isEditing ? `
    <div class="card" style="background:var(--blue-50);border-color:var(--blue-200);padding:10px 14px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span class="text-sm" style="color:var(--blue-700);font-weight:600;">Editing observation from ${formatDateDisplay(editObs.date)}</span>
        <button id="btn-cancel-edit" class="btn btn-sm btn-secondary">Cancel Edit</button>
      </div>
    </div>` : ''}

    ${hasDraft && !isEditing ? `
    <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:6px;padding:8px 14px;margin-bottom:12px;">
      <span style="font-size:12px;font-weight:600;color:#92400e;">Draft restored — unsaved notes from your last session on this clinician</span>
    </div>` : ''}

    <div class="card">
      <div class="form-row-3">
        <div class="form-group">
          <label>Session Date</label>
          <input type="date" id="obs-date" value="${formDate}">
        </div>
        <div class="form-group">
          <label>Session Type</label>
          <select id="obs-type">
            <option value="tx"   ${formType === 'tx'   ? 'selected' : ''}>Treatment (Tx)</option>
            <option value="eval" ${formType === 'eval' ? 'selected' : ''}>Evaluation</option>
          </select>
        </div>
        <div class="form-group">
          <label>Session #</label>
          <input type="text" id="obs-session-num" value="${sessionNumber}" readonly style="background:var(--gray-50);color:var(--gray-500);">
        </div>
      </div>

      <div class="absent-toggle" style="margin-bottom:12px;">
        <label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;text-transform:none;letter-spacing:0;">
          <input type="checkbox" id="obs-absent" ${formAbsent ? 'checked' : ''}>
          <span id="obs-absent-label" style="font-weight:600;color:${formAbsent ? 'var(--red-600)' : 'var(--gray-600)'};">${formAbsent ? 'Client Absent' : 'Client Absent?'}</span>
        </label>
      </div>

      <div id="obs-minutes-section" ${formAbsent ? 'hidden' : ''}>
        <div class="form-row-3">
          <div class="form-group">
            <label>Total Minutes</label>
            <input type="number" id="obs-total-min" value="${formTotal}" min="1">
          </div>
          <div class="form-group">
            <label>Minutes Observed</label>
            <input type="number" id="obs-obs-min" value="${formObserved}" min="0">
          </div>
          <div class="form-group">
            <label>This Session %</label>
            <div class="pct-display" id="obs-session-pct">${formPct}%</div>
          </div>
        </div>
      </div>

      <div id="obs-absent-notice" ${formAbsent ? '' : 'hidden'} style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:10px 14px;margin-bottom:12px;">
        <span style="color:var(--red-600);font-weight:600;font-size:13px;">Client absent — 0 minutes recorded</span>
      </div>

      <div style="display:flex;gap:16px;margin-bottom:12px;">
        <div class="text-sm">
          <span class="text-muted">Running semester:</span>
          <strong class="pct-display">${runningPct}%</strong>
        </div>
        <div class="text-sm">
          <span class="text-muted">Total observed:</span>
          <strong>${totalMinutesObserved} min</strong>
        </div>
      </div>

      <div class="form-group">
        <label style="display:flex;justify-content:space-between;align-items:center;">
          <span>Observation Notes</span>
          <span id="draft-status" style="font-size:11px;font-weight:normal;color:var(--gray-400);"></span>
        </label>
        <div id="obs-notes-editor" style="min-height:180px;font-size:14px;"></div>
      </div>

      <div class="tag-group">
        <div class="tag-group-label">Clinical Skills</div>
        <div class="tags" id="tags-cs">
          ${CLINICAL_SKILLS.map((c) => `<span class="tag tag-cs ${formTags.has(c.id) ? 'active' : ''}" data-id="${c.id}" title="${c.description}">${c.id}: ${c.label}</span>`).join('')}
        </div>
      </div>

      <div class="tag-group">
        <div class="tag-group-label">Clinical Foundations</div>
        <div class="tags" id="tags-cf">
          ${CLINICAL_FOUNDATIONS.map((c) => `<span class="tag tag-cf ${formTags.has(c.id) ? 'active' : ''}" data-id="${c.id}" title="${c.description}">${c.id}: ${c.label}</span>`).join('')}
        </div>
      </div>

      <div class="form-actions">
        <button id="btn-save-obs" class="btn btn-primary">${isEditing ? 'Update Observation' : 'Save Observation'}</button>
        <button id="btn-clear-obs" class="btn btn-secondary">${isEditing ? 'Cancel Edit' : 'Clear'}</button>
      </div>
    </div>
  `;

  // --- Load Quill and initialize editor ---
  await loadQuill();

  const quill = new Quill('#obs-notes-editor', {
    theme: 'snow',
    placeholder: 'Type observation notes here during the session...',
    modules: {
      toolbar: [
        [{ font: [] }, { size: ['small', false, 'large'] }],
        ['bold', 'italic', 'underline'],
        [{ background: [] }],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['clean'],
      ],
    },
  });

  // Set initial content
  if (formNotes) {
    quill.clipboard.dangerouslyPasteHTML(formNotes);
  }

  // --- Wire absent toggle ---
  const absentCheckbox = container.querySelector('#obs-absent');
  const absentLabel    = container.querySelector('#obs-absent-label');
  const minutesSection = container.querySelector('#obs-minutes-section');
  const absentNotice   = container.querySelector('#obs-absent-notice');

  function toggleAbsent() {
    const isAbsent = absentCheckbox.checked;
    minutesSection.hidden = isAbsent;
    absentNotice.hidden   = !isAbsent;
    absentLabel.textContent = isAbsent ? 'Client Absent' : 'Client Absent?';
    absentLabel.style.color = isAbsent ? 'var(--red-600)' : 'var(--gray-600)';
    persistDraft();
  }
  absentCheckbox.addEventListener('change', toggleAbsent);

  // --- Wire minute tracking ---
  const totalInput = container.querySelector('#obs-total-min');
  const obsInput   = container.querySelector('#obs-obs-min');
  const pctDisplay = container.querySelector('#obs-session-pct');

  function updatePct() {
    const total = parseInt(totalInput.value) || 0;
    const obs   = parseInt(obsInput.value)   || 0;
    pctDisplay.textContent = total > 0 ? Math.round((obs / total) * 100) + '%' : '—';
  }
  totalInput.addEventListener('input', () => { updatePct(); persistDraft(); });
  obsInput.addEventListener('input',   () => { updatePct(); persistDraft(); });

  // --- Wire competency tags ---
  const selectedTags = new Set(formTags);
  container.querySelectorAll('.tag').forEach((tag) => {
    tag.addEventListener('click', () => {
      const id = tag.dataset.id;
      if (selectedTags.has(id)) { selectedTags.delete(id); tag.classList.remove('active'); }
      else                       { selectedTags.add(id);    tag.classList.add('active');    }
      persistDraft();
    });
  });

  // --- Draft persistence ---
  const draftStatus = container.querySelector('#draft-status');
  const dateInput   = container.querySelector('#obs-date');
  const typeSelect  = container.querySelector('#obs-type');
  let draftTimer    = null;

  function persistDraft() {
    if (isEditing) return;
    saveDraft(clinician.id, {
      date:            dateInput.value,
      sessionType:     typeSelect.value,
      absent:          absentCheckbox.checked,
      totalMinutes:    parseInt(totalInput.value) || 0,
      minutesObserved: parseInt(obsInput.value)   || 0,
      notes:           quill.root.innerHTML === '<p><br></p>' ? '' : quill.root.innerHTML,
      competencyTags:  [...selectedTags],
    });
    if (draftStatus) { draftStatus.textContent = 'Draft saved'; draftStatus.style.color = 'var(--green-600)'; }
  }

  quill.on('text-change', () => {
    if (isEditing) return;
    clearTimeout(draftTimer);
    if (draftStatus) { draftStatus.textContent = 'Saving…'; draftStatus.style.color = 'var(--gray-400)'; }
    draftTimer = setTimeout(persistDraft, 1000);
  });

  dateInput.addEventListener('change',  persistDraft);
  typeSelect.addEventListener('change', persistDraft);

  // --- Wire save ---
  container.querySelector('#btn-save-obs').addEventListener('click', async () => {
    const date = dateInput.value;
    if (!date) { alert('Please select a session date.'); return; }

    const isAbsent  = absentCheckbox.checked;
    const notesHtml = quill.root.innerHTML === '<p><br></p>' ? '' : quill.root.innerHTML;

    const observation = {
      id:              isEditing ? editObs.id : uuid(),
      clinicianId:     clinician.id,
      date,
      sessionType:     typeSelect.value,
      absent:          isAbsent,
      totalMinutes:    isAbsent ? 0 : (parseInt(totalInput.value) || 0),
      minutesObserved: isAbsent ? 0 : (parseInt(obsInput.value)   || 0),
      notes:           notesHtml,
      competencyTags:  [...selectedTags],
      createdAt:       isEditing ? editObs.createdAt : new Date().toISOString(),
      updatedAt:       new Date().toISOString(),
    };

    await storage.saveObservation(clinician.id, observation);
    clearDraft(clinician.id);
    if (onSaved) onSaved();
  });

  // --- Wire clear / cancel ---
  const clearBtn      = container.querySelector('#btn-clear-obs');
  const cancelEditBtn = container.querySelector('#btn-cancel-edit');

  function cancelEdit() { if (onSaved) onSaved(); }

  clearBtn.addEventListener('click', () => {
    if (isEditing) { cancelEdit(); return; }
    if (quill.getText().trim() && !confirm('Clear all unsaved notes?')) return;
    clearDraft(clinician.id);
    dateInput.value          = suggestedDate;
    typeSelect.value         = 'tx';
    absentCheckbox.checked   = false;
    toggleAbsent();
    totalInput.value         = defaultTotal;
    obsInput.value           = defaultObserved;
    quill.setContents([]);
    selectedTags.clear();
    container.querySelectorAll('.tag.active').forEach((t) => t.classList.remove('active'));
    updatePct();
    if (draftStatus) draftStatus.textContent = '';
  });

  if (cancelEditBtn) cancelEditBtn.addEventListener('click', cancelEdit);
}
