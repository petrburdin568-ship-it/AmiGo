const STORAGE_PROFILES_KEY = "amigo_profiles_v1";
const STORAGE_CURRENT_PROFILE_ID_KEY = "amigo_current_profile_id";
const STORAGE_DM_MESSAGES_KEY = "amigo_dm_messages_v1";

const CHANNEL_NAME = "amigo_demo_channel_v1";

const state = {
  tabId: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + "_" + Math.random().toString(16).slice(2),
  me: null,
  peer: null,
  matchShared: 0,
  convoId: null,
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

function normalizeInterest(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function parseInterests(raw) {
  const parts = String(raw || "")
    .split(/[,;]/g)
    .map((x) => x.trim())
    .filter(Boolean);
  const norm = parts.map(normalizeInterest).filter(Boolean);
  return Array.from(new Set(norm)).slice(0, 20);
}

function readProfiles() {
  const raw = localStorage.getItem(STORAGE_PROFILES_KEY);
  const arr = safeJsonParse(raw || "[]", []);
  const list = Array.isArray(arr) ? arr : [];
  return list
    .filter((p) => p && typeof p === "object")
    .map((p) => ({
      id: String(p.id || ""),
      name: String(p.name || "").trim(),
      interests: Array.isArray(p.interests) ? p.interests.map(normalizeInterest).filter(Boolean) : [],
      created_at_ms: Number(p.created_at_ms || 0),
    }))
    .filter((p) => p.id && p.name);
}

function writeProfiles(list) {
  localStorage.setItem(STORAGE_PROFILES_KEY, JSON.stringify(list));
}

function createProfile(name, interestsRaw) {
  const nameClean = String(name || "").trim().replace(/\s+/g, " ");
  const interests = parseInterests(interestsRaw);
  if (!nameClean) throw new Error("Укажи ник.");
  if (!interests.length) throw new Error("Добавь хотя бы один интерес.");
  const profile = {
    id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + "_" + Math.random().toString(16).slice(2),
    name: nameClean.slice(0, 80),
    interests,
    created_at_ms: Date.now(),
  };
  const all = readProfiles();
  all.push(profile);
  writeProfiles(all);
  return profile;
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

function readAllDmMessages() {
  const raw = localStorage.getItem(STORAGE_DM_MESSAGES_KEY);
  const obj = safeJsonParse(raw || "{}", {});
  return obj && typeof obj === "object" ? obj : {};
}

function writeAllDmMessages(obj) {
  localStorage.setItem(STORAGE_DM_MESSAGES_KEY, JSON.stringify(obj));
}

function dmConvoId(aId, bId) {
  const a = String(aId);
  const b = String(bId);
  const [x, y] = a < b ? [a, b] : [b, a];
  return `dm:${x}:${y}`;
}

function loadDmMessages(convoId) {
  const all = readAllDmMessages();
  const list = Array.isArray(all[convoId]) ? all[convoId] : [];
  return list
    .filter((m) => m && typeof m === "object")
    .sort((a, b) => (b.created_at_ms || 0) - (a.created_at_ms || 0))
    .slice(0, 200);
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
  all[convoId] = list.slice(-400);
  writeAllDmMessages(all);
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

function showError(msg) {
  el("errorBox").textContent = msg || "";
}

function setSending(sending) {
  el("sendBtn").disabled = sending;
}

function setMe(profile) {
  state.me = profile;
  el("mePill").textContent = profile ? profile.name : "Гость";
  if (profile) setCurrentProfileId(profile.id);
  // при смене профиля сбрасываем текущий диалог
  if (state.peer) setPeer(null, 0);
  renderProfileSelect();
  renderMyInterests();
  updateChatEnabled();
}

function setPeer(profile, sharedCount) {
  state.peer = profile;
  state.matchShared = sharedCount || 0;
  el("peerTitle").textContent = profile ? profile.name : "—";
  el("matchScore").textContent = profile ? String(state.matchShared) : "—";
  el("presenceText").textContent = profile ? `${state.matchShared} общих интересов` : "подбор по интересам";
  el("chatHint").textContent = profile ? "пиши сообщение — оно появится во всех вкладках" : "выбери собеседника кнопкой сверху";

  if (state.me && state.peer) {
    state.convoId = dmConvoId(state.me.id, state.peer.id);
    el("loadingSkeleton").style.display = "block";
    state.messages = loadDmMessages(state.convoId);
    renderMessages();
  } else {
    state.convoId = null;
    state.messages = [];
    renderMessages();
  }
  updateChatEnabled();
}

function updateChatEnabled() {
  const ok = Boolean(state.me && state.peer);
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
    const isMine = Boolean(state.me && m.from_id === state.me.id);
    item.className = "item" + (isMine ? " mine" : "");
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

function sharedInterestCount(a, b) {
  const sa = new Set((a?.interests || []).map(normalizeInterest));
  const sb = new Set((b?.interests || []).map(normalizeInterest));
  let shared = 0;
  for (const x of sa) if (sb.has(x)) shared += 1;
  return shared;
}

function findBestPeer() {
  if (!state.me) throw new Error("Сначала зарегистрируйся или войди.");
  const profiles = readProfiles().filter((p) => p.id !== state.me.id);
  if (!profiles.length) throw new Error("Нет других профилей. Зарегистрируй ещё один (в другой вкладке).");

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
  if (bestScore <= 0) throw new Error("Не нашёл совпадений по интересам. Добавь интересы или заведи ещё профиль.");
  const pick = best[Math.floor(Math.random() * best.length)];
  return { peer: pick, score: bestScore };
}

function broadcast(type, payload) {
  try {
    channel?.postMessage({ type, tabId: state.tabId, at: Date.now(), ...payload });
  } catch {}
}

function main() {
  showError("");
  updateChatEnabled();
  renderProfileSelect();

  // автологин по сохранённому профилю
  const savedId = getCurrentProfileId();
  const profiles = readProfiles();
  const saved = profiles.find((p) => p.id === savedId) || null;
  if (saved) setMe(saved);

  el("registerForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    showError("");
    try {
      const p = createProfile(el("regName").value, el("regInterests").value);
      setMe(p);
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
    broadcast("profiles_updated", {});
  });

  el("findBtn").addEventListener("click", () => {
    showError("");
    try {
      const res = findBestPeer();
      setPeer(res.peer, res.score);
      broadcast("peer_selected", { meId: state.me.id, peerId: res.peer.id });
    } catch (e) {
      showError(e?.message || "Не удалось найти собеседника");
    }
  });

  el("msgForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    showError("");
    if (!state.me) return showError("Сначала зарегистрируйся или войди.");
    if (!state.peer || !state.convoId) return showError("Нажми «Найти собеседника».");

    const text = el("textInput").value.trim();
    if (!text) return showError("Напиши сообщение.");

    setSending(true);
    try {
      const msg = addDmMessage(state.convoId, state.me, state.peer, text);
      el("textInput").value = "";
      state.messages = [msg, ...state.messages].slice(0, 200);
      renderMessages();
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
    if (data.type === "profiles_updated") {
      renderProfileSelect();
      return;
    }
    if (data.type === "dm_message") {
      if (!state.convoId || data.convoId !== state.convoId) return;
      const msg = data.message;
      if (!msg || typeof msg !== "object") return;
      // чтобы не дублировать свои же сообщения при broadcast
      if (data.tabId === state.tabId) return;
      state.messages = [msg, ...state.messages].slice(0, 200);
      renderMessages();
      return;
    }
  });

  window.addEventListener("storage", (ev) => {
    if (ev.key === STORAGE_PROFILES_KEY) renderProfileSelect();
    if (!channel && ev.key === STORAGE_DM_MESSAGES_KEY && state.convoId) {
      state.messages = loadDmMessages(state.convoId);
      renderMessages();
    }
  });
}

main();
