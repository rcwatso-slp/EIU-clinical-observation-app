import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyC7eEYZJgYCq5tnfL_6RxqaB0LSQtszPPw",
  authDomain: "eiu-clinical-hub.firebaseapp.com",
  projectId: "eiu-clinical-hub",
  storageBucket: "eiu-clinical-hub.firebasestorage.app",
  messagingSenderId: "661908109428",
  appId: "1:661908109428:web:50d1425be77325bd30f921"
};

const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db   = getFirestore(firebaseApp);
