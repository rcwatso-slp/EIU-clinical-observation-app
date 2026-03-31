// Main app initialization and routing
import * as storage from './storage/storage.js';
import { renderNav } from './components/nav.js';
import { renderRoster, showRosterModal } from './components/roster.js';
import { renderObserver } from './components/observer.js';
import { renderHistory } from './components/history.js';
import { renderSchedule } from './components/schedule.js';
import { exportClinicianExcel } from './export/excel.js';

// App state
const state = {
  settings: null,
  clinicians: [],
  selectedClinicianId: null,
  currentView: 'welcome', // welcome | observer | history | schedule
};

// --- Initialization ---

async function init() {
  state.settings = await storage.getSemesterSettings();
  state.clinicians = await storage.getAllClinicians();

  wireTopBar();
  wireViewTabs();

  if (state.clinicians.length > 0) {
    renderNav(state, selectClinician);
    selectClinician(state.clinicians[0].id);
  } else {
    showView('welcome');
  }
}

// --- Navigation ---

function wireTopBar() {
  document.getElementById('btn-roster').addEventListener('click', () => {
    showRosterModal(state, onRosterChange);
  });

  document.getElementById('btn-welcome-setup').addEventListener('click', () => {
    showRosterModal(state, onRosterChange);
  });

  document.getElementById('btn-export').addEventListener('click', handleExport);

  document.getElementById('btn-data').addEventListener('click', () => {
    showView('data');
    renderDataView();
  });
}

function wireViewTabs() {
  document.querySelectorAll('.view-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const view = tab.dataset.view;
      setActiveViewTab(view);
      showClinicianView(view);
    });
  });
}

function setActiveViewTab(view) {
  document.querySelectorAll('.view-tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.view === view);
  });
}

function showView(viewName) {
  document.querySelectorAll('.view').forEach((v) => (v.hidden = true));
  const el = document.getElementById(`view-${viewName}`);
  if (el) el.hidden = false;

  const clinicianTabs = document.getElementById('clinician-tabs');
  const viewTabs = document.getElementById('view-tabs');

  if (viewName === 'welcome') {
    clinicianTabs.hidden = true;
    viewTabs.hidden = true;
  } else if (viewName === 'data') {
    clinicianTabs.hidden = state.clinicians.length === 0;
    viewTabs.hidden = true;
  } else {
    clinicianTabs.hidden = state.clinicians.length === 0;
    viewTabs.hidden = false;
  }
}

function selectClinician(id) {
  state.selectedClinicianId = id;
  renderNav(state, selectClinician);
  setActiveViewTab('observer');
  showClinicianView('observer');
}

async function showClinicianView(view) {
  state.currentView = view;
  const clinician = state.clinicians.find((c) => c.id === state.selectedClinicianId);
  if (!clinician) return;

  const observations = await storage.getObservations(clinician.id);

  showView(view);

  if (view === 'observer') {
    renderObserver(clinician, observations, state.settings, onObservationSaved);
  } else if (view === 'history') {
    renderHistory(clinician, observations, state.settings, onObservationDeleted, onObservationEdit);
  } else if (view === 'schedule') {
    renderSchedule(clinician, observations, onScheduleChanged);
  }
}

// --- Callbacks ---

async function onRosterChange() {
  state.settings = await storage.getSemesterSettings();
  state.clinicians = await storage.getAllClinicians();

  if (state.clinicians.length > 0) {
    renderNav(state, selectClinician);
    if (!state.selectedClinicianId || !state.clinicians.find((c) => c.id === state.selectedClinicianId)) {
      selectClinician(state.clinicians[0].id);
    } else {
      showClinicianView(state.currentView === 'welcome' ? 'observer' : state.currentView);
    }
  } else {
    state.selectedClinicianId = null;
    showView('welcome');
  }
}

async function onObservationSaved() {
  await showClinicianView('observer');
}

async function onObservationDeleted() {
  await showClinicianView('history');
}

async function onObservationEdit(obs) {
  const clinician = state.clinicians.find((c) => c.id === state.selectedClinicianId);
  if (!clinician) return;
  const observations = await storage.getObservations(clinician.id);
  setActiveViewTab('observer');
  showView('observer');
  state.currentView = 'observer';
  renderObserver(clinician, observations, state.settings, onObservationSaved, obs);
}

async function onScheduleChanged(clinician) {
  await storage.saveClinician(clinician);
  state.clinicians = await storage.getAllClinicians();
  const observations = await storage.getObservations(clinician.id);
  renderSchedule(clinician, observations, onScheduleChanged);
}

// --- Export ---

async function handleExport() {
  const clinician = state.clinicians.find((c) => c.id === state.selectedClinicianId);
  if (!clinician) {
    alert('Select a clinician first.');
    return;
  }
  const observations = await storage.getObservations(clinician.id);
  exportClinicianExcel(clinician, observations, state.settings);
}

// --- Data Management View ---

function renderDataView() {
  const container = document.getElementById('view-data');
  container.innerHTML = `
    <div class="card">
      <h3 class="section-header">Data Management</h3>
      <div class="form-actions" style="flex-direction: column; gap: 12px;">
        <div>
          <button id="btn-backup" class="btn btn-secondary">Export Backup (JSON)</button>
          <p class="text-sm text-muted mt-8">Download all app data as a JSON file for safekeeping.</p>
        </div>
        <div>
          <button id="btn-restore" class="btn btn-secondary">Import Backup (JSON)</button>
          <input type="file" id="file-restore" accept=".json" hidden>
          <p class="text-sm text-muted mt-8">Restore data from a previously exported JSON backup.</p>
        </div>
        <div>
          <button id="btn-clear" class="btn btn-danger">Clear All Data</button>
          <p class="text-sm text-muted mt-8">Delete all data and start fresh. This cannot be undone.</p>
        </div>
      </div>
    </div>
  `;

  container.querySelector('#btn-backup').addEventListener('click', async () => {
    const data = await storage.exportAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clinical-obs-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  container.querySelector('#btn-restore').addEventListener('click', () => {
    container.querySelector('#file-restore').click();
  });

  container.querySelector('#file-restore').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const data = JSON.parse(text);
    await storage.importAllData(data);
    alert('Data restored successfully.');
    onRosterChange();
  });

  container.querySelector('#btn-clear').addEventListener('click', async () => {
    if (!confirm('Are you sure you want to delete ALL data? This cannot be undone.')) return;
    if (!confirm('Really delete everything? Export a backup first if unsure.')) return;
    await storage.clearAllData();
    state.settings = null;
    state.clinicians = [];
    state.selectedClinicianId = null;
    showView('welcome');
  });
}

// --- Start ---
init();
