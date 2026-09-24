import { app } from "./firebase.js";
import {
  get,
  getDatabase,
  onDisconnect,
  onValue,
  ref,
  remove,
  runTransaction,
  serverTimestamp,
  update,
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

const database = getDatabase(app);
const roomRoot = "flappyRooms";

const createButton = document.getElementById("createRoomButton");
const joinButton = document.getElementById("joinRoomButton");
const roomInput = document.getElementById("roomCodeInput");
const roomInfo = document.getElementById("roomInfo");
const roomCodeLabel = document.getElementById("roomCodeLabel");
const copyButton = document.getElementById("copyRoomButton");
const roomStatus = document.getElementById("roomStatus");
const message = document.getElementById("multiplayerMessage");
const startButton = document.getElementById("startRoomButton");
const leaveButton = document.getElementById("leaveRoomButton");

let roomCode = "";
let playerId = "";
let role = "";
let playerReference = null;
let roomReference = null;
let stopListening = null;
let roomData = null;
let roundStartedAt = 0;
let localEndedAt = null;
let resultShown = false;
let lastStateSentAt = 0;
let pendingState = null;
let sendStateTimer = null;

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

function playerData() {
  return {
    connected: true,
    ready: false,
    alive: false,
    y: 250,
    angle: 0,
    score: 0,
  };
}

function activePlayers(players = {}) {
  return Object.entries(players).filter(([, player]) => player?.connected !== false);
}

function opponentFrom(data) {
  return Object.entries(data?.players || {}).find(([id]) => id !== playerId)?.[1] || null;
}

function setMessage(text) {
  message.textContent = text;
}

function setBusy(busy) {
  const roomActive = Boolean(roomCode);
  createButton.disabled = busy || roomActive;
  joinButton.disabled = busy || roomActive;
  roomInput.disabled = busy || roomActive;
}

function updateRoomControls() {
  const players = activePlayers(roomData?.players);
  const waiting = roomData?.status === "waiting";
  roomInfo.classList.toggle("visible", Boolean(roomCode));
  roomCodeLabel.textContent = roomCode;
  startButton.hidden = role !== "host";
  startButton.disabled = role !== "host" || !waiting || players.length < 2;
  leaveButton.hidden = !roomCode;
  createButton.disabled = Boolean(roomCode);
  joinButton.disabled = Boolean(roomCode);
  roomInput.disabled = Boolean(roomCode);

  if (!roomCode) {
    roomStatus.textContent = "Nog geen multiplayer-room actief.";
    return;
  }

  if (roomData?.status === "playing") {
    roomStatus.textContent = "Game bezig — de blauwe vogel is je tegenstander.";
  } else if (roomData?.status === "finished") {
    roomStatus.textContent = "Deze ronde is afgelopen.";
  } else if (players.length < 2) {
    roomStatus.textContent = role === "host"
      ? "Deel de code en wacht op een tweede speler."
      : "Verbonden. Wacht tot de host start.";
  } else {
    roomStatus.textContent = role === "host"
      ? "Speler gevonden. Klik op Start game."
      : "Speler gevonden. Wacht tot de host start.";
  }
}

function showResult(result) {
  if (!result) return;
  resultShown = true;
  setMessage(result);
  window.flappyGame.showMultiplayerResult(result);
}

function resultForWinner(winnerId) {
  if (!winnerId) return "Gelijkspel!";
  return winnerId === playerId ? "Jij wint!" : "Je tegenstander wint!";
}

async function publishFinishedResult(winnerId) {
  if (!roomReference) return;
  await runTransaction(roomReference, (current) => {
    if (!current || current.status !== "playing") return;
    return {
      ...current,
      status: "finished",
      winnerId,
      finishedAt: serverTimestamp(),
    };
  });
}

function evaluateOutcome(data) {
  if (!data?.players?.[playerId]) return;
  const local = data.players[playerId];
  const opponentEntry = Object.entries(data.players).find(([id]) => id !== playerId);
  const opponent = opponentEntry?.[1] || null;

  if (data.status === "finished") {
    showResult(resultForWinner(data.winnerId));
    return;
  }
  if (data.status !== "playing" || !opponent) return;

  // alive=false is ook de beginwaarde. Wacht tot beide spelers minstens één
  // echte game-update hebben verstuurd voordat dit als overlijden telt.
  if (local.ready !== true || opponent.ready !== true) return;

  const opponentDisconnected = opponent.connected === false;
  if (local.alive !== false && (opponent.alive === false || opponentDisconnected)) {
    showResult("Jij wint!");
    publishFinishedResult(playerId).catch((error) => console.error("Winnaar kon niet worden opgeslagen:", error));
  } else if (local.alive === false && opponent.alive !== false && !opponentDisconnected) {
    showResult("Je tegenstander wint!");
  }

  if (local.alive === false && (opponent.alive === false || opponentDisconnected)) {
    const localTime = Number(local.endedAt ?? localEndedAt ?? 0);
    const opponentTime = Number(opponent.endedAt ?? 0);
    if (opponentTime || localTime) {
      const winnerId = localTime === opponentTime
        ? null
        : localTime > opponentTime ? playerId : opponentEntry[0];
      publishFinishedResult(winnerId).catch((error) => console.error("Resultaat kon niet worden opgeslagen:", error));
    }
  }
}

function handleRoomSnapshot(snapshot) {
  roomData = snapshot.val();
  if (!roomData) {
    setMessage("De room bestaat niet meer.");
    cleanupRoom(true);
    return;
  }

  updateRoomControls();
  const opponent = opponentFrom(roomData);
  if (opponent) {
    window.flappyGame.setOpponentBird({
      y: Number(opponent.y ?? 250),
      angle: Number(opponent.angle ?? 0),
      score: Number(opponent.score ?? 0),
      alive: opponent.alive !== false,
    });
  }

  // De status is de betrouwbare starttrigger. Een server timestamp kan in
  // de eerste snapshot nog null zijn; daardoor bleven spelers soms wachten
  // terwijl de room al op "playing" stond.
  if (roomData.status === "playing" && roundStartedAt === 0) {
    roundStartedAt = Number(roomData.startedAt) || Date.now();
    localEndedAt = null;
    resultShown = false;
    setMessage("Vlieg! Overleef langer dan je tegenstander.");
    window.flappyGame.beginMultiplayerRound();
  }
  evaluateOutcome(roomData);
}

function subscribeToRoom() {
  stopListening?.();
  stopListening = onValue(roomReference, handleRoomSnapshot, (error) => {
    console.error("Room kon niet worden gelezen:", error);
    setMessage("De room kon niet worden geladen. Controleer je Realtime Database-regels.");
  });
}

async function registerPresence() {
  await onDisconnect(playerReference).update({ connected: false, alive: false });
}

function sendPendingState() {
  sendStateTimer = null;
  if (!pendingState || !playerReference || !roomData || roomData.status !== "playing") return;
  lastStateSentAt = performance.now();
  update(playerReference, { ...pendingState, connected: true }).catch((error) => {
    console.error("Vogelpositie kon niet worden verstuurd:", error);
  });
}

function publishState(state) {
  pendingState = state;
  const delay = Math.max(0, 75 - (performance.now() - lastStateSentAt));
  if (!sendStateTimer) sendStateTimer = window.setTimeout(sendPendingState, delay);
}

async function publishDeath({ score }) {
  if (!playerReference || localEndedAt !== null) return;
  // Gebruik een server-timestamp zodat klokken op twee verschillende pc's
  // niet bepalen wie er gewonnen heeft.
  localEndedAt = Date.now();
  await update(playerReference, {
    ready: true,
    alive: false,
    connected: true,
    score: Number(score || 0),
    endedAt: serverTimestamp(),
    survivalMs: Math.max(0, Date.now() - roundStartedAt),
  });
}

function configureGameForRoom() {
  window.flappyGame.configureMultiplayer(true, {
    onState: publishState,
    onDeath: publishDeath,
  });
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
      players: { [playerId]: playerData() },
    });
    if (!result.committed) throw new Error("Roomcode bestaat al");
    await registerPresence();
    configureGameForRoom();
    subscribeToRoom();
    setMessage("Room aangemaakt. Deel de code met je tegenstander.");
    updateRoomControls();
  } catch (error) {
    console.error("Room aanmaken mislukt:", error);
    cleanupRoom(false);
    setMessage("Room aanmaken mislukt. Controleer je Realtime Database-URL en regels.");
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
    playerId = createPlayerId();
    role = "guest";
    const currentRoom = existing.val();
    const currentStatus = currentRoom?.status || "onbekend";
    const currentPlayers = activePlayers(currentRoom?.players).length;
    if (currentStatus !== "waiting" || currentPlayers >= 2) {
      throw new Error(`Roomstatus: ${currentStatus}; actieve spelers: ${currentPlayers}`);
    }
    const newPlayerReference = ref(database, `${roomRoot}/${code}/players/${playerId}`);
    await update(newPlayerReference, playerData());

    roomCode = code;
    roomReference = reference;
    playerReference = newPlayerReference;
    await registerPresence();
    configureGameForRoom();
    subscribeToRoom();
    setMessage("Je bent gejoined. Wacht tot de host start.");
    updateRoomControls();
  } catch (error) {
    console.error("Joinen mislukt:", error);
    cleanupRoom(false);
    setMessage(`Joinen mislukt: ${error?.message || "onbekende fout"}`);
  } finally {
    setBusy(false);
  }
}

