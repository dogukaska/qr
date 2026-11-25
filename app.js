import qrcode from "./vendor/qrcode.mjs";

// Türkçe karakterler için UTF-8
const enc = new TextEncoder();
qrcode.stringToBytes = (s) => Array.from(enc.encode(s));

const $ = (id) => document.getElementById(id);
const KEY = "qr-kayitlar";
const INK = "#2e3033", PAPER = "#faf9f6";

let mode = "text";
let current = "";   // QR'a giden yazı
let saveName = "";

// ---------- QR çizimi
function makeQR(text) {
  for (const level of ["M", "L"]) {
    try {
      const q = qrcode(0, level);
      q.addData(text, "Byte");
      q.make();
      return q;
    } catch (e) { /* çok uzun, daha düşük düzeltme seviyesi dene */ }
  }
  return null;
}

/** QR'ı tuvale çizer; `px` = toplam genişlik */
function draw(canvas, q, px) {
  const n = q.getModuleCount();
  const quiet = 4;
  const total = n + quiet * 2;
  const cell = Math.max(1, Math.floor(px / total));
  const size = cell * total;
  canvas.width = canvas.height = size;
  const cx = canvas.getContext("2d");
  cx.fillStyle = PAPER;
  cx.fillRect(0, 0, size, size);
  cx.fillStyle = INK;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (q.isDark(r, c)) cx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
  }
}

function pngBlob(text) {
  const q = makeQR(text);
  const c = document.createElement("canvas");
  draw(c, q, 1200);
  return new Promise((r) => c.toBlob(r, "image/png"));
}

function fileName(name) {
  return (name || "qr-kod").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 50) + ".png";
}

async function download(text, name) {
  const blob = await pngBlob(text);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName(name);
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000);
}

// ---------- Giriş
function wifiString() {
  const esc = (s) => s.replace(/([\\;,:"])/g, "\\$1");
  const ssid = $("ssid").value;
  const pw = $("wpass").value;
  if (!ssid) return "";
  return `WIFI:T:${pw ? "WPA" : "nopass"};S:${esc(ssid)};${pw ? `P:${esc(pw)};` : ""};`;
}

function update() {
  current = mode === "text" ? $("text").value.trim() : wifiString();
  const out = $("out");
  if (!current) { out.classList.add("hidden"); return; }
  const q = makeQR(current);
  if (!q) {
    out.classList.remove("hidden");
    $("qr").width = $("qr").height = 0;
    $("too-long").textContent = "Yazı QR kod için çok uzun. Biraz kısalt.";
    $("save").disabled = $("dl").disabled = true;
    return;
  }
  $("too-long").textContent = "";
  $("save").disabled = $("dl").disabled = false;
  out.classList.remove("hidden");
  draw($("qr"), q, 720);
  resetSave();
}

$("mode").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  mode = b.dataset.m;
  $("mode").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  $("f-text").classList.toggle("hidden", mode !== "text");
  $("f-wifi").classList.toggle("hidden", mode !== "wifi");
  update();
});
["text", "ssid", "wpass"].forEach((id) => $(id).addEventListener("input", update));
$("wshow").addEventListener("click", () => {
  const i = $("wpass");
  i.type = i.type === "password" ? "text" : "password";
});

// ---------- Kaydetme (yalnızca istenirse)
function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; }
}
function store(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true; }
  catch (e) { alert("Kaydedilemedi. Tarayıcı gizli modda olabilir."); return false; }
}

function defaultName() {
  if (mode === "wifi") return `Wi-Fi: ${$("ssid").value}`;
  const t = current.replace(/^https?:\/\/(www\.)?/i, "");
  return t.length > 32 ? t.slice(0, 32) + "…" : t;
}

function resetSave() {
  $("name-row").classList.add("hidden");
  const saved = load().some((x) => x.text === current);
  $("save").disabled = saved;
  $("save").querySelector("span").textContent = saved ? "Kayıtlı" : "Kaydet";
}

$("save").addEventListener("click", () => {
  $("name").value = defaultName();
  $("name-row").classList.remove("hidden");
  $("name").focus();
  $("name").select();
});

function confirmSave() {
  const list = load();
  list.unshift({ id: Date.now().toString(36), name: $("name").value.trim() || defaultName(), text: current, wifi: mode === "wifi", at: Date.now() });
  if (!store(list)) return;
  resetSave();
  renderSaved();
}
$("name-ok").addEventListener("click", confirmSave);
$("name").addEventListener("keydown", (e) => { if (e.key === "Enter") confirmSave(); });

$("dl").addEventListener("click", () => download(current, mode === "wifi" ? `wifi-${$("ssid").value}` : "qr-kod"));

// ---------- Kayıtlı liste
function renderSaved() {
  const list = load();
  $("saved-wrap").classList.toggle("hidden", list.length === 0);
  const ul = $("saved");
  ul.innerHTML = "";
  for (const it of list) {
    const li = document.createElement("li");
    li.className = "glass";
    const c = document.createElement("canvas");
    const q = makeQR(it.text);
    if (q) draw(c, q, 96);
    const meta = document.createElement("div");
    meta.className = "meta";
    const nm = document.createElement("div");
    nm.className = "name";
    nm.textContent = it.name;
    const sub = document.createElement("div");
    sub.className = "date";
    sub.textContent = new Date(it.at).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
    meta.append(nm, sub);
    li.append(c, meta);
    li.tabIndex = 0;
    li.addEventListener("click", () => openView(it));
    li.addEventListener("keydown", (e) => { if (e.key === "Enter") openView(it); });
    ul.append(li);
  }
}

let viewing = null;
function openView(it) {
  viewing = it;
  $("v-name").textContent = it.name;
  const q = makeQR(it.text);
  if (q) draw($("v-qr"), q, 720);
  // Wi-Fi kaydında ham metin yerine okunur hali göster
  if (it.wifi) {
    const m = it.text.match(/S:((?:\\.|[^;])*);/), p = it.text.match(/P:((?:\\.|[^;])*);/);
    const un = (s) => (s || "").replace(/\\(.)/g, "$1");
    $("v-text").textContent = `Ağ: ${un(m && m[1])}${p ? `\nŞifre: ${un(p[1])}` : ""}`;
  } else $("v-text").textContent = it.text;
  $("v-copy").textContent = "Yazıyı kopyala";
  $("view").showModal();
}
$("v-close").addEventListener("click", () => $("view").close());
$("view").addEventListener("click", (e) => { if (e.target === $("view")) $("view").close(); });
$("v-dl").addEventListener("click", () => viewing && download(viewing.text, viewing.name));
$("v-copy").addEventListener("click", async () => {
  if (!viewing) return;
  let t = viewing.text;
  if (viewing.wifi) { const p = t.match(/P:((?:\\.|[^;])*);/); t = p ? p[1].replace(/\\(.)/g, "$1") : ""; }
  try { await navigator.clipboard.writeText(t); $("v-copy").textContent = "Kopyalandı"; }
  catch (e) { $("v-copy").textContent = "Kopyalanamadı"; }
});
$("v-del").addEventListener("click", () => {
  if (!viewing || !confirm(`“${viewing.name}” silinsin mi?`)) return;
  store(load().filter((x) => x.id !== viewing.id));
  $("view").close();
  renderSaved();
  if (current) resetSave();
});

renderSaved();
