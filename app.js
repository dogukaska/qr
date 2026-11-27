import qrcode from "./vendor/qrcode.mjs";
import { withDecodedImage } from "./image.js?v=1";

// Türkçe karakterler için UTF-8
const enc = new TextEncoder();
qrcode.stringToBytes = (s) => Array.from(enc.encode(s));

const $ = (id) => document.getElementById(id);
const KEY = "qr-kayitlar";
const INK = "#2e3033", PAPER = "#faf9f6";

let mode = "text";
let cur = null;      // { text, show, copy, name } — QR'a giden yazı ve okunur hali
let logo = null;     // { url, img } — ortadaki logo
let logoRequest = 0;
const LOGO_PART = 0.22;  // logonun QR genişliğine oranı

// ---------- Yardımcılar
const digits = (s) => (s || "").replace(/\D/g, "");
/** Türkiye numarasını uluslararası biçime çevirir: 0532… → 90532… */
function intl(s) {
  let d = digits(s);
  if (s.trimStart().startsWith("+")) return d;
  if (d.startsWith("00")) return d.slice(2);
  if (d.startsWith("0")) d = "90" + d.slice(1);
  else if (d.length === 10 && d[0] === "5") d = "90" + d;
  return d;
}
function niceUrl(s) {
  s = (s || "").trim();
  if (!s) return "";
  // Ana makine ve sayısal port, URL şeması değildir.
  if (/^(?:localhost|[a-z0-9-]+(?:\.[a-z0-9-]+)+):\d+(?=[/?#]|$)/i.test(s)) return "https://" + s;
  return /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : "https://" + s;
}
function ibanOk(iban) {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  if (iban.startsWith("TR") && !/^TR\d{24}$/.test(iban)) return false;
  const r = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (ch) => ch.charCodeAt(0) - 55);
  let m = 0;
  for (const ch of r) m = (m * 10 + +ch) % 97;
  return m === 1;
}
const ibanGroups = (s) => s.replace(/(.{4})/g, "$1 ").trim();
const vEsc = (s) => s.replace(/([\\;,])/g, "\\$1").replace(/\n/g, "\\n");
function parseGeo(s) {
  s = (s || "").trim();
  const m = s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || s.match(/[?&](?:q|ll|query)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i)
    || s.match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:\.\d+)?)$/) || s.match(/geo:(-?\d+\.?\d*),(-?\d+\.?\d*)/i);
  if (m) {
    const lat = +m[1], lng = +m[2];
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
  }
  return null;
}

