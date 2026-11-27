export async function withDecodedImage(file, use) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Bazı Safari sürümleri görseli img ile açabiliyor, bitmap ile açamıyor.
  }
  if (bitmap) {
    try {
      return use(bitmap, bitmap.width, bitmap.height);
    } finally {
      bitmap.close();
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      throw new Error("Görsel açılamadı. PNG veya JPG ile tekrar dene.");
    }
    return use(image, image.naturalWidth, image.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}
