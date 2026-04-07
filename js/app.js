// Main app initialization and routing
import * as storage from './storage/storage.js';
import { renderClinicianSelector } from './shared/nav.js';
import { renderRoster } from './modules/roster/roster.js';
import { renderObserver } from './modules/observations/observer.js';
import { renderHistory } from './modules/observations/history.js';
import { renderSchedule } from './modules/observations/schedule.js';
import { renderEvaluation } from './modules/evaluations/eval-form.js';
import { exportClinicianExcel } from './export/excel.js';
import { exportClinicianDocx } from './export/docx.js';
import { onAuthReady, renderAuthScreen, renderSignOutButton } from './modules/auth/auth.js';
import { hasMigrated, hasIndexedDbData, renderMigrationBanner } from './modules/auth/migration.js';
import { renderSoapList } from './modules/soap/soap-list.js';
import { renderSoapEditor } from './modules/soap/soap-editor.js';
import { getSoapNotesByClinicianId, saveSoapNote, deleteSoapNote, createEmptyNote } from './modules/soap/soap-storage.js';
import { renderItpEditor } from './modules/itp/itp-editor.js';
import { getItp } from './modules/itp/itp-storage.js';

// App state
const state = {
  settings: null,
  clinicians: [],
  selectedClinicianId: null,
  currentModule: 'observations', // observations | evaluations | roster | soap
  currentView: 'observer',       // observer | history | schedule (within observations)
};

// --- Auth bootstrap ---

onAuthReady(async (user) => {
  if (!user) {
    showAuthScreen();
    return;
  }

  // Determine role from Firestore user doc
  const { getUserRole } = await import('./modules/auth/auth.js');
  const role = await getUserRole(user.uid);

  if (role === 'student') {
    const { initStudentView } = await import('./modules/student/student-view.js');
    await initStudentView(user, showAuthScreen);
    return;
  }

  // Supervisor flow
  const { setCurrentUser } = await import('./storage/firebase-storage.js');
  setCurrentUser(user.uid);

  showSupervisorShell(user);

  // Check if migration is needed
  if (!hasMigrated() && (await hasIndexedDbData())) {
    showMigrationBanner(initSupervisorApp);
  } else {
    await initSupervisorApp();
  }
});

function showAuthScreen() {
  document.getElementById('view-auth').hidden = false;
  document.getElementById('supervisor-shell').hidden = true;
  document.getElementById('student-shell').hidden = true;

  renderAuthScreen(document.getElementById('view-auth'), async (user, role) => {
    // onAuthStateChanged will fire and handle routing
  });
}

function showSupervisorShell(user) {
  document.getElementById('view-auth').hidden = true;
  document.getElementById('supervisor-shell').hidden = false;
  document.getElementById('student-shell').hidden = true;

  // Add sign-out button to top bar
  const topActions = document.querySelector('#supervisor-shell .top-actions');
  if (!document.getElementById('btn-signout')) {
    renderSignOutButton(topActions, showAuthScreen);
  }
}

function showMigrationBanner(onComplete) {
  const shell = document.getElementById('supervisor-shell');
  const migrationEl = document.getElementById('migration-area');
  migrationEl.hidden = false;
  document.getElementById('main-content').hidden = true;

  renderMigrationBanner(migrationEl, async () => {
    migrationEl.hidden = true;
    document.getElementById('main-content').hidden = false;
    await onComplete();
  });
}

// --- Clinician ordering ---