// ---------- Her tür için QR metni
function build() {
  const v = (id) => $(id).value.trim();
  switch (mode) {
    case "text": {
      const t = v("text");
      return t && { text: t, show: t, copy: t, name: t.length > 32 ? t.slice(0, 32) + "…" : t };
    }
    case "url": {
      const u = niceUrl(v("url"));
      const short = u.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
      return u && { text: u, show: u, copy: u, name: short.length > 32 ? short.slice(0, 32) + "…" : short };
    }
    case "wifi": {
      const esc = (s) => s.replace(/([\\;,:"])/g, "\\$1");
      const ssid = $("ssid").value, pw = $("wpass").value;
      if (!ssid) return null;
      return {
        text: `WIFI:T:${pw ? "WPA" : "nopass"};S:${esc(ssid)};${pw ? `P:${esc(pw)};` : ""};`,
        show: `Ağ: ${ssid}${pw ? `\nŞifre: ${pw}` : ""}`, copy: pw, name: `Wi-Fi: ${ssid}`,
      };
    }
    case "tel": {
      const d = digits(v("tel"));
      if (d.length < 3) return null;
      const n = "+" + intl(v("tel"));
      return { text: `tel:${d.length >= 10 ? n : d}`, show: v("tel"), copy: v("tel"), name: `Telefon: ${v("tel")}` };
    }
    case "wa": {
      const n = intl(v("wa"));
      if (n.length < 10) return null;
      const msg = v("wamsg");
      return {
        text: `https://wa.me/${n}${msg ? "?text=" + encodeURIComponent(msg) : ""}`,
        show: `WhatsApp: +${n}${msg ? `\nMesaj: ${msg}` : ""}`, copy: "+" + n, name: `WhatsApp: ${v("wa")}`,
      };
    }
    case "iban": {
      const iban = v("iban").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const hint = $("ibhint");
      if (!iban) { hint.textContent = "Okutan kişi IBAN'ı kopyalayıp kendi banka uygulamasına yapıştırır."; return null; }
      const ok = ibanOk(iban);
      hint.textContent = ok ? "IBAN doğru görünüyor. Okutan kişi kopyalayıp banka uygulamasına yapıştırır."
        : iban.length < 26 && iban.startsWith("TR") ? `IBAN eksik (${iban.length}/26 karakter).` : "Bu IBAN hatalı görünüyor, rakamları kontrol et.";
      if (!ok) return null;
      const name = v("ibname"), note = v("ibnote");
      const show = `${ibanGroups(iban)}${name ? `\n${name}` : ""}${note ? `\n${note}` : ""}`;
      return { text: show, show, copy: iban, name: `IBAN${name ? ": " + name : ""}` };
    }
    case "geo": {
      const raw = v("geo");
      if (!raw) return null;
      const p = parseGeo(raw);
      if (p) {
        const ll = `${+p.lat.toFixed(6)},${+p.lng.toFixed(6)}`;
        return { text: `https://maps.google.com/?q=${ll}`, show: `Konum: ${ll}`, copy: ll, name: `Konum: ${ll}` };
      }
      if (/^https?:\/\//i.test(raw)) return { text: raw, show: raw, copy: raw, name: "Konum" };
      return null;
    }
    case "vcard": {
      const name = v("vname");
      if (!name && !v("vtel") && !v("vmail")) return null;
      const parts = name.split(/\s+/);
      const last = parts.length > 1 ? parts.pop() : "";
      const first = parts.join(" ");
      const L = ["BEGIN:VCARD", "VERSION:3.0", `N:${vEsc(last)};${vEsc(first)};;;`, `FN:${vEsc(name || v("vtel") || v("vmail"))}`];
      if (v("vorg")) L.push(`ORG:${vEsc(v("vorg"))}`);
      if (v("vtitle")) L.push(`TITLE:${vEsc(v("vtitle"))}`);
      if (v("vtel")) L.push(`TEL;TYPE=CELL:${digits(v("vtel")).length >= 10 ? "+" + intl(v("vtel")) : v("vtel")}`);
      if (v("vmail")) L.push(`EMAIL:${v("vmail")}`);
      if (v("vweb")) L.push(`URL:${niceUrl(v("vweb"))}`);
      if (v("vaddr")) L.push(`ADR:;;${vEsc(v("vaddr"))};;;;`);
      L.push("END:VCARD");
      const show = [name, v("vorg"), v("vtitle"), v("vtel"), v("vmail"), v("vweb"), v("vaddr")].filter(Boolean).join("\n");
      return { text: L.join("\r\n"), show, copy: show, name: name || "Kartvizit" };
    }
  }
  return null;
}

// ---------- QR çizimi
function makeQR(text, withLogo) {
  // logo varken en yüksek düzeltme (H, %30): ortası kapansa da okunur
  for (const level of withLogo ? ["H", "Q"] : ["M", "L"]) {
    try {
      const q = qrcode(0, level);
      q.addData(text, "Byte");
      q.make();
      return q;
    } catch (e) { /* çok uzun, daha düşük seviye dene */ }
  }
  return null;
}

/** Logonun kapladığı modül kutusu (kenarlar tam modüle oturur, merkezde) */
function logoBox(n) {
  let k = Math.round(n * LOGO_PART);
  if ((n - k) % 2) k++;
  const s = (n - k) / 2;
  return { s, k };
}

function draw(canvas, q, px, lg) {
  const n = q.getModuleCount(), quiet = 4, total = n + quiet * 2;
  const cell = Math.max(1, Math.floor(px / total)), size = cell * total;
  canvas.width = canvas.height = size;
  const cx = canvas.getContext("2d");
  cx.fillStyle = PAPER;
  cx.fillRect(0, 0, size, size);
  cx.fillStyle = INK;
  const box = lg ? logoBox(n) : null;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (box && r >= box.s && r < box.s + box.k && c >= box.s && c < box.s + box.k) continue;
    if (q.isDark(r, c)) cx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
  }
  if (box) {
    const x = (box.s + quiet) * cell, w = box.k * cell, pad = cell * 0.6;
    const iw = lg.img.naturalWidth, ih = lg.img.naturalHeight, f = Math.min((w - pad * 2) / iw, (w - pad * 2) / ih);
    const dw = iw * f, dh = ih * f;
    cx.save();
    cx.beginPath();
    cx.roundRect(x + pad, x + pad, w - pad * 2, w - pad * 2, cell * 1.2);
    cx.clip();
    cx.imageSmoothingQuality = "high";
    cx.drawImage(lg.img, x + (w - dw) / 2, x + (w - dh) / 2, dw, dh);
    cx.restore();
  }
}

function svgText(text, lg) {
  const q = makeQR(text, !!lg);
  const n = q.getModuleCount(), quiet = 4, total = n + quiet * 2;
  const box = lg ? logoBox(n) : null;
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (box && r >= box.s && r < box.s + box.k && c >= box.s && c < box.s + box.k) continue;
    if (q.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
  }
  let img = "";
  if (box) {
    const x = box.s + quiet, pad = 0.6, w = box.k - pad * 2;
    img = `<clipPath id="lc"><rect x="${x + pad}" y="${x + pad}" width="${w}" height="${w}" rx="1.2"/></clipPath>`
      + `<image href="${lg.url}" x="${x + pad}" y="${x + pad}" width="${w}" height="${w}" preserveAspectRatio="xMidYMid meet" clip-path="url(#lc)"/>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="1000" height="1000" shape-rendering="crispEdges">`
    + `<rect width="${total}" height="${total}" fill="${PAPER}"/><path fill="${INK}" d="${d}"/>${img}</svg>`;
}

function fileName(name, ext) {
  return (name || "qr-kod").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 50) + "." + ext;
}
function save(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000);
}
async function downloadPng(text, name, lg) {
  const c = document.createElement("canvas");
  draw(c, makeQR(text, !!lg), 1200, lg);
  save(await new Promise((r) => c.toBlob(r, "image/png")), fileName(name, "png"));
}
function downloadSvg(text, name, lg) {
  save(new Blob([svgText(text, lg)], { type: "image/svg+xml" }), fileName(name, "svg"));
}

// ---------- Logo
async function loadLogo(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  return { url, img };
}
/** Logoyu küçültüp veri adresine çevirir (kaydedilince yer kaplamasın) */
async function shrinkLogo(file) {
  return withDecodedImage(file, (image, width, height) => {
    const scale = Math.min(1, 256 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  });
}
$("logo-file").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  const request = ++logoRequest;
  let candidate;
  try { candidate = await loadLogo(await shrinkLogo(f)); }
  catch {
    if (request === logoRequest) alert("Bu resim açılamadı.");
    return;
  }
  if (request !== logoRequest) return;
  logo = candidate;
  logoUi();
  update();
});
$("logo-del").addEventListener("click", () => {
  logoRequest++;
  logo = null;
  logoUi();
  update();
});
function logoUi() {
  $("logo-del").classList.toggle("hidden", !logo);
  $("logo-lbl").textContent = logo ? "Logoyu değiştir" : "Ortaya logo ekle";
}

// ---------- Ekran
function update() {
  cur = build();
  const out = $("out");
  $("name-row").classList.add("hidden");
  $("wifi-save").classList.add("hidden");
  if (!cur) { out.classList.add("hidden"); return; }
  const q = makeQR(cur.text, !!logo);
  out.classList.remove("hidden");
  if (!q) {
    $("qr").width = $("qr").height = 0;
    $("too-long").textContent = logo ? "Logoyla birlikte yazı çok uzun. Logoyu kaldır ya da kısalt." : "Yazı QR kod için çok uzun. Biraz kısalt.";
    $("save").disabled = $("dl").disabled = $("dl-svg").disabled = true;
    return;
  }
  $("too-long").textContent = "";
  $("dl").disabled = $("dl-svg").disabled = false;
  draw($("qr"), q, 720, logo);
  resetSave();
}

$("mode").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  mode = b.dataset.m;
  $("mode").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  document.querySelectorAll("[data-f]").forEach((f) => f.classList.toggle("hidden", f.dataset.f !== mode));
  update();
});
document.querySelectorAll("[data-f] input, [data-f] textarea").forEach((el) => el.addEventListener("input", update));
$("wshow").addEventListener("click", () => {
  const i = $("wpass");
  i.type = i.type === "password" ? "text" : "password";
});
$("geome").addEventListener("click", () => {
  const h = $("geohint");
  if (!navigator.geolocation) { h.textContent = "Bu cihaz konum vermiyor."; return; }
  h.textContent = "Konum alınıyor…";
  navigator.geolocation.getCurrentPosition((p) => {
    $("geo").value = `${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`;
    h.textContent = `Konum alındı (yaklaşık ${Math.round(p.coords.accuracy)} m sapma).`;
    update();
  }, () => { h.textContent = "Konum alınamadı. İzin vermen gerekiyor ya da elle yaz."; }, { enableHighAccuracy: true, timeout: 15000 });
});

