import { onUserChanged, recordPlay } from "./firebase.js";

// Iedere nieuwe gamesessie telt mee. pageshow werkt ook wanneer de browser
// een pagina uit de back/forward-cache terughaalt.
const gameId = window.location.pathname
  .split("/")
  .pop()
  .replace(/\.html?$/i, "")
  .toLowerCase();

let currentUser = null;
let countedForThisActivation = false;

onUserChanged((user) => {
  currentUser = user;
});

function waitForGoogleUser(timeout = 8000) {
  if (currentUser) return Promise.resolve(currentUser);

  return new Promise((resolve) => {
    let finished = false;
    let unsubscribe = () => {};
    const finish = (user) => {
      if (finished) return;
      finished = true;
      unsubscribe();
      resolve(user);
    };

    const stopListening = onUserChanged((user) => {
      if (user) finish(user);
    });
    unsubscribe = stopListening;
    if (finished) unsubscribe();
    window.setTimeout(() => finish(null), timeout);
  });
}

async function countCurrentPlay() {
  if (!gameId || countedForThisActivation) return;
  countedForThisActivation = true;

  const user = await waitForGoogleUser();
  if (!user) {
    countedForThisActivation = false;
    console.warn("Play niet geteld: log eerst in met Google.");
    return;
  }

  try {
    await recordPlay(gameId);
  } catch (error) {
    countedForThisActivation = false;
    console.error("Play kon niet worden opgeslagen:", error);
  }
}

// Games kunnen dit ook aanroepen bij een echte restart of een nieuwe ronde.
window.latuRecordPlay = () => recordPlay(gameId);

window.addEventListener("pageshow", countCurrentPlay);
window.addEventListener("pagehide", () => {
  // Een pagina die uit de back/forward-cache terugkomt is een nieuwe sessie.
  countedForThisActivation = false;
});
