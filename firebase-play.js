import { recordPlay } from "./firebase.js";

// Iedere nieuwe gamesessie telt mee. pageshow werkt ook wanneer de browser
// een pagina uit de back/forward-cache terughaalt.
const gameId = window.location.pathname
  .split("/")
  .pop()
  .replace(/\.html?$/i, "")
  .toLowerCase();

window.addEventListener("pageshow", () => {
  if (!gameId) return;
  recordPlay(gameId).catch((error) =>
    console.error("Play kon niet worden opgeslagen:", error),
  );
});
