// Firestore CRUD for Initial Treatment Plans (ITPs).
// One ITP per clinician per semester.
// Supervisor functions use getCurrentUid(); student functions take explicit supervisorId.
import { db } from '../../config/firebase-config.js';
import { getCurrentUid } from '../../storage/firebase-storage.js';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// --- Path helpers ---

export function itpDocId(clinicianId, semesterId) {
  return `${clinicianId}_${semesterId}`;
}

function myItpDoc(clinicianId, semesterId) {
  return doc(db, 'supervisors', getCurrentUid(), 'itps', itpDocId(clinicianId, semesterId));
}

function supItpDoc(supervisorId, clinicianId, semesterId) {
  return doc(db, 'supervisors', supervisorId, 'itps', itpDocId(clinicianId, semesterId));
}

// --- Empty ITP factory ---

export function createEmptyItp(clinicianId, semesterId, clinician, settings) {
  return {
    id: itpDocId(clinicianId, semesterId),
    clinicianId,
    semesterId,
    header: {
      clinicianName:  clinician?.name           || '',
      clientDisplay:  clinician?.clientInitials  || '',
      supervisorName: settings?.supervisor       || '',
      semester:       settings?.name             || '',
      diagnosis:      '',
      serviceType:    [
        clinician?.sessionDays,
        clinician?.sessionTime,
        clinician?.sessionLengthMin ? clinician.sessionLengthMin + ' min' : '',
      ].filter(Boolean).join(' '),
    },
    functionalOutcomeGoals: [
      {
        id:         _newId(),
        goal:       '',
        objectives: [{ id: _newId(), text: '', accuracy: '', cueing: '' }],
      },
    ],
    ebpArticles: [],
    completed:   false,
    createdAt:   new Date().toISOString(),
    updatedAt:   new Date().toISOString(),
  };
}

// --- Supervisor CRUD ---

export async function saveItp(itp) {
  itp.updatedAt = new Date().toISOString();
  await setDoc(myItpDoc(itp.clinicianId, itp.semesterId), itp);
  return itp;
}

export async function getItp(clinicianId, semesterId, clinician, settings) {
  const snap = await getDoc(myItpDoc(clinicianId, semesterId));
  return snap.exists() ? snap.data() : createEmptyItp(clinicianId, semesterId, clinician, settings);
}

// --- Student CRUD (explicit supervisorId) ---

export async function saveItpAsStudent(itp, supervisorId) {
  itp.updatedAt = new Date().toISOString();
  await setDoc(supItpDoc(supervisorId, itp.clinicianId, itp.semesterId), itp);
  return itp;
}

export async function getItpAsStudent(supervisorId, clinicianId, semesterId, clinician, settings) {
  const snap = await getDoc(supItpDoc(supervisorId, clinicianId, semesterId));
  return snap.exists() ? snap.data() : createEmptyItp(clinicianId, semesterId, clinician, settings);
}

// --- Helpers ---

function _newId() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}
