const $ = (id) => document.getElementById(id);
let generation = 0;
$("file").addEventListener("change", async () => {
  const file = $("file").files[0];
  const current = ++generation;
  $("file").value = "";
  if (!file) return;
  $("result").hidden = true;
  $("open").hidden = true;
  $("status").textContent = "Görsel okunuyor…";
  let bitmap;
  try {
    if (file.size > 30 * 1024 * 1024) throw Error("30 MB’tan küçük bir görsel seç.");
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d", {willReadFrequently:true});
    ctx.fillStyle = "#fff";
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const image = ctx.getImageData(0,0,canvas.width,canvas.height);
    const decoded = window.jsQR(image.data,image.width,image.height);
    if (current !== generation) return;
    if (!decoded) throw Error("QR bulunamadı. Görseli kırpıp daha yakından tekrar dene.");
    $("content").value = decoded.data;
    $("open").removeAttribute("href");
    try {
      const url = new URL(decoded.data);
      if (["http:","https:"].includes(url.protocol)) {
        $("open").href = url.href;
        $("open").hidden = false;
      }
    } catch {}
    $("result").hidden = false;
    $("status").textContent = "QR okunabildi.";
  } catch (e) {
    if (current === generation) $("status").textContent = e.message || "Görsel açılamadı.";
  } finally { bitmap?.close(); }
});
$("copy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("content").value); $("status").textContent = "Kopyalandı."; }
  catch { $("content").select(); $("status").textContent = "Metin seçildi. Kopyalama komutunu kullan."; }
});
