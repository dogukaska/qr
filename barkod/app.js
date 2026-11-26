const $ = (id) => document.getElementById(id);
const svg = $("barcode");
function render() {
  const value = $("value").value.trim();
  const format = $("format").value;
  $("preview").hidden = true;
  $("status").textContent = "";
  if (!value) return;
  if (format === "EAN13" && !/^\d{12,13}$/.test(value)) {
    $("status").textContent = "EAN‑13 için 12 veya 13 rakam gir.";
    return;
  }
  if (format === "CODE128" && !/^[\x20-\x7E]+$/.test(value)) {
    $("status").textContent = "Code 128 için temel Latin harfleri, rakamları ve işaretleri kullan.";
    return;
  }
  try {
    window.JsBarcode(svg, value, {format,width:2,height:78,margin:14,background:"#ffffff",lineColor:"#000000"});
    $("preview").hidden = false;
  } catch {
    $("status").textContent = "Kod geçersiz. EAN‑13 kullanıyorsan son kontrol rakamını doğrula.";
  }
}
$("value").addEventListener("input",render);
$("format").addEventListener("change",render);
const toUrl = () => URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:"image/svg+xml"}));
function download(url,ext) {
  const link = document.createElement("a");
  link.href = url;
  link.download = "barkod." + ext;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url),4000);
}
$("download").addEventListener("click",() => download(toUrl(),"svg"));
$("png").addEventListener("click",async () => {
  if ($("preview").hidden) return;
  const url = toUrl();
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth * 2;
    canvas.height = image.naturalHeight * 2;
    canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve,"image/png"));
    if (!blob) throw Error();
    download(URL.createObjectURL(blob),"png");
  } catch { $("status").textContent = "PNG oluşturulamadı. SVG olarak indirebilirsin."; }
  finally { URL.revokeObjectURL(url); }
});