// ---------- Kaydetme (yalnızca istenirse)
function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; }
}
function store(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true; }
  catch (e) { alert("Kaydedilemedi. Tarayıcı gizli modda olabilir ya da yer doldu."); return false; }
}

function resetSave() {
  $("name-row").classList.add("hidden");
  $("wifi-save").classList.add("hidden");
  $("wifi-consent").checked = false;
  $("name-ok").disabled = false;
  const saved = load().some((x) => x.text === cur.text && (x.logo || null) === (logo ? logo.url : null));
  $("save").disabled = saved;
  $("save").querySelector("span").textContent = saved ? "Kayıtlı" : "Kaydet";
}

$("save").addEventListener("click", () => {
  if (!cur) return;
  $("name").value = cur.name;
  $("name-row").classList.remove("hidden");
  const hasPassword = mode === "wifi" && Boolean(cur.copy);
  $("wifi-save").classList.toggle("hidden", !hasPassword);
  $("wifi-consent").checked = false;
  $("name-ok").disabled = hasPassword;
  $("name").focus();
  $("name").select();
});

function confirmSave() {
  if (!cur || $("name-row").classList.contains("hidden") || $("name-ok").disabled) return;
  const list = load();
  list.unshift({ id: Date.now().toString(36), name: $("name").value.trim() || cur.name, text: cur.text, type: mode,
    show: cur.show, copy: cur.copy, logo: logo ? logo.url : undefined, at: Date.now() });
  if (!store(list)) return;
  resetSave();
  renderSaved();
}
$("wifi-consent").addEventListener("change", (e) => {
  $("name-ok").disabled = !e.target.checked;
});
$("name-ok").addEventListener("click", confirmSave);
$("name").addEventListener("keydown", (e) => { if (e.key === "Enter") confirmSave(); });

