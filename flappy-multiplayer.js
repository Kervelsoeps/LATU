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
const MAX_PLAYERS = 10;
const PLAYER_COLORS = ["#4b9bd2", "#9b59b6", "#1abc9c", "#e67e22", "#e74c3c", "#2ecc71", "#34495e", "#f06292", "#16a085"];

const createButton = document.getElementById("createRoomButton");
const joinButton = document.getElementById("joinRoomButton");
const roomInput = document.getElementById("roomCodeInput");
const roomInfo = document.getElementById("roomInfo");
const roomCodeLabel = document.getElementById("roomCodeLabel");
const copyButton = document.getElementById("copyRoomButton");
const roomStatus = document.getElementById("roomStatus");
const message = document.getElementById("multiplayerMessage");
const readyButton = document.getElementById("readyRoomButton");
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
let countdownTimer = null;
const COUNTDOWN_MS = 3000;

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
    live: false,
    alive: false,
    y: 250,
    angle: 0,
    score: 0,
    color: playerColor(playerId),
  };
}

function playerColor(id) {
  const hash = [...String(id)].reduce((total, character) => total + character.charCodeAt(0), 0);
  return PLAYER_COLORS[hash % PLAYER_COLORS.length];
}

function activePlayers(players = {}) {
  return Object.entries(players).filter(([, player]) => player?.connected !== false);
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
  const localPlayer = roomData?.players?.[playerId];
  const localReady = localPlayer?.ready === true;
  roomInfo.classList.toggle("visible", Boolean(roomCode));
  roomCodeLabel.textContent = roomCode;
  readyButton.hidden = !roomCode;
  readyButton.disabled = !roomCode || !waiting;
  readyButton.textContent = localReady ? "Niet ready" : "Ik ben ready";
  leaveButton.hidden = !roomCode;
  createButton.disabled = Boolean(roomCode);
  joinButton.disabled = Boolean(roomCode);
  roomInput.disabled = Boolean(roomCode);

  if (!roomCode) {
    roomStatus.textContent = "Nog geen multiplayer-room actief.";
    return;
  }

  if (roomData?.status === "countdown") {
    roomStatus.textContent = "Iedereen is ready. De game start bijna.";
  } else if (roomData?.status === "playing") {
    roomStatus.textContent = `Game bezig met ${players.length} spelers.`;
  } else if (roomData?.status === "finished") {
    roomStatus.textContent = "Deze ronde is afgelopen.";
  } else if (players.length < 2) {
    roomStatus.textContent = `Deel de code en wacht op spelers. (${players.length}/${MAX_PLAYERS})`;
  } else {
    roomStatus.textContent = localReady
      ? `Je bent ready. Wacht op de andere spelers. (${players.length}/${MAX_PLAYERS})`
      : `Er zijn ${players.length} spelers. Klik op Ik ben ready.`;
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
  return winnerId === playerId ? "Jij wint!" : "Een andere speler wint!";
}

async function publishFinishedResult(winnerId) {
  if (!roomReference) return;
  await runTransaction(roomReference, (current) => {
    if (!current || current.status !== "playing") return;
    const players = Object.fromEntries(
      Object.entries(current.players || {}).map(([id, player]) => [id, {
        ...player,
        ready: false,
        live: false,
        alive: false,
      }]),
    );
    return {
      ...current,
      status: "finished",
      winnerId,
      finishedAt: serverTimestamp(),
      players,
    };
  });
}

function evaluateOutcome(data) {
  if (!data?.players?.[playerId]) return;
  const local = data.players[playerId];

  if (data.status === "finished") {
    showResult(resultForWinner(data.winnerId));
    return;
  }
  if (data.status !== "playing") return;

  const players = activePlayers(data.players);
  const livePlayers = players.filter(([, player]) => player?.live === true);
  if (livePlayers.length < players.length) return;

  const alivePlayers = livePlayers.filter(([, player]) => player?.alive !== false);
  if (alivePlayers.length === 1) {
    publishFinishedResult(alivePlayers[0][0]).catch((error) => console.error("Winnaar kon niet worden opgeslagen:", error));
  } else if (alivePlayers.length === 0) {
    const winner = [...livePlayers]
      .sort(([, first], [, second]) => Number(second?.score || 0) - Number(first?.score || 0))[0]?.[0] || null;
    publishFinishedResult(winner).catch((error) => console.error("Resultaat kon niet worden opgeslagen:", error));
  } else if (local.alive === false) {
    showResult("Je bent uitgeschakeld.");
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
  const localPlayer = roomData.players?.[playerId];
  const players = activePlayers(roomData.players);
  const opponents = players
    .filter(([id]) => id !== playerId)
    .sort(([firstId], [secondId]) => firstId.localeCompare(secondId));
  window.flappyGame.setMultiplayerLobby({
    ready: localPlayer?.ready === true,
    readyCount: players.filter(([, player]) => player?.ready === true).length,
    playerCount: players.length,
    countdown: roomData.status === "countdown" ? 3 : null,
  });
  window.flappyGame.setOpponentBirds(opponents.map(([id, opponent], index) => ({
    y: Number(opponent.y ?? 250),
    angle: Number(opponent.angle ?? 0),
    score: Number(opponent.score ?? 0),
    alive: opponent.alive !== false,
    color: opponent.color || playerColor(id) || PLAYER_COLORS[index % PLAYER_COLORS.length],
  })));

  maybeStartCountdown(roomData);
  if (roomData.status === "countdown") startCountdown(roomData.countdownStartedAt);
  if (roomData.status !== "countdown") clearCountdownTimer();

  if (roomData.status === "waiting") {
    roundStartedAt = 0;
    localEndedAt = null;
    window.flappyGame.prepareMultiplayerRound();
  } else if (roomData.status === "finished") {
    roundStartedAt = 0;
    localEndedAt = null;
  }

  // De status is de betrouwbare starttrigger. Een server timestamp kan in
  // de eerste snapshot nog null zijn; daardoor bleven spelers soms wachten
  // terwijl de room al op "playing" stond.
  if (roomData.status === "playing" && roundStartedAt === 0) {
    startLocalRound(roomData.startedAt);
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
  await onDisconnect(playerReference).remove();
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
    live: true,
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
    onReady: toggleReady,
  });
}

function startLocalRound(startedAt = Date.now()) {
  if (roundStartedAt !== 0) return;
  clearCountdownTimer();
  roundStartedAt = Number(startedAt) || Date.now();
  localEndedAt = null;
  resultShown = false;
  setMessage("Vlieg! Overleef langer dan de andere spelers.");
  window.flappyGame.beginMultiplayerRound();
}

function clearCountdownTimer() {
  if (countdownTimer) window.clearInterval(countdownTimer);
  countdownTimer = null;
}

function finishCountdown() {
  if (!roomReference) return;
  runTransaction(roomReference, (current) => {
    if (!current || current.status !== "countdown") return;
    const players = activePlayers(current.players);
    if (players.length < 2 || !players.every(([, player]) => player?.ready === true)) {
      return { ...current, status: "waiting", countdownStartedAt: null };
    }
    return {
      ...current,
      status: "playing",
      startedAt: Date.now(),
      winnerId: null,
      countdownStartedAt: null,
    };
  }).catch((error) => console.error("Countdown kon niet worden afgerond:", error));
}

function startCountdown(startedAt) {
  clearCountdownTimer();
  const countdownStart = Number(startedAt) || Date.now();
  const updateCountdown = () => {
    const remaining = COUNTDOWN_MS - (Date.now() - countdownStart);
    if (remaining <= 0) {
      window.flappyGame.setMultiplayerLobby({ countdown: 0 });
      clearCountdownTimer();
      finishCountdown();
      return;
    }
    window.flappyGame.setMultiplayerLobby({ countdown: Math.ceil(remaining / 1000) });
  };
  updateCountdown();
  countdownTimer = window.setInterval(updateCountdown, 100);
}

function maybeStartCountdown(data) {
  if (data?.status !== "waiting") return;
  const players = activePlayers(data.players);
  if (players.length < 2 || !players.every(([, player]) => player?.ready === true)) return;

  runTransaction(roomReference, (current) => {
    if (!current || current.status !== "waiting") return;
    const currentPlayers = activePlayers(current.players);
    if (currentPlayers.length < 2 || !currentPlayers.every(([, player]) => player?.ready === true)) return;
    return { ...current, status: "countdown", countdownStartedAt: Date.now() };
  }).catch((error) => console.error("Countdown kon niet worden gestart:", error));
}

async function toggleReady() {
  if (!playerReference || !["waiting", "finished"].includes(roomData?.status)) return;
  const currentReady = roomData.players?.[playerId]?.ready === true;
  try {
    if (roomData.status === "finished") {
      await runTransaction(roomReference, (current) => {
        if (!current || !["waiting", "finished"].includes(current.status)) return;
        const players = Object.fromEntries(Object.entries(current.players || {}).map(([id, player]) => [id, {
          ...player,
          ready: current.status === "finished" ? id === playerId : player?.ready === true || id === playerId,
          live: false,
          alive: false,
        }]));
        return {
          ...current,
          status: "waiting",
          winnerId: null,
          finishedAt: null,
          players,
        };
      });
      return;
    }
    await update(playerReference, {
      ready: !currentReady,
      live: false,
      alive: false,
    });
  } catch (error) {
    console.error("Ready-status kon niet worden opgeslagen:", error);
    setMessage("Je ready-status kon niet worden opgeslagen.");
  }
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
    setMessage(`Room aangemaakt. Deel de code met maximaal ${MAX_PLAYERS - 1} andere spelers.`);
    updateRoomControls();
  } catch (error) {
    console.error("Room aanmaken mislukt:", error);
    cleanupRoom(false);
    const details = error?.code === "PERMISSION_DENIED"
      ? "Firebase weigert de toegang. Publiceer de Realtime Database-regels opnieuw."
      : error?.message || "onbekende Firebase-fout";
    setMessage(`Room aanmaken mislukt: ${details}`);
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
    if (currentStatus !== "waiting") {
      throw new Error(`Roomstatus: ${currentStatus}`);
    }
    if (currentPlayers >= MAX_PLAYERS) {
      throw new Error(`Deze room zit vol (${MAX_PLAYERS} spelers maximaal)`);
    }
    const newPlayerReference = ref(database, `${roomRoot}/${code}/players/${playerId}`);
    const joinResult = await runTransaction(reference, (current) => {
      if (!current || current.status !== "waiting") return;
      const players = Object.fromEntries(
        Object.entries(current.players || {}).filter(([, player]) => player?.connected !== false),
      );
      if (Object.keys(players).length >= MAX_PLAYERS) return;
      players[playerId] = playerData();
      return { ...current, players };
    });
    if (!joinResult.committed) {
      throw new Error(`Deze room zit vol of is net gestart (${MAX_PLAYERS} spelers maximaal)`);
    }

    roomCode = code;
    roomReference = reference;
    playerReference = newPlayerReference;
    await registerPresence();
    configureGameForRoom();
    subscribeToRoom();
    setMessage("Je bent gejoined. Klik op Ik ben ready wanneer je klaar bent.");
    updateRoomControls();
  } catch (error) {
    console.error("Joinen mislukt:", error);
    cleanupRoom(false);
    setMessage(`Joinen mislukt: ${error?.message || "onbekende fout"}`);
  } finally {
    setBusy(false);
  }
}

async function cleanupRoom(resetGame = true) {
  stopListening?.();
  stopListening = null;
  clearCountdownTimer();
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
  window.flappyGame.setOpponentBirds([]);
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
readyButton.addEventListener("click", toggleReady);
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
