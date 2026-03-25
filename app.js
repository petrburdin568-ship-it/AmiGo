const STORAGE_PROFILES_KEY = "amigo_profiles_v1";
const STORAGE_CURRENT_PROFILE_ID_KEY = "amigo_current_profile_id";
const STORAGE_DM_MESSAGES_KEY = "amigo_dm_messages_v1";
const STORAGE_RECENTS_PREFIX = "amigo_recents_v1:";

const CHANNEL_NAME = "amigo_demo_channel_v1";

const state = {
  tabId: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + "_" + Math.random().toString(16).slice(2),
  me: null,
  peer: null,
  convoId: null,
  matchShared: 0,
  messages: [],
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

function normalizeSpaces(s) {
  return String(s || "").trim().replace(/\s+/g, " ");
}

function normalizeInterest(s) {
  return normalizeSpaces(s).toLowerCase();
}

function parseInterests(raw) {
  const parts = String(raw || "")
    .split(/[,;]/g)
    .map((x) => x.trim())
    .filter(Boolean);
  const norm = parts.map(normalizeInterest).filter(Boolean);
  return Array.from(new Set(norm)).slice(0, 20);
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function avatarGradient(seed) {
  const h = hashString(String(seed || "user").trim().toLowerCase());
  const hue1 = h % 360;
  const hue2 = (hue1 + 42) % 360;
  return `linear-gradient(135deg, hsl(${hue1} 90% 55%), hsl(${hue2} 90% 55%))`;
}

function initials(name) {
  const n = normalizeSpaces(name);
  if (!n) return "?";
  const parts = n.split(" ").filter(Boolean);
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

function openModal() {
  const m = el("profileModal");
  m.classList.add("open");
  m.setAttribute("aria-hidden", "false");
}

function closeModal() {
  const m = el("profileModal");
  m.classList.remove("open");
  m.setAttribute("aria-hidden", "true");
}

function showError(msg) {
  el("errorBox").textContent = msg || "";
}

function setSending(sending) {
  el("sendBtn").disabled = sending;
}

function getCurrentProfileId() {
  try {
    return localStorage.getItem(STORAGE_CURRENT_PROFILE_ID_KEY) || "";
  } catch {
    return "";
  }
}

function setCurrentProfileId(id) {
  try {
    localStorage.setItem(STORAGE_CURRENT_PROFILE_ID_KEY, id || "");
  } catch {}
}

function readProfiles() {
  const raw = localStorage.getItem(STORAGE_PROFILES_KEY);
  const arr = safeJsonParse(raw || "[]", []);
  const list = Array.isArray(arr) ? arr : [];
  return list
    .filter((p) => p && typeof p === "object")
    .map((p) => ({
      id: String(p.id || ""),
      name: normalizeSpaces(p.name || ""),
      interests: Array.isArray(p.interests) ? p.interests.map(normalizeInterest).filter(Boolean) : [],
      created_at_ms: Number(p.created_at_ms || 0),
    }))
    .filter((p) => p.id && p.name);
}

function writeProfiles(list) {
  localStorage.setItem(STORAGE_PROFILES_KEY, JSON.stringify(list));
}

function createProfile(name, interestsRaw) {
  const nameClean = normalizeSpaces(name).slice(0, 80);
  const interests = parseInterests(interestsRaw);
  if (!nameClean) throw new Error("Укажи ник.");
  if (!interests.length) throw new Error("Добавь хотя бы один интерес.");
  const profile = {
    id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + "_" + Math.random().toString(16).slice(2),
    name: nameClean,
    interests,
    created_at_ms: Date.now(),
  };
  const all = readProfiles();
  all.push(profile);
  writeProfiles(all);
  return profile;
}

function profilesMap() {
  const m = new Map();
  for (const p of readProfiles()) m.set(p.id, p);
  return m;
}

function recentsKey(meId) {
  return `${STORAGE_RECENTS_PREFIX}${meId}`;
}

function readRecents(meId) {
  try {
    const raw = localStorage.getItem(recentsKey(meId));
    const arr = safeJsonParse(raw || "[]", []);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

function writeRecents(meId, ids) {
  try {
    localStorage.setItem(recentsKey(meId), JSON.stringify(ids.slice(0, 50)));
  } catch {}
}

function addRecent(meId, peerId) {
  const ids = readRecents(meId).filter((x) => x && x !== peerId);
  ids.unshift(peerId);
  writeRecents(meId, ids);
}

function dmConvoId(aId, bId) {
  const a = String(aId);
  const b = String(bId);
  const [x, y] = a < b ? [a, b] : [b, a];
  return `dm:${x}:${y}`;
}

function parseConvoIds(convoId) {
  const parts = String(convoId || "").split(":");
  if (parts.length !== 3) return null;
  if (parts[0] !== "dm") return null;
  return { a: parts[1], b: parts[2] };
}

function readAllDmMessages() {
  const raw = localStorage.getItem(STORAGE_DM_MESSAGES_KEY);
  const obj = safeJsonParse(raw || "{}", {});
  return obj && typeof obj === "object" ? obj : {};
}

function writeAllDmMessages(obj) {
  localStorage.setItem(STORAGE_DM_MESSAGES_KEY, JSON.stringify(obj));
}

function loadDmMessages(convoId) {
  const all = readAllDmMessages();
  const list = Array.isArray(all[convoId]) ? all[convoId] : [];
  return list
    .filter((m) => m && typeof m === "object")
    .sort((a, b) => (a.created_at_ms || 0) - (b.created_at_ms || 0))
    .slice(-200);
}

function addDmMessage(convoId, fromProfile, toProfile, text) {
  const t = String(text || "").trim();
  if (!t) throw new Error("Пустое сообщение.");
  const all = readAllDmMessages();
  const list = Array.isArray(all[convoId]) ? all[convoId] : [];
  const msg = {
    id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + "_" + Math.random().toString(16).slice(2),
    convo_id: convoId,
    from_id: fromProfile.id,
    to_id: toProfile.id,
    user: fromProfile.name,
    text: t.slice(0, 2000),
    created_at_ms: Date.now(),
  };
  list.push(msg);
  all[convoId] = list.slice(-500);
  writeAllDmMessages(all);
  return msg;
}

function sharedInterestCount(a, b) {
  const sa = new Set((a?.interests || []).map(normalizeInterest));
  const sb = new Set((b?.interests || []).map(normalizeInterest));
  let shared = 0;
  for (const x of sa) if (sb.has(x)) shared += 1;
  return shared;
}

function findBestPeer() {
  if (!state.me) throw new Error("Сначала создай профиль.");
  const map = profilesMap();
  const profiles = Array.from(map.values()).filter((p) => p.id !== state.me.id);
  if (!profiles.length) throw new Error("Нет других профилей. Создай второй (в другой вкладке).");

  let best = [];
  let bestScore = -1;
  for (const p of profiles) {
    const score = sharedInterestCount(state.me, p);
    if (score > bestScore) {
      bestScore = score;
      best = [p];
    } else if (score === bestScore) {
      best.push(p);
    }
  }
  if (bestScore <= 0) throw new Error("Нет совпадений по интересам. Добавь интересы или создай другой профиль.");
  const pick = best[Math.floor(Math.random() * best.length)];
  return { peer: pick, score: bestScore };
}

function broadcast(type, payload) {
  try {
    channel?.postMessage({ type, tabId: state.tabId, at: Date.now(), ...payload });
  } catch {}
}

function setMe(profile) {
  state.me = profile;
  setCurrentProfileId(profile ? profile.id : "");

  const meAva = el("meAvatar");
  meAva.textContent = profile ? initials(profile.name) : "A";
  meAva.style.background = avatarGradient(profile ? profile.id : "me");
  el("meName").textContent = profile ? profile.name : "Гость";
  el("meSub").textContent = profile ? `${profile.interests.length} интересов` : "Профиль не выбран";
  renderProfileSelect();
  renderMyInterests();
  if (state.peer) setPeer(null, 0);
  renderChatList();
  updateChatEnabled();
}

function setPeer(profile, sharedCount) {
  state.peer = profile;
  state.matchShared = sharedCount || 0;
  state.convoId = state.me && state.peer ? dmConvoId(state.me.id, state.peer.id) : null;

  const peerAva = el("peerAvatar");
  peerAva.textContent = profile ? initials(profile.name) : "?";
  peerAva.style.background = avatarGradient(profile ? profile.id : "peer");

  el("peerTitle").textContent = profile ? profile.name : "Выбери собеседника";
  el("presenceText").textContent = profile
    ? `${state.matchShared} общих интересов`
    : "Нажми «Найти» или выбери чат слева";
  el("matchScore").textContent = profile ? String(state.matchShared) : "—";

  if (state.convoId) {
    state.messages = loadDmMessages(state.convoId);
  } else {
    state.messages = [];
  }
  renderMessages();
  renderChatList();
  updateChatEnabled();
}

function updateChatEnabled() {
  const ok = Boolean(state.me && state.peer && state.convoId);
  el("textInput").disabled = !ok;
  el("sendBtn").disabled = !ok;
}

function renderProfileSelect() {
  const sel = el("profileSelect");
  const profiles = readProfiles().sort((a, b) => a.name.localeCompare(b.name, "ru"));
  sel.innerHTML = "";
  if (!profiles.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Профилей пока нет";
    sel.appendChild(opt);
    return;
  }
  for (const p of profiles) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.name} (${p.interests.length})`;
    if (state.me && p.id === state.me.id) opt.selected = true;
    sel.appendChild(opt);
  }
}

function renderMyInterests() {
  const host = el("myInterests");
  host.querySelectorAll(".chip").forEach((n) => n.remove());
  const interests = state.me?.interests || [];
  for (const it of interests) {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.textContent = it;
    host.appendChild(chip);
  }
}

function convoLastInfo(convoId, list) {
  if (!Array.isArray(list) || !list.length) return { at: 0, text: "" };
  const last = list.reduce((acc, m) => ((m?.created_at_ms || 0) > (acc?.created_at_ms || 0) ? m : acc), list[0]);
  return { at: Number(last.created_at_ms || 0), text: String(last.text || "") };
}

function listMyChats() {
  if (!state.me) return [];
  const map = profilesMap();
  const all = readAllDmMessages();
  const entries = new Map(); // peerId -> { peer, lastAt, lastText }

  for (const [convoId, list] of Object.entries(all)) {
    const ids = parseConvoIds(convoId);
    if (!ids) continue;
    if (ids.a !== state.me.id && ids.b !== state.me.id) continue;
    const otherId = ids.a === state.me.id ? ids.b : ids.a;
    const other = map.get(otherId);
    if (!other) continue;
    const last = convoLastInfo(convoId, list);
    entries.set(otherId, { peer: other, lastAt: last.at, lastText: last.text });
  }

  for (const otherId of readRecents(state.me.id)) {
    if (otherId === state.me.id) continue;
    const other = map.get(otherId);
    if (!other) continue;
    if (!entries.has(otherId)) entries.set(otherId, { peer: other, lastAt: 0, lastText: "" });
  }

  return Array.from(entries.values()).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0) || a.peer.name.localeCompare(b.peer.name, "ru"));
}

function renderChatList() {
  const host = el("chatList");
  host.querySelectorAll(".chatItem").forEach((n) => n.remove());
  if (!state.me) {
    const stub = document.createElement("div");
    stub.className = "emptyState";
    stub.innerHTML = `<div class="emptyTitle">Создай профиль</div><div class="emptyHint">Нажми «Профиль» → зарегистрируйся.</div>`;
    host.appendChild(stub);
    return;
  }

  const q = normalizeSpaces(el("searchInput").value).toLowerCase();
  const chats = listMyChats().filter((c) => !q || c.peer.name.toLowerCase().includes(q));
  if (!chats.length) {
    const stub = document.createElement("div");
    stub.className = "emptyState";
    stub.innerHTML = `<div class="emptyTitle">Нет чатов</div><div class="emptyHint">Нажми «Найти» и начни диалог.</div>`;
    host.appendChild(stub);
    return;
  }

  for (const c of chats) {
    const row = document.createElement("div");
    row.className = "chatItem" + (state.peer && c.peer.id === state.peer.id ? " active" : "");
    row.addEventListener("click", () => {
      const score = state.me ? sharedInterestCount(state.me, c.peer) : 0;
      addRecent(state.me.id, c.peer.id);
      setPeer(c.peer, score);
    });

    const ava = document.createElement("div");
    ava.className = "avatarRound peer";
    ava.textContent = initials(c.peer.name);
    ava.style.background = avatarGradient(c.peer.id);

    const txt = document.createElement("div");
    txt.className = "chatItemText";
    txt.innerHTML = `
      <div class="chatItemTop">
        <div class="chatItemName"></div>
        <div class="chatItemTime"></div>
      </div>
      <div class="chatItemPreview"></div>
    `;
    txt.querySelector(".chatItemName").textContent = c.peer.name;
    txt.querySelector(".chatItemTime").textContent = c.lastAt ? fmtTime(c.lastAt) : "";
    txt.querySelector(".chatItemPreview").textContent = c.lastText ? c.lastText : "Совпадения по интересам";

    row.appendChild(ava);
    row.appendChild(txt);
    host.appendChild(row);
  }
}

function scrollChatToBottom() {
  const body = el("messagesList");
  body.scrollTop = body.scrollHeight;
}

function renderMessages() {
  const body = el("messagesList");
  body.querySelectorAll(".msgRow").forEach((n) => n.remove());
  const empty = el("emptyState");

  if (!state.convoId || !state.peer) {
    empty.style.display = "block";
    el("msgCount").textContent = "0";
    return;
  }

  const items = state.messages || [];
  el("msgCount").textContent = String(items.length);
  empty.style.display = items.length ? "none" : "block";

  for (const m of items) {
    const isMine = Boolean(state.me && m.from_id === state.me.id);
    const row = document.createElement("div");
    row.className = "msgRow" + (isMine ? " mine" : "");

    if (!isMine) {
      const ava = document.createElement("div");
      ava.className = "avatarRound peer";
      ava.textContent = initials(m.user);
      ava.style.background = avatarGradient(m.from_id || m.user);
      row.appendChild(ava);
    }

    const bubble = document.createElement("div");
    bubble.className = "bubble" + (isMine ? " mine" : "");
    bubble.innerHTML = `
      <div class="bubbleHead">
        <div class="bubbleUser"></div>
        <div class="bubbleTime"></div>
      </div>
      <div class="bubbleText"></div>
    `;
    bubble.querySelector(".bubbleUser").textContent = m.user;
    bubble.querySelector(".bubbleTime").textContent = fmtTime(m.created_at_ms);
    bubble.querySelector(".bubbleText").textContent = m.text;
    row.appendChild(bubble);
    body.appendChild(row);
  }

  scrollChatToBottom();
}

function selectPeerById(peerId) {
  if (!state.me) return;
  const map = profilesMap();
  const p = map.get(peerId) || null;
  if (!p) return;
  const score = sharedInterestCount(state.me, p);
  addRecent(state.me.id, p.id);
  setPeer(p, score);
}

function main() {
  showError("");
  updateChatEnabled();

  renderProfileSelect();
  renderChatList();

  // modal events
  el("profileBtn").addEventListener("click", openModal);
  el("modalX").addEventListener("click", closeModal);
  el("modalClose").addEventListener("click", closeModal);
  window.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") closeModal();
  });

  // restore session
  const savedId = getCurrentProfileId();
  const saved = readProfiles().find((p) => p.id === savedId) || null;
  if (saved) setMe(saved);
  else openModal();

  el("searchInput").addEventListener("input", () => renderChatList());

  el("registerForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    showError("");
    try {
      const p = createProfile(el("regName").value, el("regInterests").value);
      setMe(p);
      closeModal();
      broadcast("profiles_updated", {});
    } catch (e) {
      showError(e?.message || "Ошибка регистрации");
    }
  });

  el("loginForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    showError("");
    const id = el("profileSelect").value;
    const p = readProfiles().find((x) => x.id === id) || null;
    if (!p) return showError("Выбери профиль.");
    setMe(p);
    closeModal();
    broadcast("profiles_updated", {});
  });

  el("findBtn").addEventListener("click", () => {
    showError("");
    try {
      const res = findBestPeer();
      addRecent(state.me.id, res.peer.id);
      setPeer(res.peer, res.score);
      broadcast("peer_selected", { meId: state.me.id, peerId: res.peer.id });
    } catch (e) {
      showError(e?.message || "Не удалось найти собеседника");
    }
  });

  el("msgForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    showError("");
    if (!state.me) return showError("Создай профиль.");
    if (!state.peer || !state.convoId) return showError("Нажми «Найти» или выбери чат слева.");

    const text = el("textInput").value.trim();
    if (!text) return showError("Напиши сообщение.");

    setSending(true);
    try {
      const msg = addDmMessage(state.convoId, state.me, state.peer, text);
      el("textInput").value = "";
      state.messages = [...state.messages, msg].slice(-200);
      renderMessages();
      renderChatList();
      broadcast("dm_message", { convoId: state.convoId, message: msg });
    } catch (e) {
      showError(e?.message || "Ошибка отправки");
    } finally {
      setSending(false);
    }
  });

  channel?.addEventListener("message", (ev) => {
    const data = ev.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "profiles_updated") return renderProfileSelect();
    if (data.type === "dm_message") {
      if (data.tabId === state.tabId) return;
      const msg = data.message;
      if (!msg || typeof msg !== "object") return;
      // обновляем превью/список чатов в любом случае
      renderChatList();
      if (state.convoId && data.convoId === state.convoId) {
        state.messages = [...state.messages, msg].slice(-200);
        renderMessages();
      }
      return;
    }
    if (data.type === "peer_selected") {
      // ничего не делаем: подбор остаётся локальным действием
      return;
    }
  });

  window.addEventListener("storage", (ev) => {
    if (ev.key === STORAGE_PROFILES_KEY) {
      renderProfileSelect();
      renderChatList();
    }
    if (!channel && ev.key === STORAGE_DM_MESSAGES_KEY) {
      renderChatList();
      if (state.convoId) {
        state.messages = loadDmMessages(state.convoId);
        renderMessages();
      }
    }
  });

  // if user already had chats, pick the most recent one
  if (state.me) {
    const chats = listMyChats();
    if (chats.length && !state.peer) selectPeerById(chats[0].peer.id);
  }
}

main();
