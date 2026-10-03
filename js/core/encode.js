export class EncodeUnsupportedError extends Error {
  constructor(requested, actual) {
    super(`${requested} の書き出しに対応していません（${actual} が返されました）`);
    this.name = 'EncodeUnsupportedError';
    this.requested = requested;
    this.actual = actual;
  }
}

// 返り値の type を必ず検証する。これを省くと、AVIF を要求して 4.5MB の PNG を
// .avif という名前で出荷する事故が起きる（実測で再現済み・設計書1-3参照）。
export async function encodeVerified(canvas, mime, quality) {
  const blob = await canvas.convertToBlob({ type: mime, quality });
  if (blob.type !== mime) {
    throw new EncodeUnsupportedError(mime, blob.type);
  }
  return blob;
}

let avifEncode = null;

// AVIF は Canvas では書き出せない（要求しても PNG が返る）。WASM のエンコーダを使う。
// 約3.5MB あるので、AVIF を選んだときに初めて読み込む。
export async function encodeAvif(canvas, quality) {
  if (!avifEncode) {
    const module = await import('../../vendor/jsquash-avif/encode.js');
    avifEncode = module.default;
  }
  const imageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  const buffer = await avifEncode(imageData, { quality });
  return new Blob([buffer], { type: 'image/avif' });
}