async function startRoom() {
  if (role !== "host" || !roomReference || activePlayers(roomData?.players).length < 2) return;
  try {
    await update(roomReference, {
      status: "playing",
      startedAt: Date.now(),
      winnerId: null,
    });
  } catch (error) {
    console.error("Starten mislukt:", error);
    setMessage("De game kon niet worden gestart.");
  }
}

async function cleanupRoom(resetGame = true) {
  stopListening?.();
  stopListening = null;
  if (sendStateTimer) window.clearTimeout(sendStateTimer);
  sendStateTimer = null;
  pendingState = null;
  roomCode = "";
  playerId = "";
  role = "";
  roomData = null;
  roomReference = null;
  playerReference = null;
  roundStartedAt = 0;
  localEndedAt = null;
  resultShown = false;
  if (resetGame) window.flappyGame.configureMultiplayer(false);
  window.flappyGame.setOpponentBird(null);
  updateRoomControls();
}

async function leaveRoom() {
  const oldRoom = roomReference;
  try {
    if (role === "host" && oldRoom) await remove(oldRoom);
    else if (playerReference) await remove(playerReference);
  } catch (error) {
    console.error("Room verlaten mislukt:", error);
  } finally {
    await cleanupRoom(true);
    setMessage("Je hebt de room verlaten.");
  }
}

createButton.addEventListener("click", createRoom);
joinButton.addEventListener("click", joinRoom);
startButton.addEventListener("click", startRoom);
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
