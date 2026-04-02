// Storage shim — re-exports the active storage backend.
// All app modules import from this file; swap this one line to change backends.
export * from './firebase-storage.js';
