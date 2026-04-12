// Roster module — semester settings and clinician management
// Renders inline into the view-roster container (not a modal)
import * as storage from '../../storage/storage.js';
import { linkStudentEmail, getArchivedSemesters, archiveSemester } from '../../storage/firebase-storage.js';
import { generateSchedule, uuid } from '../../utils/dates.js';

export function renderRoster(state, container, onChange, opts = {}) {
  // opts: { onArchiveSelect(semId, semName), onEndSemester() }
  const settings = state.settings || { id: '', name: '', startDate: '', endDate: '', supervisor: '' };

  // Render archive dropdown placeholder; populate asynchronously
  container.innerHTML = `
    <div class="roster-archive-bar">
      <label class="roster-archive-label">Previous Semesters</label>
      <select id="sem-archive-select" class="roster-archive-select">
        <option value="">— Select a past semester —</option>
      </select>
    </div>

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
        <span id="settings-saved-msg" style="font-size:12px;color:var(--green-600);display:none;">Saved!</span>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>Clinicians</h3>
        <button id="btn-add-clinician" class="btn btn-sm btn-primary">+ Add Clinician</button>
      </div>
      <div id="clinician-list"></div>
    </div>

    <div class="card roster-end-semester-card">
      <h3 class="section-header">End of Semester</h3>
      <p class="text-sm text-muted" style="margin-bottom:12px;">
        Archives all clinician data for <strong>${settings.name || 'this semester'}</strong> and clears the roster
        so you can set up a fresh semester. Archived data is read-only and accessible from the
        Previous Semesters dropdown above.
      </p>
      <button id="btn-end-semester" class="btn btn-danger"
        ${!settings.name ? 'disabled title="Set a semester name first"' : ''}>
        Archive &amp; End Semester
      </button>
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
        <div class="form-group">
          <label>Student Email <span class="label-hint">(optional — gives student read-only access)</span></label>
          <input type="email" id="clin-student-email" placeholder="student@eiu.edu">
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
    const msg = container.querySelector('#settings-saved-msg');
    msg.style.display = 'inline';
    setTimeout(() => { msg.style.display = 'none'; }, 2000);
    if (onChange) onChange();
  });

  async function handleReorder(ids) {
    state.clinicians = ids.map((id) => state.clinicians.find((c) => c.id === id)).filter(Boolean);
    if (state.settings) state.settings.clinicianOrder = ids;
    await storage.saveClinicianOrder(ids);
    renderClinicianList(state, container, handleReorder);
  }

  // Render initial clinician list
  renderClinicianList(state, container, handleReorder);

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
    container.querySelector('#clin-student-email').value = '';
    container.querySelector('#clinician-form-area').hidden = false;
    container.querySelector('#clin-name').focus();
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
    const studentEmail = container.querySelector('#clin-student-email').value.trim().toLowerCase() || '';

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
      clinician.studentEmail = studentEmail;
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
        studentEmail,
        schedule,
      };
    }

    await storage.saveClinician(clinician);
    if (studentEmail) {
      await linkStudentEmail(clinician).catch(() => {}); // non-fatal if student link fails
    }
    state.clinicians = await storage.getAllClinicians();
    container.querySelector('#clinician-form-area').hidden = true;
    renderClinicianList(state, container, handleReorder);
    if (onChange) onChange();
  });

  // ── Archive dropdown — populate and wire ──────────────────────────────────
  getArchivedSemesters().then((semesters) => {
    const sel = container.querySelector('#sem-archive-select');
    if (!sel) return;
    semesters.forEach((sem) => {
      const opt = document.createElement('option');
      opt.value = sem.id || sem.name;
      opt.textContent = sem.name || sem.id;
      sel.appendChild(opt);
    });
  });

  container.querySelector('#sem-archive-select').addEventListener('change', (e) => {
    const semId = e.target.value;
    if (!semId) return;
    const opt = e.target.options[e.target.selectedIndex];
    if (opts.onArchiveSelect) opts.onArchiveSelect(semId, opt.textContent);
    // Reset dropdown so it can be re-selected if user exits archive and comes back
    e.target.value = '';
  });

  // ── End Semester button ───────────────────────────────────────────────────
  const endBtn = container.querySelector('#btn-end-semester');
  if (endBtn) {
    endBtn.addEventListener('click', async () => {
      const semName = settings.name || 'this semester';
      if (!confirm(
        `Archive "${semName}" and clear the roster?\n\n` +
        `All clinician data will be saved to Previous Semesters and this roster will be emptied. ` +
        `This cannot be undone.`
      )) return;

      endBtn.disabled = true;
      endBtn.textContent = 'Archiving…';

      try {
        await archiveSemester();
        if (opts.onEndSemester) opts.onEndSemester();
      } catch (err) {
        alert(`Archive failed: ${err.message}`);
        endBtn.disabled = false;
        endBtn.textContent = 'Archive & End Semester';
      }
    });
  }

  // Edit / delete via event delegation
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
      container.querySelector('#clin-student-email').value = c.studentEmail || '';
      container.querySelector('#clinician-form-area').hidden = false;
      container.querySelector('#clin-name').focus();
    }

    const delBtn = e.target.closest('[data-delete]');
    if (delBtn) {
      const id = delBtn.dataset.delete;
      const c = state.clinicians.find((cl) => cl.id === id);
      if (!c) return;
      if (!confirm(`Remove ${c.name}? This will delete all their observation notes and evaluations.`)) return;
      storage.deleteClinician(id).then(async () => {
        state.clinicians = await storage.getAllClinicians();
        renderClinicianList(state, container, handleReorder);
        if (onChange) onChange();
      });
    }
  });
}

function renderClinicianList(state, container, onReorder) {
  const list = container.querySelector('#clinician-list');
  if (state.clinicians.length === 0) {
    list.innerHTML = '<p class="text-muted text-sm" style="padding:8px 0;">No clinicians added yet.</p>';
    return;
  }

  list.innerHTML = state.clinicians.map((c) => `
    <div class="roster-item" data-id="${c.id}" draggable="true">
      <span class="drag-handle" title="Drag to reorder">⠿</span>
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

  if (onReorder) {
    let dragSrcId = null;
    list.querySelectorAll('.roster-item').forEach((item) => {
      item.addEventListener('dragstart', (e) => {
        dragSrcId = item.dataset.id;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        list.querySelectorAll('.roster-item').forEach((i) => i.classList.remove('drag-over'));
      });
      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        list.querySelectorAll('.roster-item').forEach((i) => i.classList.remove('drag-over'));
        if (item.dataset.id !== dragSrcId) item.classList.add('drag-over');
      });
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!dragSrcId || dragSrcId === item.dataset.id) return;
        const ids = [...list.querySelectorAll('.roster-item')].map((i) => i.dataset.id);
        const srcIdx = ids.indexOf(dragSrcId);
        const dstIdx = ids.indexOf(item.dataset.id);
        ids.splice(srcIdx, 1);
        ids.splice(dstIdx, 0, dragSrcId);
        onReorder(ids);
      });
    });
  }
}
