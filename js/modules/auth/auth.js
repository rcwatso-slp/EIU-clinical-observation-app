// Authentication module — login/signup UI + user session management
import { auth } from '../../config/firebase-config.js';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { db } from '../../config/firebase-config.js';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { setCurrentUser } from '../../storage/firebase-storage.js';

const googleProvider = new GoogleAuthProvider();

// --- User doc helpers ---

async function getUserDoc(uid) {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

async function createUserDoc(uid, email, role) {
  const ref = doc(db, 'users', uid);
  await setDoc(ref, { uid, email, role, createdAt: new Date().toISOString() });
  return { uid, email, role };
}

export async function getUserRole(uid) {
  const userData = await getUserDoc(uid);
  return userData ? userData.role : null;
}

// --- Sign-out ---

export async function signOutUser() {
  setCurrentUser(null);
  await signOut(auth);
}

// --- Auth state observer ---

export function onAuthReady(callback) {
  return onAuthStateChanged(auth, callback);
}

// --- Auth screen renderer ---

export function renderAuthScreen(container, onSignedIn) {
  container.innerHTML = `
    <div class="auth-screen">
      <div class="auth-card">
        <h1 class="auth-title">EIU Clinical Supervision Hub</h1>
        <p class="auth-subtitle">Sign in to continue</p>

        <div id="auth-error" class="auth-error" hidden></div>

        <div class="auth-tabs">
          <button class="auth-tab active" data-tab="signin">Sign In</button>
          <button class="auth-tab" data-tab="signup">Create Account</button>
        </div>

        <!-- Sign In Form -->
        <form id="form-signin" class="auth-form">
          <div class="form-group">
            <label for="signin-email">Email</label>
            <input id="signin-email" type="email" required autocomplete="email" placeholder="you@example.com">
          </div>
          <div class="form-group">
            <label for="signin-password">Password</label>
            <input id="signin-password" type="password" required autocomplete="current-password" placeholder="••••••••">
          </div>
          <button type="submit" class="btn btn-primary btn-full">Sign In</button>
        </form>

        <!-- Sign Up Form -->
        <form id="form-signup" class="auth-form" hidden>
          <div class="form-group">
            <label for="signup-email">Email</label>
            <input id="signup-email" type="email" required autocomplete="email" placeholder="you@example.com">
          </div>
          <div class="form-group">
            <label for="signup-password">Password</label>
            <input id="signup-password" type="password" required autocomplete="new-password" placeholder="Min 6 characters">
          </div>
          <div class="form-group">
            <label for="signup-role">Account Type</label>
            <select id="signup-role">
              <option value="supervisor">Supervisor</option>
              <option value="student">Student / Clinician</option>
            </select>
          </div>
          <button type="submit" class="btn btn-primary btn-full">Create Account</button>
        </form>

        <div class="auth-divider"><span>or</span></div>
        <button id="btn-google" class="btn btn-google btn-full">
          <svg class="google-icon" viewBox="0 0 24 24" width="18" height="18">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>
      </div>
    </div>
  `;

  const errorEl    = container.querySelector('#auth-error');
  const signinForm = container.querySelector('#form-signin');
  const signupForm = container.querySelector('#form-signup');
  const tabs       = container.querySelectorAll('.auth-tab');

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }
  function clearError() {
    errorEl.hidden = true;
    errorEl.textContent = '';
  }

  // Tab switching
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.toggle('active', t === tab));
      signinForm.hidden = tab.dataset.tab !== 'signin';
      signupForm.hidden = tab.dataset.tab !== 'signup';
      clearError();
    });
  });

  // Sign in
  signinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();
    const email    = signinForm.querySelector('#signin-email').value.trim();
    const password = signinForm.querySelector('#signin-password').value;
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await _handleSignedIn(cred.user, onSignedIn);
    } catch (err) {
      showError(_friendlyError(err.code));
    }
  });

  // Sign up
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();
    const email    = signupForm.querySelector('#signup-email').value.trim();
    const password = signupForm.querySelector('#signup-password').value;
    const role     = signupForm.querySelector('#signup-role').value;
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await createUserDoc(cred.user.uid, email, role);
      await _handleSignedIn(cred.user, onSignedIn, role);
    } catch (err) {
      showError(_friendlyError(err.code));
    }
  });

  // Google
  container.querySelector('#btn-google').addEventListener('click', async () => {
    clearError();
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      // Create user doc if first time
      let userDoc = await getUserDoc(cred.user.uid);
      if (!userDoc) {
        userDoc = await createUserDoc(cred.user.uid, cred.user.email, 'supervisor');
      }
      await _handleSignedIn(cred.user, onSignedIn, userDoc.role);
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        showError(_friendlyError(err.code));
      }
    }
  });
}

async function _handleSignedIn(user, onSignedIn, knownRole) {
  const role = knownRole || (await getUserRole(user.uid));
  if (role === 'supervisor') {
    setCurrentUser(user.uid);
  }
  onSignedIn(user, role);
}

function _friendlyError(code) {
  const map = {
    'auth/invalid-email':             'Please enter a valid email address.',
    'auth/user-not-found':            'No account found with that email.',
    'auth/wrong-password':            'Incorrect password.',
    'auth/invalid-credential':        'Incorrect email or password.',
    'auth/email-already-in-use':      'An account with that email already exists.',
    'auth/weak-password':             'Password must be at least 6 characters.',
    'auth/too-many-requests':         'Too many attempts. Please try again later.',
    'auth/network-request-failed':    'Network error. Check your connection.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}

// --- Sign-out button helper ---

export function renderSignOutButton(container, onSignedOut) {
  const btn = document.createElement('button');
  btn.id = 'btn-signout';
  btn.className = 'btn btn-secondary btn-sm';
  btn.textContent = 'Sign Out';
  btn.addEventListener('click', async () => {
    await signOutUser();
    onSignedOut();
  });
  container.appendChild(btn);
}
