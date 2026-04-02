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
