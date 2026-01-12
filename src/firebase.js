// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCwjwlXzxCfcbnFYqaOmihAoi72Gk9SLJ8",
  authDomain: "devchat-ee2cf.firebaseapp.com",
  projectId: "devchat-ee2cf",
  storageBucket: "devchat-ee2cf.firebasestorage.app",
  messagingSenderId: "51487699356",
  appId: "1:51487699356:web:81344e11dd55398e469859"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export the Authentication and Database services so we can use them in other files
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);