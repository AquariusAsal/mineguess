/**
 * MineGuess – Firebase Konfiguration
 *
 * SETUP (einmalig, kostenlos):
 * 1. Gehe zu https://console.firebase.google.com
 * 2. Neues Projekt erstellen → "MineGuess"
 * 3. Authentication → Sign-in method → Google aktivieren
 * 4. Firestore Database → erstellen → Production mode
 * 5. Projekteinstellungen → "Deine Apps" → Web-App hinzufügen
 * 6. Die Config-Werte unten eintragen
 *
 * FIRESTORE REGELN (Security Rules):
 *   rules_version = '2';
 *   service cloud.firestore {
 *     match /databases/{database}/documents {
 *       match /users/{userId} {
 *         allow read, write: if request.auth != null && request.auth.uid == userId;
 *       }
 *       match /leaderboard/{entry} {
 *         allow read: if true;
 *         allow write: if request.auth != null;
 *       }
 *     }
 *   }
 */

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyDW61bCPxEmqymNKPZdii648yvyi20cmz4",
  authDomain:        "mineguessv1.firebaseapp.com",
  projectId:         "mineguessv1",
  storageBucket:     "mineguessv1.firebasestorage.app",
  messagingSenderId: "123665696444",
  appId:             "1:123665696444:web:389a64caebe4f63d30f2b9"
};

// Auf true setzen wenn Apple Sign-In konfiguriert ist (braucht Apple Developer Account)
const ENABLE_APPLE_SIGNIN = false;

// Auf false setzen um Firebase zu deaktivieren (nur Gast-Modus)
const FIREBASE_ENABLED = FIREBASE_CONFIG.apiKey !== "DEIN_API_KEY";