$("dl").addEventListener("click", () => cur && downloadPng(cur.text, cur.name, logo));
$("dl-svg").addEventListener("click", () => cur && downloadSvg(cur.text, cur.name, logo));

// ---------- Kayıtlı liste
// eski kayıtlar (sürüm 1): yalnızca Wi-Fi işareti vardı
function legacy(it) {
  if (it.show) return it;
  if (it.wifi) {
    const un = (s) => (s || "").replace(/\\(.)/g, "$1");
    const m = it.text.match(/S:((?:\\.|[^;])*);/), p = it.text.match(/P:((?:\\.|[^;])*);/);
    return { ...it, type: "wifi", show: `Ağ: ${un(m && m[1])}${p ? `\nŞifre: ${un(p[1])}` : ""}`, copy: p ? un(p[1]) : "" };
  }
  return { ...it, type: "text", show: it.text, copy: it.text };
}

const logoCache = new Map();
async function logoFor(url) {
  if (!url) return null;
  if (!logoCache.has(url)) logoCache.set(url, loadLogo(url).catch(() => null));
  return logoCache.get(url);
}

async function renderSaved() {
  const list = load().map(legacy);
  $("saved-wrap").classList.toggle("hidden", list.length === 0);
  const ul = $("saved");
  ul.innerHTML = "";
  for (const it of list) {
    const li = document.createElement("li");
    li.className = "glass";
    const c = document.createElement("canvas");
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
    logoFor(it.logo).then((lg) => { const q = makeQR(it.text, !!lg); if (q) draw(c, q, 96, lg); });
  }
}

let viewing = null, viewLogo = null;
async function openView(it) {
  viewing = it;
  viewLogo = await logoFor(it.logo);
  $("v-name").textContent = it.name;
  const q = makeQR(it.text, !!viewLogo);
  if (q) draw($("v-qr"), q, 720, viewLogo);
  $("v-text").textContent = it.show;
  $("v-copy").textContent = it.type === "wifi" ? "Şifreyi kopyala" : it.type === "iban" ? "IBAN'ı kopyala" : "Yazıyı kopyala";
  $("v-copy").classList.toggle("hidden", !it.copy);
  $("view").showModal();
}
$("v-close").addEventListener("click", () => $("view").close());
$("view").addEventListener("click", (e) => { if (e.target === $("view")) $("view").close(); });
$("v-dl").addEventListener("click", () => viewing && downloadPng(viewing.text, viewing.name, viewLogo));
$("v-svg").addEventListener("click", () => viewing && downloadSvg(viewing.text, viewing.name, viewLogo));
$("v-copy").addEventListener("click", async () => {
  if (!viewing) return;
  try { await navigator.clipboard.writeText(viewing.copy); $("v-copy").textContent = "Kopyalandı"; }
  catch (e) { $("v-copy").textContent = "Kopyalanamadı"; }
});
$("v-del").addEventListener("click", () => {
  if (!viewing || !confirm(`“${viewing.name}” silinsin mi?`)) return;
  store(load().filter((x) => x.id !== viewing.id));
  $("view").close();
  renderSaved();
  if (cur) resetSave();
});

renderSaved();