function applySavedOrder(clinicians, settings) {
  const order = settings?.clinicianOrder;
  if (!order || order.length === 0) return clinicians;
  return [...clinicians].sort((a, b) => {
    const ai = order.indexOf(a.id);
    const bi = order.indexOf(b.id);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

async function onReorderClinicians(ids) {
  state.clinicians = ids.map((id) => state.clinicians.find((c) => c.id === id)).filter(Boolean);
  if (state.settings) state.settings.clinicianOrder = ids;
  await storage.saveClinicianOrder(ids);
  const selectorFn = state.currentModule === 'evaluations' ? selectClinicianForEval
    : state.currentModule === 'soap'        ? selectClinicianForSoap
    : state.currentModule === 'itp'         ? selectClinicianForItp
    : selectClinician;
  renderClinicianSelector(state, selectorFn, onReorderClinicians);
}

// --- Supervisor App Initialization ---

async function initSupervisorApp() {
  state.settings   = await storage.getSemesterSettings();
  state.clinicians = applySavedOrder(await storage.getAllClinicians(), state.settings);

  wireTopBar();
  wireModuleNav();
  wireViewTabs();

  if (state.clinicians.length > 0) {
    state.selectedClinicianId = state.clinicians[0].id;
    renderClinicianSelector(state, selectClinician, onReorderClinicians);
    document.getElementById('clinician-tabs').hidden = false;
    document.getElementById('view-tabs').hidden = false;
    setActiveViewTab('observer');
    await showClinicianView('observer');
  } else {
    document.getElementById('clinician-tabs').hidden = true;
    document.getElementById('view-tabs').hidden = true;
    showView('welcome');
  }
}

// --- Top bar ---

function wireTopBar() {
  document.getElementById('btn-welcome-setup').addEventListener('click', () => {
    switchModule('roster');
  });

  document.getElementById('btn-export').addEventListener('click', handleExport);
  document.getElementById('btn-export-word').addEventListener('click', handleExportWord);

  document.getElementById('btn-data').addEventListener('click', () => {
    showView('data');
    document.getElementById('clinician-tabs').hidden = true;
    document.getElementById('view-tabs').hidden = true;
    renderDataView();
  });
}

// --- Module navigation ---

function wireModuleNav() {
  document.querySelectorAll('.module-tab').forEach((tab) => {
    tab.addEventListener('click', () => switchModule(tab.dataset.module));
  });
}

function setActiveModuleTab(module) {
  document.querySelectorAll('.module-tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.module === module);
  });
}

async function switchModule(module) {
  state.currentModule = module;
  setActiveModuleTab(module);

  if (module === 'roster') {
    document.getElementById('clinician-tabs').hidden = true;
    document.getElementById('view-tabs').hidden = true;
    showView('roster');
    renderRoster(state, document.getElementById('view-roster'), onRosterChange);

  } else if (module === 'observations') {
    if (state.clinicians.length === 0) {
      document.getElementById('clinician-tabs').hidden = true;
      document.getElementById('view-tabs').hidden = true;
      showView('welcome');
    } else {
      renderClinicianSelector(state, selectClinician, onReorderClinicians);
      document.getElementById('clinician-tabs').hidden = false;
      document.getElementById('view-tabs').hidden = false;
      setActiveViewTab(state.currentView);
      await showClinicianView(state.currentView);
    }

  } else if (module === 'soap') {
    if (state.clinicians.length === 0) {
      document.getElementById('clinician-tabs').hidden = true;
      document.getElementById('view-tabs').hidden = true;
      showView('welcome');
    } else {
      renderClinicianSelector(state, selectClinicianForSoap, onReorderClinicians);
      document.getElementById('clinician-tabs').hidden = false;
      document.getElementById('view-tabs').hidden = true;
      await showSoapListView();
    }

  } else if (module === 'evaluations') {
    if (state.clinicians.length === 0) {
      document.getElementById('clinician-tabs').hidden = true;
      document.getElementById('view-tabs').hidden = true;
      showView('welcome');
    } else {
      renderClinicianSelector(state, selectClinicianForEval, onReorderClinicians);
      document.getElementById('clinician-tabs').hidden = false;
      document.getElementById('view-tabs').hidden = true;
      await showEvaluationView();
    }

  } else if (module === 'itp') {
    if (state.clinicians.length === 0) {
      document.getElementById('clinician-tabs').hidden = true;
      document.getElementById('view-tabs').hidden = true;
      showView('welcome');
    } else {
      renderClinicianSelector(state, selectClinicianForItp, onReorderClinicians);
      document.getElementById('clinician-tabs').hidden = false;
      document.getElementById('view-tabs').hidden = true;
      await showItpView();
    }
  }
}

// --- View tabs (within observations module) ---

function wireViewTabs() {
  document.querySelectorAll('.view-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const view = tab.dataset.view;
      state.currentView = view;
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

// --- View visibility ---

function showView(viewName) {
  document.querySelectorAll('#main-content .view').forEach((v) => (v.hidden = true));
  const el = document.getElementById(`view-${viewName}`);
  if (el) el.hidden = false;
}

// --- Clinician selection ---

function selectClinician(id) {
  state.selectedClinicianId = id;
  state.currentView = 'observer';
  renderClinicianSelector(state, selectClinician, onReorderClinicians);
  setActiveViewTab('observer');
  showClinicianView('observer');
}

function selectClinicianForEval(id) {
  state.selectedClinicianId = id;
  renderClinicianSelector(state, selectClinicianForEval, onReorderClinicians);
  showEvaluationView();
}

// --- Clinician views (observations module) ---

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

// --- Evaluation view ---

async function showEvaluationView() {
  const clinician = state.clinicians.find((c) => c.id === state.selectedClinicianId);
  if (!clinician) return;

  const semId      = state.settings ? (state.settings.id || state.settings.name || 'default') : 'default';
  const evaluation = await storage.getEvaluation(clinician.id, semId);
  const observations = await storage.getObservations(clinician.id);

  showView('evaluations');
  renderEvaluation(clinician, evaluation, state.settings, observations, onEvaluationSaved);
}

// --- Callbacks ---

async function onRosterChange() {
  state.settings   = await storage.getSemesterSettings();
  state.clinicians = applySavedOrder(await storage.getAllClinicians(), state.settings);

  if (state.selectedClinicianId && !state.clinicians.find((c) => c.id === state.selectedClinicianId)) {
    state.selectedClinicianId = state.clinicians.length > 0 ? state.clinicians[0].id : null;
  }

  if (state.currentModule !== 'roster') {
    await switchModule(state.currentModule);
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
  state.currentView = 'observer';
  setActiveViewTab('observer');
  showView('observer');
  renderObserver(clinician, observations, state.settings, onObservationSaved, obs);
}

async function onScheduleChanged(clinician) {
  await storage.saveClinician(clinician);
  state.clinicians = await storage.getAllClinicians();
  const observations = await storage.getObservations(clinician.id);
  renderSchedule(clinician, observations, onScheduleChanged);
}

function onEvaluationSaved(evaluation) {
  // Stay on current view — no re-render needed
}

// --- Exports ---

async function handleExport() {
  if (state.currentModule !== 'observations') {
    alert('Use the "Export Excel" button inside the Evaluations form to export evaluation data.');
    return;
  }
  const clinician = state.clinicians.find((c) => c.id === state.selectedClinicianId);
  if (!clinician) { alert('Select a clinician first.'); return; }
  const observations = await storage.getObservations(clinician.id);
  exportClinicianExcel(clinician, observations, state.settings);
}

async function handleExportWord() {
  if (state.currentModule !== 'observations') return;
  const clinician = state.clinicians.find((c) => c.id === state.selectedClinicianId);
  if (!clinician) { alert('Select a clinician first.'); return; }
  const observations = await storage.getObservations(clinician.id);
  exportClinicianDocx(clinician, observations, state.settings);
}

// --- ITP Module ---

function selectClinicianForItp(id) {
  state.selectedClinicianId = id;
  renderClinicianSelector(state, selectClinicianForItp, onReorderClinicians);
  showItpView();
}

async function showItpView() {
  const clinician = state.clinicians.find((c) => c.id === state.selectedClinicianId);
  if (!clinician) return;
  const semId = state.settings ? (state.settings.id || state.settings.name || 'default') : 'default';
  const itp   = await getItp(clinician.id, semId, clinician, state.settings);
  const container = document.getElementById('view-itp');
  showView('itp');
  renderItpEditor(container, itp, {
    viewMode:   'supervisor',
    clinician,
    semesterId: semId,
    settings:   state.settings,
  }, () => showItpView());
}

// --- SOAP Notes Module ---

function selectClinicianForSoap(id) {
  state.selectedClinicianId = id;
  renderClinicianSelector(state, selectClinicianForSoap, onReorderClinicians);
  showSoapListView();
}

async function showSoapListView() {
  const clinician = state.clinicians.find((c) => c.id === state.selectedClinicianId);
  if (!clinician) return;
  const notes = await getSoapNotesByClinicianId(clinician.id);
  const container = document.getElementById('view-soap');
  showView('soap');
  renderSoapList(container, notes, {
    viewMode: 'supervisor',
    onOpen:   (note) => showSoapEditor(note, clinician),
    onCreate: () => {},   // supervisors don't create notes
    onDelete: async (id) => {
      await deleteSoapNote(id);
      showSoapListView();
    },
  });
}

async function showSoapEditor(note, clinician) {
  const semId = state.settings ? (state.settings.id || state.settings.name || 'default') : 'default';
  const itp   = await getItp(clinician.id, semId, clinician, state.settings);
  const container = document.getElementById('view-soap');
  showView('soap');
  renderSoapEditor(container, note, {
    viewMode: 'supervisor',
    clinician,
    itp,
  }, () => showSoapListView(), (saved) => {});
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
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `clinical-hub-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
    state.settings            = null;
    state.clinicians          = [];
    state.selectedClinicianId = null;
    state.currentModule       = 'observations';
    setActiveModuleTab('observations');
    document.getElementById('clinician-tabs').hidden = true;
    document.getElementById('view-tabs').hidden = true;
    showView('welcome');
  });
}
