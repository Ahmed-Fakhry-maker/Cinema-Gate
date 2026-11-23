// Import the functions you need from the SDKs you need
import { initializeApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import { getAuth } from 'firebase/auth';

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
export const firebaseConfig = {
  apiKey: "AIzaSyDW3cO_wUg43e8ZUUZqy_uB0ylCxw-_OGQ",
  authDomain: "cinema-gate-a0d5f.firebaseapp.com",
  projectId: "cinema-gate-a0d5f",
  storageBucket: "cinema-gate-a0d5f.firebasestorage.app",
  messagingSenderId: "806777671309",
  appId: "1:806777671309:web:558812ce9f4717d4db9cc4",
  measurementId: "G-X4SZ0LC16G"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(app);

let analytics: ReturnType<typeof getAnalytics> | null = null;
if (typeof window !== 'undefined') {
  try {
    analytics = getAnalytics(app);
  } catch {
    // Analytics is optional or unsupported in this environment
  }
}
export { analytics };
