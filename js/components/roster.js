// Roster setup — semester settings and clinician management
import * as storage from '../storage/storage.js';
import { generateSchedule, uuid } from '../utils/dates.js';

let currentOnChange = null;

export function renderRoster() {
  // Roster is rendered inside the modal
}

export function showRosterModal(state, onChange) {
  currentOnChange = onChange;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2>Roster Setup</h2>
        <button class="modal-close">&times;</button>
      </div>
      <div id="roster-content"></div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('.modal-close').addEventListener('click', () => {
    overlay.remove();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  renderRosterContent(state, overlay);
}

async function renderRosterContent(state, overlay) {
  const container = overlay.querySelector('#roster-content');
  const settings = state.settings || { id: '', name: '', startDate: '', endDate: '', supervisor: '' };

  container.innerHTML = `
    <div class="card">
      <h3 class="section-header">Semester Settings</h3>
      <div class="form-row-3">
        <div class="form-group">
          <label>Semester Name</label>
          <input type="text" id="sem-name" value="${settings.name}" placeholder="SP26">
        </div>
        <div class="form-group">
          <label>Start Date</label>
          <input type="date" id="sem-start" value="${settings.startDate}">
        </div>
        <div class="form-group">
          <label>End Date</label>
          <input type="date" id="sem-end" value="${settings.endDate}">
        </div>
      </div>
      <div class="form-group">
        <label>Supervisor Name</label>
        <input type="text" id="sem-supervisor" value="${settings.supervisor}" placeholder="Watson">
      </div>
      <div class="form-actions">
        <button id="btn-save-settings" class="btn btn-primary">Save Settings</button>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>Clinicians</h3>
        <button id="btn-add-clinician" class="btn btn-sm btn-primary">+ Add Clinician</button>
      </div>
      <div id="clinician-list"></div>
    </div>

    <div id="clinician-form-area" hidden>
      <div class="card">
        <h3 class="section-header" id="clinician-form-title">Add Clinician</h3>
        <div class="form-row">
          <div class="form-group">
            <label>Clinician Name *</label>
            <input type="text" id="clin-name" placeholder="Hannah Hout">
          </div>
          <div class="form-group">
            <label>Client Initials *</label>
            <input type="text" id="clin-client" placeholder="RA">
          </div>
        </div>
        <div class="form-row-3">
          <div class="form-group">
            <label>Session Days</label>
            <select id="clin-days">
              <option value="MW">Mon / Wed</option>
              <option value="TR">Tue / Thu</option>
            </select>
          </div>
          <div class="form-group">
            <label>Session Time</label>
            <input type="time" id="clin-time" value="09:00">
          </div>
          <div class="form-group">
            <label>Room</label>
            <input type="text" id="clin-room" placeholder="2120">
          </div>
        </div>
        <div class="form-group">
          <label>Session Length (min)</label>
          <input type="number" id="clin-length" value="45" min="1" max="180" style="width:100px;">
        </div>
        <div class="form-actions">
          <button id="btn-save-clinician" class="btn btn-primary">Save Clinician</button>
          <button id="btn-cancel-clinician" class="btn btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  `;

  // Wire semester settings save
  container.querySelector('#btn-save-settings').addEventListener('click', async () => {
    const s = {
      id: container.querySelector('#sem-name').value || 'default',
      name: container.querySelector('#sem-name').value,
      startDate: container.querySelector('#sem-start').value,
      endDate: container.querySelector('#sem-end').value,
      supervisor: container.querySelector('#sem-supervisor').value,
    };
    await storage.saveSemesterSettings(s);
    state.settings = s;
    if (currentOnChange) currentOnChange();
  });

  // Wire clinician list
  renderClinicianList(state, container, overlay);

  // Wire add clinician button
  let editingId = null;
  container.querySelector('#btn-add-clinician').addEventListener('click', () => {
    editingId = null;
    container.querySelector('#clinician-form-title').textContent = 'Add Clinician';
    container.querySelector('#clin-name').value = '';
    container.querySelector('#clin-client').value = '';
    container.querySelector('#clin-days').value = 'MW';
    container.querySelector('#clin-time').value = '09:00';
    container.querySelector('#clin-room').value = '';
    container.querySelector('#clin-length').value = '45';
    container.querySelector('#clinician-form-area').hidden = false;
  });

  container.querySelector('#btn-cancel-clinician').addEventListener('click', () => {
    container.querySelector('#clinician-form-area').hidden = true;
  });

  // Wire save clinician
  container.querySelector('#btn-save-clinician').addEventListener('click', async () => {
    const name = container.querySelector('#clin-name').value.trim();
    const clientInitials = container.querySelector('#clin-client').value.trim();
    if (!name || !clientInitials) {
      alert('Clinician name and client initials are required.');
      return;
    }

    const sessionDays = container.querySelector('#clin-days').value;
    const sessionTime = container.querySelector('#clin-time').value;
    const room = container.querySelector('#clin-room').value.trim();
    const sessionLengthMin = parseInt(container.querySelector('#clin-length').value) || 45;

    let clinician;
    if (editingId) {
      clinician = state.clinicians.find((c) => c.id === editingId);
      const oldDays = clinician.sessionDays;
      clinician.name = name;
      clinician.clientInitials = clientInitials;
      clinician.sessionDays = sessionDays;
      clinician.sessionTime = sessionTime;
      clinician.room = room;
      clinician.sessionLengthMin = sessionLengthMin;
      // Regenerate schedule if days changed and settings exist
      if (oldDays !== sessionDays && state.settings && state.settings.startDate && state.settings.endDate) {
        clinician.schedule = generateSchedule(state.settings.startDate, state.settings.endDate, sessionDays);
      }
    } else {
      const schedule = (state.settings && state.settings.startDate && state.settings.endDate)
        ? generateSchedule(state.settings.startDate, state.settings.endDate, sessionDays)
        : [];

      clinician = {
        id: uuid(),
        name,
        clientInitials,
        sessionDays,
        sessionTime,
        room,
        sessionLengthMin,
        schedule,
      };
    }

    await storage.saveClinician(clinician);
    state.clinicians = await storage.getAllClinicians();
    container.querySelector('#clinician-form-area').hidden = true;
    renderClinicianList(state, container, overlay);
    if (currentOnChange) currentOnChange();
  });

  // Allow editing from clinician list
  container.addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-edit]');
    if (editBtn) {
      const id = editBtn.dataset.edit;
      const c = state.clinicians.find((cl) => cl.id === id);
      if (!c) return;
      editingId = id;
      container.querySelector('#clinician-form-title').textContent = 'Edit Clinician';
      container.querySelector('#clin-name').value = c.name;
      container.querySelector('#clin-client').value = c.clientInitials;
      container.querySelector('#clin-days').value = c.sessionDays;
      container.querySelector('#clin-time').value = c.sessionTime;
      container.querySelector('#clin-room').value = c.room;
      container.querySelector('#clin-length').value = c.sessionLengthMin;
      container.querySelector('#clinician-form-area').hidden = false;
    }

    const delBtn = e.target.closest('[data-delete]');
    if (delBtn) {
      const id = delBtn.dataset.delete;
      const c = state.clinicians.find((cl) => cl.id === id);
      if (!c) return;
      if (!confirm(`Remove ${c.name}? This will delete all their observation notes.`)) return;
      storage.deleteClinician(id).then(async () => {
        state.clinicians = await storage.getAllClinicians();
        renderClinicianList(state, container, overlay);
        if (currentOnChange) currentOnChange();
      });
    }
  });
}

function renderClinicianList(state, container) {
  const list = container.querySelector('#clinician-list');
  if (state.clinicians.length === 0) {
    list.innerHTML = '<p class="text-muted text-sm" style="padding:8px 0;">No clinicians added yet.</p>';
    return;
  }

  list.innerHTML = state.clinicians.map((c) => `
    <div class="roster-item">
      <div class="roster-item-info">
        <div class="roster-item-name">${c.name} <span class="badge badge-${c.sessionDays.toLowerCase()}">${c.sessionDays}</span></div>
        <div class="roster-item-details">Client: ${c.clientInitials} · ${c.sessionTime} · Room ${c.room} · ${c.sessionLengthMin} min · ${c.schedule ? c.schedule.length : 0} sessions</div>
      </div>
      <div class="roster-item-actions">
        <button class="btn btn-sm btn-secondary" data-edit="${c.id}">Edit</button>
        <button class="btn btn-sm btn-danger" data-delete="${c.id}">Remove</button>
      </div>
    </div>
  `).join('');
}
