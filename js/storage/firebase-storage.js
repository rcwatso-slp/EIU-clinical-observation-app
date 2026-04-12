// Firestore storage — same public interface as indexeddb-storage.js
import { db } from '../config/firebase-config.js';
import {
  doc, getDoc, getDocs, setDoc, deleteDoc, writeBatch,
  collection, query, where,
} from 'firebase/firestore';

// --- Student link helpers (for student role access) ---

// Called by roster when saving a clinician with a studentEmail
export async function linkStudentEmail(clinician) {
  if (!clinician.studentEmail) return;
  if (!currentUid) throw new Error('No authenticated user');
  const email = clinician.studentEmail.toLowerCase().trim();
  await setDoc(doc(db, 'studentLinks', email), {
    supervisorId: currentUid,
    clinicianId:  clinician.id,
    updatedAt:    new Date().toISOString(),
  });
}

// Called on student sign-in to find their supervisor + clinician IDs
export async function getStudentLink(email) {
  const snap = await getDoc(doc(db, 'studentLinks', email.toLowerCase().trim()));
  return snap.exists() ? snap.data() : null;
}

// Read supervisor's data as a student (using supervisor UID directly)
export async function getObservationsAsStudent(supervisorId, clinicianId) {
  const col = collection(db, 'supervisors', supervisorId, 'observations');
  const q   = query(col, where('clinicianId', '==', clinicianId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}

export async function getEvaluationAsStudent(supervisorId, clinicianId, semesterId) {
  const col  = collection(db, 'supervisors', supervisorId, 'evaluations');
  const q    = query(col, where('clinicianId', '==', clinicianId));
  const snap = await getDocs(q);
  const evals = snap.docs.map((d) => d.data());
  return evals.find((e) => e.semesterId === semesterId) || evals[0] || null;
}

export async function getClinicianAsStudent(supervisorId, clinicianId) {
  const snap = await getDoc(doc(db, 'supervisors', supervisorId, 'clinicians', clinicianId));
  return snap.exists() ? snap.data() : null;
}

export async function getSettingsAsStudent(supervisorId) {
  const snap = await getDocs(collection(db, 'supervisors', supervisorId, 'settings'));
  return snap.empty ? null : snap.docs[0].data();
}

// Current authenticated supervisor UID — set by auth module on sign-in
let currentUid = null;

export function setCurrentUser(uid) {
  currentUid = uid;
}

export function getCurrentUid() {
  return currentUid;
}

// --- Path helpers ---

function userCol(name) {
  if (!currentUid) throw new Error('No authenticated user');
  return collection(db, 'supervisors', currentUid, name);
}

function userDoc(name, id) {
  if (!currentUid) throw new Error('No authenticated user');
  return doc(db, 'supervisors', currentUid, name, id);
}

// --- Semester Settings ---

export async function saveSemesterSettings(settings) {
  const id = settings.id || 'default';
  const withId = { ...settings, id };
  await setDoc(userDoc('settings', id), withId);
  return withId;
}

export async function getSemesterSettings() {
  const snap = await getDocs(userCol('settings'));
  if (snap.empty) return null;
  return snap.docs[0].data();
}

// --- Clinicians ---

export async function saveClinician(clinician) {
  await setDoc(userDoc('clinicians', clinician.id), clinician);
  return clinician;
}

export async function getClinician(id) {
  const snap = await getDoc(userDoc('clinicians', id));
  return snap.exists() ? snap.data() : null;
}

export async function getAllClinicians() {
  const snap = await getDocs(userCol('clinicians'));
  return snap.docs.map((d) => d.data());
}

export async function saveClinicianOrder(ids) {
  const settings = await getSemesterSettings();
  const base = settings || { id: 'default' };
  await setDoc(userDoc('settings', base.id), { ...base, clinicianOrder: ids });
}

export async function deleteClinician(id) {
  // Cascade delete observations
  const observations = await getObservations(id);
  if (observations.length > 0) {
    const batch = writeBatch(db);
    for (const obs of observations) {
      batch.delete(userDoc('observations', obs.id));
    }
    await batch.commit();
  }
  // Cascade delete evaluations
  const evals = await _getEvaluationsForClinician(id);
  if (evals.length > 0) {
    const batch = writeBatch(db);
    for (const ev of evals) {
      batch.delete(userDoc('evaluations', ev.id));
    }
    await batch.commit();
  }
  await deleteDoc(userDoc('clinicians', id));
}

// --- Observations ---

export async function saveObservation(clinicianId, observation) {
  const obs = { ...observation, clinicianId };
  await setDoc(userDoc('observations', obs.id), obs);
  return obs;
}

export async function getObservations(clinicianId) {
  const q = query(userCol('observations'), where('clinicianId', '==', clinicianId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}

export async function deleteObservation(clinicianId, observationId) {
  await deleteDoc(userDoc('observations', observationId));
}

// --- Evaluations ---

export async function saveEvaluation(evaluation) {
  await setDoc(userDoc('evaluations', evaluation.id), evaluation);
  return evaluation;
}

export async function getEvaluation(clinicianId, semesterId) {
  const evals = await _getEvaluationsForClinician(clinicianId);
  return evals.find((e) => e.semesterId === semesterId) || null;
}

export async function getAllEvaluations(semesterId) {
  const q = query(userCol('evaluations'), where('semesterId', '==', semesterId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}

async function _getEvaluationsForClinician(clinicianId) {
  const q = query(userCol('evaluations'), where('clinicianId', '==', clinicianId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}

export async function deleteEvaluation(id) {
  await deleteDoc(userDoc('evaluations', id));
}

// --- Data Management (backup / restore) ---

export async function exportAllData() {
  const settings = await getSemesterSettings();
  const clinicians = await getAllClinicians();
  const allObservations = [];
  const allEvaluations = [];
  for (const c of clinicians) {
    allObservations.push(...(await getObservations(c.id)));
    allEvaluations.push(...(await _getEvaluationsForClinician(c.id)));
  }
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    semesterSettings: settings,
    clinicians,
    observations: allObservations,
    evaluations: allEvaluations,
  };
}

export async function importAllData(data) {
  // Use batched writes (max 500 ops per batch)
  const ops = [];
  if (data.semesterSettings) {
    const s = data.semesterSettings;
    ops.push([userDoc('settings', s.id || 'default'), { ...s, id: s.id || 'default' }]);
  }
  for (const c of data.clinicians || []) {
    ops.push([userDoc('clinicians', c.id), c]);
  }
  for (const obs of data.observations || []) {
    ops.push([userDoc('observations', obs.id), obs]);
  }
  for (const ev of data.evaluations || []) {
    ops.push([userDoc('evaluations', ev.id), ev]);
  }

  // Chunk into batches of 499
  for (let i = 0; i < ops.length; i += 499) {
    const chunk = ops.slice(i, i + 499);
    const batch = writeBatch(db);
    for (const [ref, data] of chunk) {
      batch.set(ref, data);
    }
    await batch.commit();
  }
}

// ── Archive helpers ───────────────────────────────────────────────────────────

// Semester names like "Fall 2025" are safe Firestore IDs; only "/" is forbidden.
export function sanitizeSemId(name) {
  return (name || 'unknown').replace(/\//g, '-').trim();
}

function archiveCol(semId, name) {
  if (!currentUid) throw new Error('No authenticated user');
  return collection(db, 'supervisors', currentUid, 'archivedSemesters', semId, name);
}

function archiveDocRef(semId, name, id) {
  if (!currentUid) throw new Error('No authenticated user');
  return doc(db, 'supervisors', currentUid, 'archivedSemesters', semId, name, id);
}

function archiveSemDocRef(semId) {
  if (!currentUid) throw new Error('No authenticated user');
  return doc(db, 'supervisors', currentUid, 'archivedSemesters', semId);
}

// ── Semester archiving ────────────────────────────────────────────────────────

/**
 * Archives the current semester:
 *   1. Copies all current data to archivedSemesters/{semId}/...
 *   2. Writes student history pointers to studentHistory/{email}/semesters/{semId}
 *   3. Deletes all current data and stale student links
 * Returns the semId used as the archive key.
 */
export async function archiveSemester() {
  if (!currentUid) throw new Error('No authenticated user');

  const settings = await getSemesterSettings();
  if (!settings || !settings.name) {
    throw new Error('Set a semester name in Roster settings before archiving.');
  }

  const semId = sanitizeSemId(settings.name);
  const archivedAt = new Date().toISOString();

  // Read all current data (we need the raw refs for efficient deletion)
  const clinicians = await getAllClinicians();
  const [obsSnap, evalSnap, itpSnap, soapSnap, settingsSnap] = await Promise.all([
    getDocs(userCol('observations')),
    getDocs(userCol('evaluations')),
    getDocs(userCol('itps')),
    getDocs(userCol('soapNotes')),
    getDocs(userCol('settings')),
  ]);

  // ── Write phase ────────────────────────────────────────────────────────────
  const writeOps = [];

  // Archive semester settings doc (top-level archivedSemesters/{semId} document)
  writeOps.push({ ref: archiveSemDocRef(semId), data: { ...settings, archivedAt } });

  // Archive clinicians
  for (const c of clinicians) {
    writeOps.push({ ref: archiveDocRef(semId, 'clinicians', c.id), data: c });
  }

  // Archive flat collections (observations, evaluations, itps, soapNotes)
  for (const snap of [obsSnap, evalSnap, itpSnap, soapSnap]) {
    for (const d of snap.docs) {
      const colName = d.ref.parent.id; // e.g. 'observations'
      writeOps.push({ ref: archiveDocRef(semId, colName, d.id), data: d.data() });
    }
  }

  // Student history pointers (one per clinician with a linked student email)
  for (const c of clinicians) {
    if (c.studentEmail) {
      const email = c.studentEmail.toLowerCase().trim();
      writeOps.push({
        ref: doc(db, 'studentHistory', email, 'semesters', semId),
        data: { supervisorId: currentUid, clinicianId: c.id, semesterName: settings.name, archivedAt },
      });
    }
  }

  // Execute writes in chunks (Firestore max 500 ops per batch)
  for (let i = 0; i < writeOps.length; i += 499) {
    const batch = writeBatch(db);
    writeOps.slice(i, i + 499).forEach(({ ref, data }) => batch.set(ref, data));
    await batch.commit();
  }

  // ── Delete phase ──────────────────────────────────────────────────────────
  const deleteRefs = [
    ...settingsSnap.docs.map((d) => d.ref),
    ...clinicians.map((c) => userDoc('clinicians', c.id)),
    ...obsSnap.docs.map((d) => d.ref),
    ...evalSnap.docs.map((d) => d.ref),
    ...itpSnap.docs.map((d) => d.ref),
    ...soapSnap.docs.map((d) => d.ref),
  ];

  // Also delete stale student links so students see "not linked" until re-added
  for (const c of clinicians) {
    if (c.studentEmail) {
      deleteRefs.push(doc(db, 'studentLinks', c.studentEmail.toLowerCase().trim()));
    }
  }

  for (let i = 0; i < deleteRefs.length; i += 499) {
    const batch = writeBatch(db);
    deleteRefs.slice(i, i + 499).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }

  return semId;
}

// ── Semester restore ──────────────────────────────────────────────────────────

/**
 * Restores an archived semester back to the active collections.
 * The archive entry is preserved so it can still be browsed afterward.
 * Any current active data is overwritten.
 */
export async function restoreArchivedSemester(semId) {
  if (!currentUid) throw new Error('No authenticated user');

  const semSnap = await getDoc(archiveSemDocRef(semId));
  if (!semSnap.exists()) throw new Error('Archive not found.');

  // Strip archiving metadata before restoring settings
  const { archivedAt, ...settings } = semSnap.data();

  const [clinSnap, obsSnap, evalSnap, itpSnap, soapSnap] = await Promise.all([
    getDocs(archiveCol(semId, 'clinicians')),
    getDocs(archiveCol(semId, 'observations')),
    getDocs(archiveCol(semId, 'evaluations')),
    getDocs(archiveCol(semId, 'itps')),
    getDocs(archiveCol(semId, 'soapNotes')),
  ]);

  const clinicians = clinSnap.docs.map((d) => d.data());

  const writeOps = [];

  // Restore semester settings
  writeOps.push({ ref: userDoc('settings', settings.id || 'default'), data: settings });

  // Restore clinicians
  clinicians.forEach((c) => writeOps.push({ ref: userDoc('clinicians', c.id), data: c }));

  // Restore flat collections (observations, evaluations, itps, soapNotes)
  for (const snap of [obsSnap, evalSnap, itpSnap, soapSnap]) {
    for (const d of snap.docs) {
      const colName = d.ref.parent.id;
      writeOps.push({ ref: userDoc(colName, d.id), data: d.data() });
    }
  }

  // Restore student links
  for (const c of clinicians) {
    if (c.studentEmail) {
      const email = c.studentEmail.toLowerCase().trim();
      writeOps.push({
        ref: doc(db, 'studentLinks', email),
        data: { supervisorId: currentUid, clinicianId: c.id, updatedAt: new Date().toISOString() },
      });
    }
  }

  // Execute in chunks of 499
  for (let i = 0; i < writeOps.length; i += 499) {
    const batch = writeBatch(db);
    writeOps.slice(i, i + 499).forEach(({ ref, data }) => batch.set(ref, data));
    await batch.commit();
  }
}

// ── Archive reads (supervisor) ────────────────────────────────────────────────

export async function getArchivedSemesters() {
  if (!currentUid) return [];
  const snap = await getDocs(collection(db, 'supervisors', currentUid, 'archivedSemesters'));
  return snap.docs
    .map((d) => d.data())
    .sort((a, b) => (b.archivedAt || '').localeCompare(a.archivedAt || ''));
}

export async function getArchivedClinicians(semId) {
  const snap = await getDocs(archiveCol(semId, 'clinicians'));
  return snap.docs.map((d) => d.data());
}

export async function getArchivedObservations(semId, clinicianId) {
  const q = query(archiveCol(semId, 'observations'), where('clinicianId', '==', clinicianId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}

export async function getArchivedEvaluation(semId, clinicianId) {
  const q = query(archiveCol(semId, 'evaluations'), where('clinicianId', '==', clinicianId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data())[0] || null;
}

export async function getArchivedSoapNotes(semId, clinicianId) {
  const q = query(archiveCol(semId, 'soapNotes'), where('clinicianId', '==', clinicianId));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => d.data())
    .sort((a, b) => new Date(b.sessionDate) - new Date(a.sessionDate));
}

export async function getArchivedItp(semId, clinicianId) {
  const snap = await getDoc(archiveDocRef(semId, 'itps', `${clinicianId}_${semId}`));
  return snap.exists() ? snap.data() : null;
}

// ── Student history ───────────────────────────────────────────────────────────

export async function getStudentSemesterHistory(email) {
  const snap = await getDocs(
    collection(db, 'studentHistory', email.toLowerCase().trim(), 'semesters')
  );
  return snap.docs
    .map((d) => d.data())
    .sort((a, b) => (b.archivedAt || '').localeCompare(a.archivedAt || ''));
}

// ── Archive reads (student, explicit supervisorId) ────────────────────────────

export async function getArchivedObservationsAsStudent(supervisorId, semId, clinicianId) {
  const q = query(
    collection(db, 'supervisors', supervisorId, 'archivedSemesters', semId, 'observations'),
    where('clinicianId', '==', clinicianId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}

export async function getArchivedEvaluationAsStudent(supervisorId, semId, clinicianId) {
  const q = query(
    collection(db, 'supervisors', supervisorId, 'archivedSemesters', semId, 'evaluations'),
    where('clinicianId', '==', clinicianId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data())[0] || null;
}

export async function getArchivedSoapNotesAsStudent(supervisorId, semId, clinicianId) {
  const q = query(
    collection(db, 'supervisors', supervisorId, 'archivedSemesters', semId, 'soapNotes'),
    where('clinicianId', '==', clinicianId)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => d.data())
    .sort((a, b) => new Date(b.sessionDate) - new Date(a.sessionDate));
}

export async function getArchivedItpAsStudent(supervisorId, semId, clinicianId) {
  const snap = await getDoc(
    doc(db, 'supervisors', supervisorId, 'archivedSemesters', semId, 'itps', `${clinicianId}_${semId}`)
  );
  return snap.exists() ? snap.data() : null;
}

export async function clearAllData() {
  const collections = ['settings', 'clinicians', 'observations', 'evaluations'];
  for (const name of collections) {
    const snap = await getDocs(userCol(name));
    if (snap.empty) continue;
    // Delete in batches of 499
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += 499) {
      const batch = writeBatch(db);
      docs.slice(i, i + 499).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
}
