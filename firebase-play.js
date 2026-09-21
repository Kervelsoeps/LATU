import { recordPlay } from "./firebase.js";

// Een play wordt geteld wanneer de gamepagina echt geladen is.
// Dit is betrouwbaarder dan tellen op de vorige pagina, waar navigatie
// de Firebase-transactie kan afbreken.
const gameId = window.location.pathname
  .split("/")
  .pop()
  .replace(/\.html?$/i, "")
  .toLowerCase();

if (gameId) {
  recordPlay(gameId).catch((error) =>
    console.error("Play kon niet worden opgeslagen:", error),
  );
}
