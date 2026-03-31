// Observation note entry form — primary workflow
import * as storage from '../storage/storage.js';
import { CLINICAL_SKILLS, CLINICAL_FOUNDATIONS } from '../utils/competencies.js';
import { formatDateDisplay, uuid } from '../utils/dates.js';

/**
 * @param {object} clinician
 * @param {array} observations
 * @param {object} settings
 * @param {function} onSaved
 * @param {object|null} editObs — if provided, pre-fill the form for editing this observation
 */
export function renderObserver(clinician, observations, settings, onSaved, editObs = null) {
  const container = document.getElementById('view-observer');

  // Find next unlogged date (skip if editing)
  const loggedDates = new Set(observations.map((o) => o.date));
  const activeDates = (clinician.schedule || []).filter((s) => !s.skipped);
  const nextDate = activeDates.find((s) => !loggedDates.has(s.date));
  const suggestedDate = nextDate ? nextDate.date : '';

  // Calculate running observation stats (exclude the editing obs from totals so it doesn't double-count)
  const statsObs = editObs ? observations.filter((o) => o.id !== editObs.id) : observations;
  const totalMinutesObserved = statsObs.reduce((sum, o) => sum + (o.minutesObserved || 0), 0);
  const totalSessionMinutes = statsObs.reduce((sum, o) => sum + (o.totalMinutes || 0), 0);
  const runningPct = totalSessionMinutes > 0 ? Math.round((totalMinutesObserved / totalSessionMinutes) * 100) : 0;
  const sessionNumber = editObs
    ? observations.sort((a, b) => a.date.localeCompare(b.date)).indexOf(editObs) + 1 || '—'
    : observations.length + 1;

  // Defaults: use editing obs values or clinician defaults
  const formDate = editObs ? editObs.date : suggestedDate;
  const formType = editObs ? editObs.sessionType : 'tx';
  const formAbsent = editObs ? !!editObs.absent : false;
  const formTotal = editObs ? editObs.totalMinutes : (clinician.sessionLengthMin || 45);
  const formObserved = editObs ? editObs.minutesObserved : Math.round((clinician.sessionLengthMin || 45) / 2);
  const formNotes = editObs ? editObs.notes : '';
  const formTags = editObs ? new Set(editObs.competencyTags || []) : new Set();
  const formPct = formAbsent ? 0 : (formTotal > 0 ? Math.round((formObserved / formTotal) * 100) : 0);

  const isEditing = !!editObs;

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

    ${isEditing ? `<div class="card" style="background:var(--blue-50);border-color:var(--blue-200);padding:10px 14px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span class="text-sm" style="color:var(--blue-700);font-weight:600;">Editing observation from ${formatDateDisplay(editObs.date)}</span>
        <button id="btn-cancel-edit" class="btn btn-sm btn-secondary">Cancel Edit</button>
      </div>
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
            <option value="tx" ${formType === 'tx' ? 'selected' : ''}>Treatment (Tx)</option>
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
          <strong class="pct-display" id="obs-running-pct">${runningPct}%</strong>
        </div>
        <div class="text-sm">
          <span class="text-muted">Total observed:</span>
          <strong>${totalMinutesObserved} min</strong>
        </div>
      </div>

      <div class="form-group">
        <label>Observation Notes</label>
        <textarea id="obs-notes" rows="8" placeholder="Type observation notes here during the session...">${escapeHtml(formNotes)}</textarea>
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

  // --- Wire absent toggle ---
  const absentCheckbox = container.querySelector('#obs-absent');
  const absentLabel = container.querySelector('#obs-absent-label');
  const minutesSection = container.querySelector('#obs-minutes-section');
  const absentNotice = container.querySelector('#obs-absent-notice');

  function toggleAbsent() {
    const isAbsent = absentCheckbox.checked;
    minutesSection.hidden = isAbsent;
    absentNotice.hidden = !isAbsent;
    absentLabel.textContent = isAbsent ? 'Client Absent' : 'Client Absent?';
    absentLabel.style.color = isAbsent ? 'var(--red-600)' : 'var(--gray-600)';
  }

  absentCheckbox.addEventListener('change', toggleAbsent);

  // --- Wire minute tracking ---
  const totalInput = container.querySelector('#obs-total-min');
  const obsInput = container.querySelector('#obs-obs-min');
  const pctDisplay = container.querySelector('#obs-session-pct');

  function updatePct() {
    const total = parseInt(totalInput.value) || 0;
    const obs = parseInt(obsInput.value) || 0;
    pctDisplay.textContent = total > 0 ? Math.round((obs / total) * 100) + '%' : '—';
  }

  totalInput.addEventListener('input', updatePct);
  obsInput.addEventListener('input', updatePct);

  // --- Wire competency tags ---
  const selectedTags = new Set(formTags);

  container.querySelectorAll('.tag').forEach((tag) => {
    tag.addEventListener('click', () => {
      const id = tag.dataset.id;
      if (selectedTags.has(id)) {
        selectedTags.delete(id);
        tag.classList.remove('active');
      } else {
        selectedTags.add(id);
        tag.classList.add('active');
      }
    });
  });

  // --- Wire save ---
  container.querySelector('#btn-save-obs').addEventListener('click', async () => {
    const date = container.querySelector('#obs-date').value;
    if (!date) {
      alert('Please select a session date.');
      return;
    }

    const isAbsent = absentCheckbox.checked;
    const observation = {
      id: isEditing ? editObs.id : uuid(),
      clinicianId: clinician.id,
      date,
      sessionType: container.querySelector('#obs-type').value,
      absent: isAbsent,
      totalMinutes: isAbsent ? 0 : (parseInt(totalInput.value) || 0),
      minutesObserved: isAbsent ? 0 : (parseInt(obsInput.value) || 0),
      notes: container.querySelector('#obs-notes').value,
      competencyTags: [...selectedTags],
      createdAt: isEditing ? editObs.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await storage.saveObservation(clinician.id, observation);
    if (onSaved) onSaved();
  });

  // --- Wire clear / cancel edit ---
  const clearBtn = container.querySelector('#btn-clear-obs');
  const cancelEditBtn = container.querySelector('#btn-cancel-edit');

  function cancelEdit() {
    if (onSaved) onSaved(); // Re-render fresh form
  }

  clearBtn.addEventListener('click', () => {
    if (isEditing) {
      cancelEdit();
    } else {
      container.querySelector('#obs-date').value = suggestedDate;
      container.querySelector('#obs-type').value = 'tx';
      absentCheckbox.checked = false;
      toggleAbsent();
      totalInput.value = clinician.sessionLengthMin || 45;
      obsInput.value = Math.round((clinician.sessionLengthMin || 45) / 2);
      container.querySelector('#obs-notes').value = '';
      selectedTags.clear();
      container.querySelectorAll('.tag.active').forEach((t) => t.classList.remove('active'));
      updatePct();
    }
  });

  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', cancelEdit);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
