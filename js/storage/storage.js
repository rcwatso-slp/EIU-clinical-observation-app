// Phase 1: IndexedDB storage implementation
// Phase 2: swap this file for graph-api-storage.js (same exports)

const DB_NAME = 'clinical-observation-app';
const DB_VERSION = 1;

let dbPromise = null;

function getDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains('semesterSettings')) {
        db.createObjectStore('semesterSettings', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('clinicians')) {
        db.createObjectStore('clinicians', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('observations')) {
        const store = db.createObjectStore('observations', { keyPath: 'id' });
        store.createIndex('clinicianId', 'clinicianId', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function tx(storeName, mode = 'readonly') {
  return getDB().then((db) => {
    const transaction = db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  });
}

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// --- Semester Settings ---

export async function saveSemesterSettings(settings) {
  const store = await tx('semesterSettings', 'readwrite');
  return promisify(store.put(settings));
}

export async function getSemesterSettings() {
  const store = await tx('semesterSettings');
  const all = await promisify(store.getAll());
  return all.length > 0 ? all[0] : null;
}

// --- Clinicians ---

export async function saveClinician(clinician) {
  const store = await tx('clinicians', 'readwrite');
  return promisify(store.put(clinician));
}

export async function getClinician(id) {
  const store = await tx('clinicians');
  return promisify(store.get(id));
}

export async function getAllClinicians() {
  const store = await tx('clinicians');
  return promisify(store.getAll());
}

export async function deleteClinician(id) {
  // Delete all observations for this clinician first
  const observations = await getObservations(id);
  if (observations.length > 0) {
    const store = await tx('observations', 'readwrite');
    for (const obs of observations) {
      store.delete(obs.id);
    }
  }
  // Delete the clinician
  const store = await tx('clinicians', 'readwrite');
  return promisify(store.delete(id));
}

// --- Observations ---

export async function saveObservation(clinicianId, observation) {
  const obs = { ...observation, clinicianId };
  const store = await tx('observations', 'readwrite');
  return promisify(store.put(obs));
}

export async function getObservations(clinicianId) {
  const store = await tx('observations');
  const index = store.index('clinicianId');
  return promisify(index.getAll(clinicianId));
}

export async function deleteObservation(clinicianId, observationId) {
  const store = await tx('observations', 'readwrite');
  return promisify(store.delete(observationId));
}

// --- Data Management (backup/restore) ---

export async function exportAllData() {
  const settings = await getSemesterSettings();
  const clinicians = await getAllClinicians();
  const allObservations = [];
  for (const c of clinicians) {
    const obs = await getObservations(c.id);
    allObservations.push(...obs);
  }
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    semesterSettings: settings,
    clinicians,
    observations: allObservations,
  };
}

export async function importAllData(data) {
  if (data.semesterSettings) {
    await saveSemesterSettings(data.semesterSettings);
  }
  for (const c of data.clinicians || []) {
    await saveClinician(c);
  }
  for (const obs of data.observations || []) {
    const store = await tx('observations', 'readwrite');
    await promisify(store.put(obs));
  }
}

export async function clearAllData() {
  const db = await getDB();
  const storeNames = ['semesterSettings', 'clinicians', 'observations'];
  const transaction = db.transaction(storeNames, 'readwrite');
  for (const name of storeNames) {
    transaction.objectStore(name).clear();
  }
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}
