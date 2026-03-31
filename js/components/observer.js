// Observation note entry form — primary workflow
import * as storage from '../storage/storage.js';
import { CLINICAL_SKILLS, CLINICAL_FOUNDATIONS } from '../utils/competencies.js';
import { formatDateDisplay, uuid } from '../utils/dates.js';

export function renderObserver(clinician, observations, settings, onSaved) {
  const container = document.getElementById('view-observer');

  // Find next unlogged date
  const loggedDates = new Set(observations.map((o) => o.date));
  const activeDates = (clinician.schedule || []).filter((s) => !s.skipped);
  const nextDate = activeDates.find((s) => !loggedDates.has(s.date));
  const suggestedDate = nextDate ? nextDate.date : '';

  // Calculate running observation stats
  const txObs = observations.filter((o) => o.sessionType === 'tx');
  const totalMinutesObserved = observations.reduce((sum, o) => sum + (o.minutesObserved || 0), 0);
  const totalSessionMinutes = observations.reduce((sum, o) => sum + (o.totalMinutes || 0), 0);
  const runningPct = totalSessionMinutes > 0 ? Math.round((totalMinutesObserved / totalSessionMinutes) * 100) : 0;
  const sessionNumber = observations.length + 1;

  const defaultTotal = clinician.sessionLengthMin || 45;
  const defaultObserved = Math.round(defaultTotal / 2);

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

    <div class="card">
      <div class="form-row-3">
        <div class="form-group">
          <label>Session Date</label>
          <input type="date" id="obs-date" value="${suggestedDate}">
        </div>
        <div class="form-group">
          <label>Session Type</label>
          <select id="obs-type">
            <option value="tx">Treatment (Tx)</option>
            <option value="eval">Evaluation</option>
          </select>
        </div>
        <div class="form-group">
          <label>Session #</label>
          <input type="text" id="obs-session-num" value="${sessionNumber}" readonly style="background:var(--gray-50);color:var(--gray-500);">
        </div>
      </div>

      <div class="form-row-3">
        <div class="form-group">
          <label>Total Minutes</label>
          <input type="number" id="obs-total-min" value="${defaultTotal}" min="1">
        </div>
        <div class="form-group">
          <label>Minutes Observed</label>
          <input type="number" id="obs-obs-min" value="${defaultObserved}" min="0">
        </div>
        <div class="form-group">
          <label>This Session %</label>
          <div class="pct-display" id="obs-session-pct">${Math.round((defaultObserved / defaultTotal) * 100)}%</div>
        </div>
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
        <textarea id="obs-notes" rows="8" placeholder="Type observation notes here during the session..."></textarea>
      </div>

      <div class="tag-group">
        <div class="tag-group-label">Clinical Skills</div>
        <div class="tags" id="tags-cs">
          ${CLINICAL_SKILLS.map((c) => `<span class="tag tag-cs" data-id="${c.id}" title="${c.description}">${c.id}: ${c.label}</span>`).join('')}
        </div>
      </div>

      <div class="tag-group">
        <div class="tag-group-label">Clinical Foundations</div>
        <div class="tags" id="tags-cf">
          ${CLINICAL_FOUNDATIONS.map((c) => `<span class="tag tag-cf" data-id="${c.id}" title="${c.description}">${c.id}: ${c.label}</span>`).join('')}
        </div>
      </div>

      <div class="form-actions">
        <button id="btn-save-obs" class="btn btn-primary">Save Observation</button>
        <button id="btn-clear-obs" class="btn btn-secondary">Clear</button>
      </div>
    </div>
  `;

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
  const selectedTags = new Set();

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

    const observation = {
      id: uuid(),
      clinicianId: clinician.id,
      date,
      sessionType: container.querySelector('#obs-type').value,
      totalMinutes: parseInt(totalInput.value) || 0,
      minutesObserved: parseInt(obsInput.value) || 0,
      notes: container.querySelector('#obs-notes').value,
      competencyTags: [...selectedTags],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await storage.saveObservation(clinician.id, observation);
    if (onSaved) onSaved();
  });

  // --- Wire clear ---
  container.querySelector('#btn-clear-obs').addEventListener('click', () => {
    container.querySelector('#obs-date').value = suggestedDate;
    container.querySelector('#obs-type').value = 'tx';
    totalInput.value = defaultTotal;
    obsInput.value = defaultObserved;
    container.querySelector('#obs-notes').value = '';
    selectedTags.clear();
    container.querySelectorAll('.tag.active').forEach((t) => t.classList.remove('active'));
    updatePct();
  });
}
