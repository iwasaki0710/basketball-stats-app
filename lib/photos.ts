/** Rasterize and resize uploads to remove metadata and prohibit executable SVG content. */
export async function preparePhoto(file: File): Promise<string> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 8 * 1024 * 1024
  )
    throw Error("JPEG・PNG・WebP の画像を8MB以内で選択してください");
  const image = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const c = canvas.getContext("2d");
    if (!c) throw Error("画像処理を利用できません");
    const size = Math.min(image.width, image.height);
    c.drawImage(
      image,
      (image.width - size) / 2,
      (image.height - size) / 2,
      size,
      size,
      0,
      0,
      256,
      256,
    );
    const data = canvas.toDataURL("image/webp", 0.72);
    if (data.length > 100000)
      throw Error("画像を圧縮できませんでした。小さな画像をお試しください");
    return data;
  } finally {
    image.close();
  }
}
