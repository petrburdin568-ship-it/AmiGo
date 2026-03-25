const DEFAULT_ROOMS = ["Музыка", "Кино", "Игры", "Программирование", "Спорт"];

const STORAGE_USER_KEY = "amigo_messenger_user";
const STORAGE_ROOM_KEY = "amigo_messenger_room";
const STORAGE_ROOMS_KEY = "amigo_rooms_v1";
const STORAGE_MESSAGES_KEY = "amigo_messages_v1";

const CHANNEL_NAME = "amigo_messenger_channel_v1";

const state = {
  tabId: (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + "_" + Math.random().toString(16).slice(2)),
  rooms: [],
  room: null,
  user: null,
  messages: [],
  peers: new Map(), // tabId -> { lastSeenMs, room }
};

const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL_NAME) : null;

function el(id) {
  return document.getElementById(id);
}

function safeJsonParse(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function readRooms() {
  const raw = localStorage.getItem(STORAGE_ROOMS_KEY);
  const rooms = Array.isArray(safeJsonParse(raw || "[]", [])) ? safeJsonParse(raw || "[]", []) : [];
  const merged = Array.from(new Set([...DEFAULT_ROOMS, ...rooms]))
    .map((x) => String(x).trim())
    .filter(Boolean)
    .slice(0, 200);
  return merged.sort((a, b) => a.localeCompare(b, "ru"));
}

function writeRooms(rooms) {
  localStorage.setItem(STORAGE_ROOMS_KEY, JSON.stringify(rooms));
}

function readAllMessages() {
  const raw = localStorage.getItem(STORAGE_MESSAGES_KEY);
  const obj = safeJsonParse(raw || "{}", {});
  return obj && typeof obj === "object" ? obj : {};
}

function writeAllMessages(obj) {
  localStorage.setItem(STORAGE_MESSAGES_KEY, JSON.stringify(obj));
}

function loadMessages(room) {
  const all = readAllMessages();
  const list = Array.isArray(all[room]) ? all[room] : [];
  return list
    .filter((m) => m && typeof m === "object")
    .sort((a, b) => (b.created_at_ms || 0) - (a.created_at_ms || 0))
    .slice(0, 200);
}

function addMessage(room, user, text) {
  const all = readAllMessages();
  const list = Array.isArray(all[room]) ? all[room] : [];
  const msg = {
    id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + "_" + Math.random().toString(16).slice(2),
    room,
    user,
    text,
    created_at_ms: Date.now(),
  };
  list.push(msg);
  all[room] = list.slice(-400);
  writeAllMessages(all);
  return msg;
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function avatarStyle(user) {
  const h = hashString((user || "").trim().toLowerCase() || "user");
  const hue1 = h % 360;
  const hue2 = (hue1 + 42) % 360;
  return `linear-gradient(135deg, hsl(${hue1} 95% 60%), hsl(${hue2} 95% 55%))`;
}

function initials(user) {
  const u = (user || "").trim();
  if (!u) return "?";
  const parts = u.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || "?";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase();
}

function fmtTime(ms) {
  try {
    const d = new Date(ms);
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

function setConnStatus() {
  const pill = el("connPill");
  pill.textContent = "LOCAL";
  pill.style.borderColor = "rgba(41, 211, 255, 0.35)";
}

function showError(msg) {
  el("errorBox").textContent = msg || "";
}

function setSending(sending) {
  el("sendBtn").disabled = sending;
}

function setRoom(room) {
  state.room = room;
  el("roomTitle").textContent = room || "—";
  try {
    localStorage.setItem(STORAGE_ROOM_KEY, room || "");
  } catch {}
  publishPresence();
}

function setUser(user) {
  state.user = user;
  el("myNameShort").textContent = (user || "—").slice(0, 10);
  try {
    localStorage.setItem(STORAGE_USER_KEY, user || "");
  } catch {}
}

function renderRooms() {
  const host = el("roomsChips");
  host.querySelectorAll(".chip").forEach((n) => n.remove());

  for (const r of state.rooms) {
    const chip = document.createElement("div");
    chip.className = "chip" + (r === state.room ? " active" : "");
    chip.textContent = r;
    chip.addEventListener("click", () => selectRoom(r));
    host.appendChild(chip);
  }
}

function renderMessages() {
  const list = el("messagesList");
  const skeleton = el("loadingSkeleton");
  if (skeleton) skeleton.style.display = "none";

  const items = state.messages || [];
  el("msgCount").textContent = String(items.length);
  list.querySelectorAll(".item, .empty").forEach((n) => n.remove());

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "item empty";
    empty.innerHTML = `
      <div class="avatar" style="background: rgba(255,255,255,0.08)">☆</div>
      <div class="content">
        <div class="line1">
          <div class="user">Пока тихо</div>
          <div class="time"></div>
        </div>
        <div class="text">Будь первым — напиши сообщение в этой комнате.</div>
      </div>
    `;
    list.appendChild(empty);
    return;
  }

  for (const m of items) {
    const item = document.createElement("div");
    item.className = "item";
    const bg = avatarStyle(m.user);
    item.innerHTML = `
      <div class="avatar" style="background:${bg}">${initials(m.user)}</div>
      <div class="content">
        <div class="line1">
          <div class="user"></div>
          <div class="time"></div>
        </div>
        <div class="text"></div>
      </div>
    `;
    item.querySelector(".user").textContent = m.user;
    item.querySelector(".time").textContent = fmtTime(m.created_at_ms);
    item.querySelector(".text").textContent = m.text;
    list.appendChild(item);
  }
}

function setPresenceCount(count) {
  el("presenceText").textContent = `${count} онлайн`;
  const dot = el("presenceDot");
  dot.style.background = count > 0 ? "var(--ok)" : "rgba(255,255,255,0.25)";
  dot.style.boxShadow =
    count > 0 ? "0 0 0 6px rgba(52, 211, 153, 0.12)" : "0 0 0 6px rgba(255,255,255,0.06)";
}

function computeOnlineCount() {
  const now = Date.now();
  for (const [id, info] of state.peers.entries()) {
    if (!info || now - info.lastSeenMs > 6500) state.peers.delete(id);
  }
  let count = 1; // текущая вкладка
  for (const info of state.peers.values()) {
    if (info.room === state.room) count += 1;
  }
  setPresenceCount(count);
}

function publishPresence() {
  if (!state.room) return;
  const payload = { type: "presence", tabId: state.tabId, room: state.room, at: Date.now() };
  try {
    channel?.postMessage(payload);
  } catch {}
}

function publishMessage(msg) {
  const payload = { type: "message", tabId: state.tabId, message: msg, at: Date.now() };
  try {
    channel?.postMessage(payload);
  } catch {}
}

function publishRoomsUpdated() {
  const payload = { type: "rooms", tabId: state.tabId, at: Date.now() };
  try {
    channel?.postMessage(payload);
  } catch {}
}

function handleIncomingPresence(data) {
  if (!data || data.tabId === state.tabId) return;
  state.peers.set(data.tabId, { lastSeenMs: Date.now(), room: data.room || "" });
  computeOnlineCount();
}

function handleIncomingMessage(data) {
  const msg = data?.message;
  if (!msg || typeof msg !== "object") return;
  if (msg.room !== state.room) return;
  state.messages = [msg, ...state.messages].slice(0, 200);
  renderMessages();
}

function handleRoomsPing() {
  state.rooms = readRooms();
  if (!state.rooms.includes(state.room)) setRoom(state.rooms[0] || "");
  renderRooms();
}

async function selectRoom(room) {
  setRoom(room);
  renderRooms();
  el("loadingSkeleton").style.display = "block";
  state.messages = loadMessages(room);
  renderMessages();
  computeOnlineCount();
}

function loadPrefs() {
  let preferredRoom = "";
  try {
    const r = localStorage.getItem(STORAGE_ROOM_KEY);
    if (r) preferredRoom = r;
  } catch {}
  try {
    const u = localStorage.getItem(STORAGE_USER_KEY);
    if (u) el("userInput").value = u;
  } catch {}
  return preferredRoom;
}

function ensureRoomsSeeded() {
  const existing = safeJsonParse(localStorage.getItem(STORAGE_ROOMS_KEY) || "null", null);
  if (Array.isArray(existing) && existing.length) return;
  writeRooms(DEFAULT_ROOMS);
}

function main() {
  setConnStatus();
  showError("");
  ensureRoomsSeeded();

  const preferredRoom = loadPrefs();
  const initialUser = (el("userInput").value || "").trim() || "Гость";
  setUser(initialUser);

  state.rooms = readRooms();
  const firstRoom = state.rooms[0] || "Музыка";
  const initialRoom = state.rooms.includes(preferredRoom) ? preferredRoom : firstRoom;
  setRoom(initialRoom);
  renderRooms();
  selectRoom(initialRoom);

  channel?.addEventListener("message", (ev) => {
    const data = ev.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "presence") return handleIncomingPresence(data);
    if (data.type === "message") return handleIncomingMessage(data);
    if (data.type === "rooms") return handleRoomsPing();
  });

  window.addEventListener("storage", (ev) => {
    if (ev.key === STORAGE_MESSAGES_KEY && state.room) {
      state.messages = loadMessages(state.room);
      renderMessages();
    }
    if (ev.key === STORAGE_ROOMS_KEY) handleRoomsPing();
  });

  el("roomCreateForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    showError("");
    const name = el("roomCreateInput").value.trim().replace(/\s+/g, " ");
    if (!name) return;
    if (name.length > 60) return showError("Слишком длинное название комнаты.");

    state.rooms = readRooms();
    if (!state.rooms.includes(name)) {
      const next = [...state.rooms, name].sort((a, b) => a.localeCompare(b, "ru"));
      writeRooms(next);
      state.rooms = next;
      publishRoomsUpdated();
    }
    el("roomCreateInput").value = "";
    selectRoom(name);
  });

  el("userInput").addEventListener("change", () => {
    const u = el("userInput").value.trim() || "Гость";
    setUser(u);
  });

  el("msgForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    showError("");

    const user = el("userInput").value.trim();
    const text = el("textInput").value.trim();
    if (!state.room) return showError("Выбери комнату.");
    if (!user) return showError("Укажи ник.");
    if (!text) return showError("Напиши сообщение.");

    setSending(true);
    try {
      setUser(user);
      const msg = addMessage(state.room, user, text);
      el("textInput").value = "";
      state.messages = [msg, ...state.messages].slice(0, 200);
      renderMessages();
      publishMessage(msg);
    } catch (e) {
      showError(e?.message || "Ошибка отправки");
    } finally {
      setSending(false);
    }
  });

  // presence heartbeat
  publishPresence();
  setInterval(() => {
    publishPresence();
    computeOnlineCount();
  }, 2000);
}

main();

