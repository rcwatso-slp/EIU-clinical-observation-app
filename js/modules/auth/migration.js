// One-time IndexedDB → Firestore migration
// Reads from local IndexedDB, writes to Firestore under the current user.
import * as idb from '../../storage/indexeddb-storage.js';
import * as fb  from '../../storage/firebase-storage.js';

const MIGRATION_KEY = 'eiu-hub-migrated';

export function hasMigrated() {
  return localStorage.getItem(MIGRATION_KEY) === 'true';
}

export function markMigrated() {
  localStorage.setItem(MIGRATION_KEY, 'true');
}

// Returns true if IndexedDB has any data worth migrating
export async function hasIndexedDbData() {
  try {
    const clinicians = await idb.getAllClinicians();
    return clinicians.length > 0;
  } catch {
    return false;
  }
}

// Runs the migration: reads all IndexedDB data and writes it to Firestore.
// onProgress(message) is called with status updates.
export async function runMigration(onProgress) {
  onProgress('Reading local data…');
  const data = await idb.exportAllData();

  const clinicianCount  = (data.clinicians || []).length;
  const obsCount        = (data.observations || []).length;
  const evalCount       = (data.evaluations || []).length;

  if (clinicianCount === 0) {
    onProgress('No data found in local storage. Nothing to migrate.');
    return { clinicianCount, obsCount, evalCount };
  }

  onProgress(`Found ${clinicianCount} clinician(s), ${obsCount} observation(s), ${evalCount} evaluation(s). Uploading…`);
  await fb.importAllData(data);

  onProgress('Migration complete.');
  return { clinicianCount, obsCount, evalCount };
}

// Renders the migration banner inside the given container element.
// onComplete() is called when the user dismisses the banner (with or without migrating).
export function renderMigrationBanner(container, onComplete) {
  container.innerHTML = `
    <div class="migration-banner">
      <div class="migration-card">
        <h2 class="migration-title">Welcome back!</h2>
        <p class="migration-body">
          It looks like you have existing data stored locally on this device (from before the
          cloud sync upgrade). Would you like to upload it to your account so it's available
          everywhere?
        </p>
        <div id="migration-status" class="migration-status" hidden></div>
        <div class="migration-actions">
          <button id="btn-migrate" class="btn btn-primary">Upload My Data</button>
          <button id="btn-skip-migrate" class="btn btn-secondary">Skip — Start Fresh</button>
        </div>
      </div>
    </div>
  `;

  const statusEl  = container.querySelector('#migration-status');
  const migrateBtn = container.querySelector('#btn-migrate');
  const skipBtn   = container.querySelector('#btn-skip-migrate');

  function setStatus(msg, isError = false) {
    statusEl.textContent = msg;
    statusEl.hidden = false;
    statusEl.className = `migration-status ${isError ? 'migration-status-error' : ''}`;
  }

  migrateBtn.addEventListener('click', async () => {
    migrateBtn.disabled = true;
    skipBtn.disabled = true;
    try {
      const result = await runMigration(setStatus);
      setStatus(
        `Done! Uploaded ${result.clinicianCount} clinician(s), ` +
        `${result.obsCount} observation(s), ${result.evalCount} evaluation(s).`
      );
      markMigrated();
      setTimeout(onComplete, 1500);
    } catch (err) {
      setStatus(`Migration failed: ${err.message}`, true);
      migrateBtn.disabled = false;
      skipBtn.disabled = false;
    }
  });

  skipBtn.addEventListener('click', () => {
    markMigrated();
    onComplete();
  });
}
