// Schedule management view — per-clinician semester date management
import { formatDateDisplay, formatDate } from '../utils/dates.js';

export function renderSchedule(clinician, observations, onChanged) {
  const container = document.getElementById('view-schedule');
  const loggedDates = new Set(observations.map((o) => o.date));
  const today = formatDate(new Date());

  container.innerHTML = `
    <div class="clinician-header">
      <div>
        <span class="clinician-header-name">${clinician.name}</span>
        <span class="badge badge-${clinician.sessionDays.toLowerCase()}">${clinician.sessionDays}</span>
      </div>
      <div class="clinician-header-details">
        <span>Client: ${clinician.clientInitials}</span>
        <span>${(clinician.schedule || []).filter(s => !s.skipped).length} active sessions</span>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>Schedule</h3>
        <button id="btn-add-date" class="btn btn-sm btn-secondary">+ Add Date</button>
      </div>
      <div id="add-date-form" hidden style="margin-bottom:12px;">
        <div class="form-row" style="align-items:end;">
          <div class="form-group" style="margin-bottom:0;">
            <label>Date</label>
            <input type="date" id="new-date-input">
          </div>
          <div>
            <button id="btn-confirm-add-date" class="btn btn-sm btn-primary">Add</button>
            <button id="btn-cancel-add-date" class="btn btn-sm btn-secondary">Cancel</button>
          </div>
        </div>
      </div>
      <ul class="schedule-list">
        ${(clinician.schedule || []).map((s, i) => {
          const isLogged = loggedDates.has(s.date);
          const isPast = s.date < today;
          let statusIcon, statusClass;
          if (s.skipped) {
            statusIcon = '—';
            statusClass = '';
          } else if (isLogged) {
            statusIcon = '✓';
            statusClass = 'schedule-status-logged';
          } else {
            statusIcon = '○';
            statusClass = 'schedule-status-upcoming';
          }

          return `
            <li class="schedule-item ${s.skipped ? 'skipped' : ''} ${isLogged ? 'logged' : ''}">
              <div style="display:flex;align-items:center;gap:8px;">
                <span class="schedule-status ${statusClass}">${statusIcon}</span>
                <span>${formatDateDisplay(s.date)}</span>
              </div>
              <div>
                ${!isLogged ? `<button class="btn btn-sm ${s.skipped ? 'btn-secondary' : 'btn-danger'}" data-toggle-skip="${i}">${s.skipped ? 'Restore' : 'Skip'}</button>` : ''}
              </div>
            </li>
          `;
        }).join('')}
      </ul>
    </div>
  `;

  // Wire skip/restore toggles
  container.querySelectorAll('[data-toggle-skip]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.toggleSkip);
      clinician.schedule[idx].skipped = !clinician.schedule[idx].skipped;
      if (onChanged) onChanged(clinician);
    });
  });

  // Wire add date
  container.querySelector('#btn-add-date').addEventListener('click', () => {
    container.querySelector('#add-date-form').hidden = false;
  });

  container.querySelector('#btn-cancel-add-date').addEventListener('click', () => {
    container.querySelector('#add-date-form').hidden = true;
  });

  container.querySelector('#btn-confirm-add-date').addEventListener('click', () => {
    const dateVal = container.querySelector('#new-date-input').value;
    if (!dateVal) return;
    // Insert in sorted order
    const newEntry = { date: dateVal, skipped: false };
    clinician.schedule.push(newEntry);
    clinician.schedule.sort((a, b) => a.date.localeCompare(b.date));
    container.querySelector('#add-date-form').hidden = true;
    if (onChanged) onChanged(clinician);
  });
}
