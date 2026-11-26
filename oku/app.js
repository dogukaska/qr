const $ = (id) => document.getElementById(id);
const video = $("video");
const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d", {willReadFrequently:true});
let generation = 0, stream = null, frame = 0;
const status = (text) => { $("status").textContent = text; };

function clearResult() {
  $("result").hidden = true;
  $("open").hidden = true;
  $("open").removeAttribute("href");
}

function showResult(text) {
  $("content").value = text;
  try {
    const url = new URL(text);
    if (["http:","https:"].includes(url.protocol)) {
      $("open").href = url.href;
      $("open").hidden = false;
    }
  } catch { /* Düz metin olarak gösterilir. */ }
  $("result").hidden = false;
  status("QR okunabildi.");
}

function decode(source, width, height, maxSide, inversionAttempts = "attemptBoth") {
  const scale = Math.min(1, maxSide / Math.max(width,height));
  const w = Math.max(1,Math.round(width*scale)), h = Math.max(1,Math.round(height*scale));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.fillStyle = "#fff";
  ctx.fillRect(0,0,w,h);
  ctx.drawImage(source,0,0,w,h);
  return window.jsQR(ctx.getImageData(0,0,w,h).data,w,h,{inversionAttempts});
}

function stopCamera() {
  cancelAnimationFrame(frame);
  frame = 0;
  stream?.getTracks().forEach(track => track.stop());
  stream = null;
  video.srcObject = null;
  $("camera-preview").hidden = true;
  $("start-camera").disabled = false;
  $("stop-camera").hidden = true;
}

function cameraError(error) {
  switch (error.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Kamera izni verilmedi. Tarayıcı ayarlarından izin ver veya QR görseli yükle.";
    case "NotFoundError":
      return "Kamera bulunamadı. QR görselini yükleyebilirsin.";
    case "NotReadableError":
      return "Kamera şu anda kullanılamıyor. Diğer uygulamaları kapatıp tekrar dene.";
    default:
      return "Kamera açılamadı. Tekrar dene veya QR görseli yükle.";
  }
}

$("start-camera").addEventListener("click",async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    status("Bu tarayıcıda kamera açılamıyor. QR görselini yükleyebilirsin.");
    return;
  }
  const current = ++generation;
  clearResult();
  $("start-camera").disabled = true;
  $("stop-camera").hidden = false;
  status("Kamera açılıyor…");
  try {
    const candidate = await navigator.mediaDevices.getUserMedia({
      audio:false,
      video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}},
    });
    if (current !== generation) {
      candidate.getTracks().forEach(track => track.stop());
      return;
    }
    stream = candidate;
    for (const track of stream.getVideoTracks()) track.addEventListener("ended",() => {
      if (current !== generation || stream !== candidate) return;
      stopCamera();
      status("Kamera bağlantısı kesildi. Tekrar açabilirsin.");
    },{once:true});
    $("camera-preview").hidden = false;
    video.srcObject = stream;
    await video.play();
    if (current !== generation || stream !== candidate) return;
    status("QR kodu kameraya göster.");
    let lastScan = -Infinity, attempts = 0;
    function scan(now) {
      if (current !== generation || stream !== candidate) return;
      if (now - lastScan >= 160 && video.readyState >= 2 && video.videoWidth && video.videoHeight) {
        lastScan = now;
        try {
          const inverted = ++attempts % 4 === 0 ? "attemptBoth" : "dontInvert";
          const decoded = decode(video,video.videoWidth,video.videoHeight,800,inverted);
          if (decoded?.data) {
            stopCamera();
            showResult(decoded.data);
            $("content").focus();
            return;
          }
        } catch {
          stopCamera();
          status("Kamera görüntüsü okunamadı. Tekrar dene veya QR görseli yükle.");
          return;
        }
      }
      frame = requestAnimationFrame(scan);
    }
    frame = requestAnimationFrame(scan);
  } catch (error) {
    if (current !== generation) return;
    stopCamera();
    status(cameraError(error));
  }
});

$("stop-camera").addEventListener("click",() => {
  generation++;
  stopCamera();
  status("Kamera kapatıldı.");
  $("start-camera").focus();
});
function closeOnLeave() {
  if ($("stop-camera").hidden) return;
  generation++;
  stopCamera();
  status("Kamera kapatıldı.");
}
window.addEventListener("pagehide",closeOnLeave);
document.addEventListener("visibilitychange",() => {
  if (document.hidden) closeOnLeave();
});

$("file").addEventListener("change", async () => {
  const file = $("file").files[0];
  $("file").value = "";
  if (!file) return;
  const current = ++generation;
  stopCamera();
  clearResult();
  status("Görsel okunuyor…");
  let bitmap;
  try {
    if (file.size > 30 * 1024 * 1024) throw Error("30 MB’tan küçük bir görsel seç.");
    bitmap = await createImageBitmap(file);
    if (current !== generation) return;
    const decoded = decode(bitmap,bitmap.width,bitmap.height,2000);
    if (!decoded?.data) throw Error("QR bulunamadı. Görseli kırpıp daha yakından tekrar dene.");
    showResult(decoded.data);
  } catch (error) {
    if (current === generation) status(error.message || "Görsel açılamadı.");
  } finally { bitmap?.close(); }
});
$("copy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("content").value); status("Kopyalandı."); }
  catch { $("content").select(); status("Metin seçildi. Kopyalama komutunu kullan."); }
});
