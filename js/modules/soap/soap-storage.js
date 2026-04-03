// Firestore CRUD for SOAP session notes.
// Supervisor functions use getCurrentUid().
// Student functions take an explicit supervisorId (from studentLink).
import { db } from '../../config/firebase-config.js';
import { getCurrentUid } from '../../storage/firebase-storage.js';
import {
  doc, getDoc, getDocs, setDoc, deleteDoc,
  collection, query, where,
} from 'firebase/firestore';

// --- Path helpers ---

function supCol(supervisorId) {
  return collection(db, 'supervisors', supervisorId, 'soapNotes');
}

function supDoc(supervisorId, id) {
  return doc(db, 'supervisors', supervisorId, 'soapNotes', id);
}

function myCol() { return supCol(getCurrentUid()); }
function myDoc(id) { return supDoc(getCurrentUid(), id); }

// --- Empty note factory ---

export function createEmptyNote(clinicianId, sessionNumber, sessionDate) {
  const { uuid } = _uuid();
  return {
    id: uuid(),
    clinicianId,
    sessionDate: sessionDate || new Date().toISOString().slice(0, 10),
    sessionNumber: sessionNumber || 1,
    planStatus: 'draft',   // draft | submitted | reviewed | complete
    soapStatus: 'draft',
    plan: {
      longTermGoal: '',
      objectives: [],    // [{id, objectiveText, cueingLevel, condition, criterion, notes}]
      methods: '',
      materials: '',
      dataCollectionPlan: '',
    },
    soap: {
      subjective: '',
      objectiveNarrative: '',
      objectiveData: [],  // [{id, target, trials, correct, accuracy, cueing}]
      assessment: '',
      soapPlan: '',
    },
    review: {
      fieldEdits: {},    // { [fieldName]: {originalText, supervisorText, acceptedHunks} }
      objectiveChanges: {}, // { [objId]: {action, supervisorVersion, accepted} }
      dataRowChanges: {},   // { [rowId]: {action, supervisorVersion, accepted} }
      comments: [],      // [{id, section, tag, text, createdAt, readByStudent}]
      reviewedAt: null,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Lazy uuid import to avoid circular deps
function _uuid() {
  return { uuid: () => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) };
}

export function newUuid() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

// --- Supervisor CRUD ---

export async function saveSoapNote(note) {
  note.updatedAt = new Date().toISOString();
  await setDoc(myDoc(note.id), note);
  return note;
}

export async function getSoapNote(id) {
  const snap = await getDoc(myDoc(id));
  return snap.exists() ? snap.data() : null;
}

export async function getSoapNotesByClinicianId(clinicianId) {
  const q = query(myCol(), where('clinicianId', '==', clinicianId));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => d.data())
    .sort((a, b) => new Date(b.sessionDate) - new Date(a.sessionDate));
}

export async function deleteSoapNote(id) {
  await deleteDoc(myDoc(id));
}

// --- Student CRUD (explicit supervisorId) ---

export async function saveSoapNoteAsStudent(note, supervisorId) {
  note.updatedAt = new Date().toISOString();
  await setDoc(supDoc(supervisorId, note.id), note);
  return note;
}

export async function getSoapNoteAsStudent(supervisorId, id) {
  const snap = await getDoc(supDoc(supervisorId, id));
  return snap.exists() ? snap.data() : null;
}

export async function getSoapNotesByClinicianAsStudent(supervisorId, clinicianId) {
  const q = query(supCol(supervisorId), where('clinicianId', '==', clinicianId));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => d.data())
    .sort((a, b) => new Date(b.sessionDate) - new Date(a.sessionDate));
}
