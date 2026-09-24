import {
  getGameStats,
  onUserChanged,
  recordPlay,
  signInWithGoogle,
  signOutUser,
  toggleLike,
} from "./firebase.js";

let currentUser = null;
let refreshCardStats = () => {};

const authLabels = {
  nl: { signIn: "Inloggen met Google", signOut: "Uitloggen" },
  en: { signIn: "Sign in with Google", signOut: "Sign out" },
  fr: { signIn: "Se connecter avec Google", signOut: "Se déconnecter" },
};

function updateAuthLabel(button) {
  const language = document.documentElement.lang?.slice(0, 2) || "nl";
  const labels = authLabels[language] || authLabels.nl;
  button.textContent = currentUser ? labels.signOut : labels.signIn;
  button.title = button.textContent;
}

function setupAuthButton() {
  const header = document.querySelector(".site-header");
  if (!header || document.querySelector(".auth-control")) return;

  const control = document.createElement("div");
  control.className = "auth-control";
  const button = document.createElement("button");
  button.className = "google-login";
  button.type = "button";
  control.append(button);
  header.append(control);

  onUserChanged((user) => {
    currentUser = user;
    updateAuthLabel(button);
    button.classList.toggle("is-signed-in", Boolean(user));
    refreshCardStats();
  });

  document.querySelector("#language-select")?.addEventListener("change", () => {
    updateAuthLabel(button);
  });

  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      if (currentUser) await signOutUser();
      else await signInWithGoogle();
    } catch (error) {
      console.error("Google-login mislukt:", error);
      alert("Inloggen met Google is niet gelukt. Controleer de Firebase-instellingen.");
    } finally {
      button.disabled = false;
    }
  });
}

const getGameId = (card) => {
  const filename = card.getAttribute("href").split("/").pop() || "game";
  return filename.replace(/\.html?$/i, "").toLowerCase();
};

const playHandoffKey = (gameId) => `latu-play-counted:${gameId}`;

function rememberCountedPlay(gameId) {
  try {
    sessionStorage.setItem(playHandoffKey(gameId), String(Date.now()));
  } catch (error) {
    console.warn("Play-doorgifte kon niet worden voorbereid:", error);
  }
}

async function navigateToGame(event) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }

  const link = event.currentTarget;
  if (link.dataset.playPending === "true") {
    event.preventDefault();
    return;
  }

  event.preventDefault();
  link.dataset.playPending = "true";
  link.setAttribute("aria-busy", "true");

  const gameId = getGameId(link);
  try {
    // Wacht op Firebase voordat de browser de gamepagina opent.
    if (await recordPlay(gameId)) rememberCountedPlay(gameId);
  } catch (error) {
    console.error("Play kon niet worden opgeslagen vóór het openen van de game:", error);
  }

  window.location.assign(link.href);
}

function setupGameNavigation() {
  document.querySelectorAll(".card, .recommended-play").forEach((link) => {
    link.addEventListener("click", navigateToGame);
  });
}

function setupFirebaseCards() {
  refreshCardStats = () => {
    document.querySelectorAll(".card").forEach((card) => {
      const stats = card.querySelector(".game-stats");
      const likeButton = card.querySelector(".game-like");
      if (!stats || !likeButton) return;
      const gameId = getGameId(card);
      getGameStats(gameId)
        .then(({ likesCount, playsCount, liked }) => {
          stats.textContent = `♥ ${likesCount} · ▶ ${playsCount}`;
          likeButton.textContent = liked ? "♥" : "♡";
          likeButton.classList.toggle("is-liked", liked);
        })
        .catch((error) => console.error("Firebase stats konden niet laden:", error));
    });
  };

  document.querySelectorAll(".card").forEach((card) => {
    const gameId = getGameId(card);
    const meta = card.querySelector(".card-meta");
    if (!meta || meta.querySelector(".game-stats")) return;

    const stats = document.createElement("span");
    stats.className = "game-stats";
    stats.textContent = "♥ 0 · ▶ 0";

    const likeButton = document.createElement("button");
    likeButton.className = "game-like";
    likeButton.type = "button";
    likeButton.textContent = "♡";
    likeButton.title = "Log in met Google om te liken";
    likeButton.setAttribute("aria-label", "Game liken");

    meta.append(stats, likeButton);

    getGameStats(gameId)
      .then(({ likesCount, playsCount, liked }) => {
        stats.textContent = `♥ ${likesCount} · ▶ ${playsCount}`;
        likeButton.textContent = liked ? "♥" : "♡";
        likeButton.classList.toggle("is-liked", liked);
      })
      .catch((error) => console.error("Firebase stats konden niet laden:", error));

    likeButton.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      likeButton.disabled = true;
      try {
        if (!currentUser) await signInWithGoogle();
        const liked = await toggleLike(gameId);
        const latest = await getGameStats(gameId);
        stats.textContent = `♥ ${latest.likesCount} · ▶ ${latest.playsCount}`;
        likeButton.textContent = liked ? "♥" : "♡";
        likeButton.classList.toggle("is-liked", liked);
      } catch (error) {
        console.error("Like kon niet worden opgeslagen:", error);
      } finally {
        likeButton.disabled = false;
      }
    });

  });

  setupGameNavigation();

  // pageshow wordt ook uitgevoerd wanneer index.html uit de bfcache terugkomt.
  window.addEventListener("pageshow", refreshCardStats);
}

setupAuthButton();
if (window.latuFirebase) setupFirebaseCards();
else window.addEventListener("latu-firebase-ready", setupFirebaseCards, { once: true });
