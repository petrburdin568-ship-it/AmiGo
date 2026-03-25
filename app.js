const state = {
  currentSong: null,
  comments: [],
  polling: false,
};

const STORAGE_USER_KEY = "amigo_user";
const STORAGE_COMMENTS_KEY = "amigo_comments_v1";

function el(id) {
  return document.getElementById(id);
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
  const h = hashString(user.trim().toLowerCase() || "user");
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

function getCurrentSong() {
  // MVP: имитируем "уведомления Windows" — песня меняется раз в ~30 секунд
  const songs = [
    "Blinding Lights - The Weeknd",
    "Lose Yourself - Eminem",
    "Bad Guy - Billie Eilish",
    "Around the World - Daft Punk",
    "Numb - Linkin Park",
  ];
  const idx = Math.floor(Date.now() / 1000 / 30) % songs.length;
  return songs[idx];
}

function readAllComments() {
  try {
    const raw = localStorage.getItem(STORAGE_COMMENTS_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return {};
    return obj;
  } catch {
    return {};
  }
}

function writeAllComments(obj) {
  localStorage.setItem(STORAGE_COMMENTS_KEY, JSON.stringify(obj));
}

function loadCommentsForSong(song) {
  const all = readAllComments();
  const items = all[song];
  if (!Array.isArray(items)) return [];
  return items
    .filter((x) => x && typeof x === "object")
    .sort((a, b) => (b.created_at_ms || 0) - (a.created_at_ms || 0));
}

function addComment(song, user, text) {
  const all = readAllComments();
  const list = Array.isArray(all[song]) ? all[song] : [];
  const created = {
    id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + "_" + Math.random().toString(16).slice(2),
    song,
    user,
    text,
    created_at_ms: Date.now(),
  };
  list.push(created);
  all[song] = list.slice(-200);
  writeAllComments(all);
  return created;
}

function setSong(song) {
  state.currentSong = song;
  el("songTitle").textContent = song || "—";
}

function renderComments() {
  const list = el("commentsList");
  const skeleton = el("loadingSkeleton");
  if (skeleton) skeleton.style.display = "none";

  const items = state.comments || [];
  el("commentCount").textContent = String(items.length);

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
        <div class="text">Будь первым — оставь комментарий к этому треку.</div>
      </div>
    `;
    list.appendChild(empty);
    return;
  }

  for (const c of items) {
    const item = document.createElement("div");
    item.className = "item";
    const bg = avatarStyle(c.user);
    item.innerHTML = `
      <div class="avatar" style="background:${bg}">${initials(c.user)}</div>
      <div class="content">
        <div class="line1">
          <div class="user"></div>
          <div class="time"></div>
        </div>
        <div class="text"></div>
      </div>
    `;
    item.querySelector(".user").textContent = c.user;
    item.querySelector(".time").textContent = fmtTime(c.created_at_ms);
    item.querySelector(".text").textContent = c.text;
    list.appendChild(item);
  }
}

function showError(msg) {
  el("errorBox").textContent = msg || "";
}

function setSending(sending) {
  const btn = el("sendBtn");
  btn.disabled = sending;
  btn.style.opacity = sending ? "0.75" : "1";
  btn.style.filter = sending ? "grayscale(0.1)" : "none";
}

function refreshComments() {
  if (!state.currentSong) return;
  state.comments = loadCommentsForSong(state.currentSong);
  renderComments();
}

function refreshSongAndMaybeComments() {
  const song = getCurrentSong();
  if (!song) return;
  if (state.currentSong !== song) {
    setSong(song);
    el("loadingSkeleton").style.display = "block";
    refreshComments();
  }
}

function startPolling() {
  if (state.polling) return;
  state.polling = true;
  const tick = () => {
    try {
      refreshSongAndMaybeComments();
      el("statusText").textContent = "LIVE";
    } catch {
      el("statusText").textContent = "OFF";
    }
  };
  tick();
  setInterval(tick, 4000);
}

function loadUserFromStorage() {
  try {
    const v = localStorage.getItem(STORAGE_USER_KEY);
    if (v) el("userInput").value = v;
  } catch {}
}

function saveUserToStorage(v) {
  try {
    localStorage.setItem(STORAGE_USER_KEY, v);
  } catch {}
}

function main() {
  loadUserFromStorage();

  setSong(getCurrentSong());
  refreshComments();
  renderComments();
  startPolling();

  el("commentForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    showError("");

    const user = el("userInput").value.trim();
    const text = el("textInput").value.trim();
    const song = state.currentSong;

    if (!song) return showError("Не удалось определить текущую песню.");
    if (!user) return showError("Укажи имя.");
    if (!text) return showError("Напиши комментарий.");

    setSending(true);
    try {
      saveUserToStorage(user);
      const created = addComment(song, user, text);
      el("textInput").value = "";
      state.comments = [created, ...state.comments].slice(0, 200);
      renderComments();
    } catch (e) {
      showError(e?.message || "Ошибка отправки.");
    } finally {
      setSending(false);
    }
  });
}

main();

