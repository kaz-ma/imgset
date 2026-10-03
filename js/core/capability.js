const EXT = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/avif': 'avif',
};

export function extensionFor(mime) {
  return EXT[mime];
}

// toBlob は非対応の形式を要求されると、エラーではなく PNG を黙って返す。
// 事前に能力を問い合わせるAPIが無いため、試して返り値の type を見るしかない。
export async function detectCapabilities() {
  const probe = new OffscreenCanvas(8, 8);
  const ctx = probe.getContext('2d');
  ctx.fillStyle = '#888';
  ctx.fillRect(0, 0, 8, 8);

  const support = {};
  for (const mime of ['image/webp', 'image/jpeg']) {
    try {
      const blob = await probe.convertToBlob({ type: mime, quality: 0.8 });
      support[mime] = blob.type === mime;
    } catch {
      support[mime] = false;
    }
  }
  return support;
}
