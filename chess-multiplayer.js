import { app } from "./firebase.js";
import {
  get,
  getDatabase,
  onDisconnect,
  onValue,
  ref,
  remove,
  runTransaction,
  update,
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

const database = getDatabase(app);
const roomRoot = "chessRooms";
const PRESENCE_TIMEOUT_MS = 30000;
const PRESENCE_INTERVAL_MS = 10000;
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const createButton = document.getElementById("createChessRoomButton");
const joinButton = document.getElementById("joinChessRoomButton");
const roomInput = document.getElementById("chessRoomCodeInput");
const roomInfo = document.getElementById("chessRoomInfo");
const roomCodeLabel = document.getElementById("chessRoomCodeLabel");
const copyButton = document.getElementById("copyChessRoomButton");
const leaveButton = document.getElementById("leaveChessRoomButton");
const roomStatus = document.getElementById("chessRoomStatus");
const message = document.getElementById("chessMultiplayerMessage");

let roomCode = "";
let playerId = "";
let role = "";
let playerReference = null;
let roomReference = null;
let roomData = null;
let stopListening = null;
let presenceTimer = null;
let configuredColor = null;

function createPlayerId() {
  if (crypto.randomUUID) return crypto.randomUUID().replaceAll("-", "");
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

function createRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

function roomPath(code) {
  return ref(database, `${roomRoot}/${code}`);
}

function initialGame() {
  return { fen: START_FEN, pgn: "", turn: "w", moveNumber: 0, lastMove: null };
}

function playerData(color) {
  return { connected: true, ready: false, color, lastSeenAt: Date.now() };
}

function activePlayers(players = {}, hostId = "") {
  const cutoff = Date.now() - PRESENCE_TIMEOUT_MS;
  return Object.entries(players).filter(([id, player]) => {
    if (player?.connected !== true) return false;
    // Een host uit een oudere room heeft mogelijk nog geen heartbeatveld.
    if (id === hostId && !player.lastSeenAt) return true;
    return Number(player.lastSeenAt || 0) >= cutoff;
  });
}

function setMessage(text) {
  message.textContent = text;
}

function readableFirebaseError(error) {
  if (error?.code === "PERMISSION_DENIED" || error?.code === "permission-denied") {
    return "Firebase weigert deze room. Publiceer database.rules.json opnieuw voor de Realtime Database.";
  }
  if (error?.code === "NETWORK_ERROR") {
    return "De verbinding met Firebase is verbroken. Controleer je internetverbinding.";
  }
  return error?.message || "onbekende fout";
}

function setBusy(busy) {
  const active = Boolean(roomCode);
  createButton.disabled = busy || active;
  joinButton.disabled = busy || active;
  roomInput.disabled = busy || active;
}

function updateRoomControls() {
  const players = activePlayers(roomData?.players, roomData?.hostId);

  roomInfo.classList.toggle("visible", Boolean(roomCode));
  roomCodeLabel.textContent = roomCode;
  leaveButton.hidden = !roomCode;
  createButton.disabled = Boolean(roomCode);
  joinButton.disabled = Boolean(roomCode);
  roomInput.disabled = Boolean(roomCode);

  if (!roomCode) {
    roomStatus.textContent = "Nog geen multiplayer-room actief.";
  } else if (roomData?.status === "playing") {
    roomStatus.textContent = `Je speelt met ${configuredColor === "w" ? "wit" : "zwart"}.`;
  } else if (players.length < 2) {
    roomStatus.textContent = "Deel de code en wacht op de tweede speler.";
  } else {
    roomStatus.textContent = "Tegenstander gevonden. De match start automatisch.";
  }
}

function applyRoomGame(data) {
  if (!data?.game?.fen || !window.chessGame) return;
  window.chessGame.applyRemoteState(data.game.fen);
}

function handleRoomSnapshot(snapshot) {
  roomData = snapshot.val();
  if (!roomData) {
    setMessage("De room bestaat niet meer.");
    cleanupRoom(true);
    return;
  }

  const localPlayer = roomData.players?.[playerId];
  if (localPlayer?.color && localPlayer.color !== configuredColor) {
    configuredColor = localPlayer.color;
    window.chessGame.configureMultiplayer(true, {
      color: configuredColor,
      onMove: publishMove,
      onReset: requestRematch,
    });
  }

  updateRoomControls();
  applyRoomGame(roomData);
  maybeStartGame(roomData);
}

function subscribeToRoom() {
  stopListening?.();
  stopListening = onValue(roomReference, handleRoomSnapshot, (error) => {
    console.error("Chess-room kon niet worden gelezen:", error);
    setMessage("De room kon niet worden geladen. Controleer de database-regels.");
  });
}

async function registerPresence() {
  await onDisconnect(playerReference).update({ connected: false, ready: false });
  await update(playerReference, { connected: true, lastSeenAt: Date.now() });
  if (presenceTimer) window.clearInterval(presenceTimer);
  presenceTimer = window.setInterval(() => {
    update(playerReference, { connected: true, lastSeenAt: Date.now() }).catch((error) => {
      console.error("Chess-presence kon niet worden bijgewerkt:", error);
    });
  }, PRESENCE_INTERVAL_MS);
}

function publishMove({ from, to, promotion = "q", previousFen }) {
  if (!roomReference || !roomData || roomData.status !== "playing") return;

  runTransaction(roomReference, (current) => {
    if (!current || current.status !== "playing") return;
    const local = current.players?.[playerId];
    const currentGame = current.game || initialGame();
    if (!local || local.color !== currentGame.turn || currentGame.fen !== previousFen) return;

    const nextGame = new window.Chess(currentGame.fen);
    const move = nextGame.move({ from, to, promotion });
    if (!move) return;

    return {
      ...current,
      game: {
        fen: nextGame.fen(),
        pgn: nextGame.pgn(),
        turn: nextGame.turn(),
        moveNumber: Number(currentGame.moveNumber || 0) + 1,
        lastMove: { from, to, promotion },
      },
    };
  }).catch((error) => {
    console.error("Schaakzet kon niet worden opgeslagen:", error);
    setMessage("De zet kon niet worden gesynchroniseerd. Probeer opnieuw.");
  });
}

function maybeStartGame(data) {
  if (!data || !["waiting", "countdown"].includes(data.status)) return;
  const players = activePlayers(data.players, data.hostId);
  if (players.length < 2) return;

  runTransaction(roomReference, (current) => {
    if (!current || !["waiting", "countdown"].includes(current.status)) return;
    const currentPlayers = activePlayers(current.players, current.hostId);
    if (currentPlayers.length < 2) return;
    return { ...current, status: "playing", startedAt: current.startedAt || Date.now() };
  }).catch((error) => console.error("Chess-match kon niet worden gestart:", error));
}

async function createRoom() {
  setBusy(true);
  try {
    playerId = createPlayerId();
    role = "host";
    roomCode = createRoomCode();
    roomReference = roomPath(roomCode);
    playerReference = ref(database, `${roomRoot}/${roomCode}/players/${playerId}`);
    const result = await runTransaction(roomReference, (current) => current || {
      hostId: playerId,
      status: "waiting",
      createdAt: Date.now(),
      game: initialGame(),
      players: { [playerId]: playerData("w") },
    });
    if (!result.committed) throw new Error("Roomcode bestaat al");
    configuredColor = "w";
    await registerPresence();
    window.chessGame.configureMultiplayer(true, { color: "w", onMove: publishMove, onReset: requestRematch });
    subscribeToRoom();
    setMessage("Room aangemaakt. Deel de code met je tegenstander.");
    updateRoomControls();
  } catch (error) {
    console.error("Chess-room aanmaken mislukt:", error);
    cleanupRoom(false);
    setMessage(`Room aanmaken mislukt: ${readableFirebaseError(error)}`);
  } finally {
    setBusy(false);
  }
}

async function joinRoom() {
  const code = roomInput.value.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    setMessage("Gebruik een roomcode van 6 letters/cijfers.");
    return;
  }

  setBusy(true);
  try {
    const reference = roomPath(code);
    const existing = await get(reference);
    if (!existing.exists()) throw new Error("Room bestaat niet");
    const currentRoom = existing.val();
    if (currentRoom.status !== "waiting" || activePlayers(currentRoom.players, currentRoom.hostId).length >= 2) {
      throw new Error("Deze room is niet meer beschikbaar");
    }

    playerId = createPlayerId();
    role = "guest";
    roomCode = code;
    roomReference = reference;
    playerReference = ref(database, `${roomRoot}/${code}/players/${playerId}`);
    // Net als Flappy schrijven we alleen de nieuwe speler onder /players.
    // Een root-transactie kan onnodig worden afgewezen door de room-validatie
    // wanneer een oudere room nog geen actuele game-state bevat.
    await update(playerReference, playerData("b"));
    configuredColor = "b";
    await registerPresence();
    window.chessGame.configureMultiplayer(true, { color: "b", onMove: publishMove, onReset: requestRematch });
    subscribeToRoom();
    setMessage("Je bent gejoined. De match start automatisch.");
    updateRoomControls();
  } catch (error) {
    console.error("Chess-room joinen mislukt:", error);
    if (role === "guest" && playerReference) {
      await remove(playerReference).catch((cleanupError) => {
        console.error("Mislukte gastregistratie kon niet worden opgeruimd:", cleanupError);
      });
    }
    cleanupRoom(false);
    setMessage(`Joinen mislukt: ${readableFirebaseError(error)}`);
  } finally {
    setBusy(false);
  }
}

function requestRematch() {
  if (!roomReference) return;
  runTransaction(roomReference, (current) => {
    if (!current || !["waiting", "playing"].includes(current.status)) return;
    const players = Object.fromEntries(
      Object.entries(current.players || {}).map(([id, player]) => [id, {
        ...player,
        ready: false,
        connected: player.connected !== false,
      }]),
    );
    return { ...current, status: "waiting", game: initialGame(), players };
  }).catch((error) => console.error("Rematch kon niet worden gestart:", error));
}

async function cleanupRoom(resetGame = true) {
  stopListening?.();
  stopListening = null;
  if (presenceTimer) window.clearInterval(presenceTimer);
  presenceTimer = null;
  roomCode = "";
  playerId = "";
  role = "";
  roomData = null;
  roomReference = null;
  playerReference = null;
  configuredColor = null;
  if (resetGame) window.chessGame?.configureMultiplayer(false);
  updateRoomControls();
}

async function leaveRoom() {
  const oldRoom = roomReference;
  try {
    if (role === "host" && oldRoom) await remove(oldRoom);
    else if (playerReference) await remove(playerReference);
  } catch (error) {
    console.error("Chess-room verlaten mislukt:", error);
  } finally {
    await cleanupRoom(true);
    setMessage("Je hebt de room verlaten.");
  }
}

createButton.addEventListener("click", createRoom);
joinButton.addEventListener("click", joinRoom);
leaveButton.addEventListener("click", leaveRoom);
roomInput.addEventListener("input", () => {
  roomInput.value = roomInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
});
copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(roomCode);
    setMessage("Roomcode gekopieerd.");
  } catch {
    setMessage(`De roomcode is ${roomCode}.`);
  }
});

window.addEventListener("beforeunload", () => stopListening?.());
window.chessMultiplayer = { requestRematch };
