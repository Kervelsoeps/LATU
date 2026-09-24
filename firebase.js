import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  doc,
  getDoc,
  getFirestore,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCy1_gGJPEuN71gpyorq39cJyn1OCzIL-4",
  authDomain: "latu-55675.firebaseapp.com",
  projectId: "latu-55675",
  databaseURL: "https://latu-55675-default-rtdb.europe-west1.firebasedatabase.app",
  storageBucket: "latu-55675.firebasestorage.app",
  messagingSenderId: "89442182773",
  appId: "1:89442182773:web:9617a702cbce571a197a3c",
  measurementId: "G-CGFNF48V83",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

const authReady = setPersistence(auth, browserLocalPersistence).then(
  () =>
    new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe();
        resolve(user);
      });
    }),
);

function statsRef(gameId) {
  return doc(db, "gameStats", gameId);
}

function likeRef(gameId, uid) {
  return doc(db, "gameLikes", gameId, "users", uid);
}

export async function getGameStats(gameId) {
  await authReady;
  const user = auth.currentUser;
  const statsSnapshot = await getDoc(statsRef(gameId));
  const likeSnapshot = user ? await getDoc(likeRef(gameId, user.uid)) : null;
  const data = statsSnapshot.exists() ? statsSnapshot.data() : {};
  return {
    likesCount: Number(data.likesCount || 0),
    playsCount: Number(data.playsCount || 0),
    liked: Boolean(likeSnapshot?.exists()),
  };
}

export async function recordPlay(gameId) {
  await authReady;
  const user = auth.currentUser;
  if (!user) return false;
  await runTransaction(db, async (transaction) => {
    const reference = statsRef(gameId);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) {
      transaction.set(reference, { likesCount: 0, playsCount: 1 });
      return;
    }
    const data = snapshot.data();
    transaction.update(reference, {
      likesCount: Number(data.likesCount || 0),
      playsCount: Number(data.playsCount || 0) + 1,
    });
  });
  return true;
}

export async function toggleLike(gameId) {
  await authReady;
  const user = auth.currentUser;
  if (!user) throw new Error("Je moet ingelogd zijn om te liken.");
  return runTransaction(db, async (transaction) => {
    const reference = statsRef(gameId);
    const userLikeReference = likeRef(gameId, user.uid);
    const [statsSnapshot, likeSnapshot] = await Promise.all([
      transaction.get(reference),
      transaction.get(userLikeReference),
    ]);
    const data = statsSnapshot.exists() ? statsSnapshot.data() : {};
    const likesCount = Number(data.likesCount || 0);
    const playsCount = Number(data.playsCount || 0);

    if (likeSnapshot.exists()) {
      transaction.delete(userLikeReference);
      transaction.set(reference, { likesCount: Math.max(0, likesCount - 1), playsCount });
      return false;
    }

    transaction.set(userLikeReference, { createdAt: new Date() });
    transaction.set(reference, { likesCount: likesCount + 1, playsCount });
    return true;
  });
}

export function onUserChanged(callback) {
  return onAuthStateChanged(auth, callback);
}

export function signInWithGoogle() {
  return authReady.then(() => signInWithPopup(auth, googleProvider));
}

export function signOutUser() {
  return signOut(auth);
}

window.latuFirebase = {
  getGameStats,
  recordPlay,
  toggleLike,
  onUserChanged,
  signInWithGoogle,
  signOutUser,
};
window.dispatchEvent(new Event("latu-firebase-ready"));

export { app };
