import { Jimp } from "jimp";

/** Fit the visible PNG artwork, not the transparent canvas around a signature. */
export async function trimEndorsementImage(bytes: Uint8Array): Promise<Uint8Array> {
  const image = await Jimp.read(Buffer.from(bytes));
  const { width, height, data } = image.bitmap;
  let left = width, right = -1, top = height, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] === 0) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < left) throw new Error("Slika pečata ili potpisa je potpuno prozirna.");
  if (left === 0 && top === 0 && right === width - 1 && bottom === height - 1) return bytes;
  image.crop({ x: left, y: top, w: right - left + 1, h: bottom - top + 1 });
  return new Uint8Array(await image.getBuffer("image/png"));
}
