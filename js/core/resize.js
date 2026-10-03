function drawTo(source, width, height) {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

// drawImage は縮小時に近傍の数ピクセルしか参照しないため、1/2 を超える縮小を一度に行うと
// 元画像の大半のピクセルが参照されずに捨てられ、細線が消えたりモアレが出る。
// 半分ずつ畳むことで、すべてのピクセルが平均に寄与する。
export function resizeTo(source, targetWidth) {
  const scale = targetWidth / source.width;
  const targetHeight = Math.max(1, Math.round(source.height * scale));

  let current = source;
  let width = source.width;
  let height = source.height;

  while (width / 2 > targetWidth) {
    width = Math.round(width / 2);
    height = Math.max(1, Math.round(height / 2));
    current = drawTo(current, width, height);
  }

  return drawTo(current, targetWidth, targetHeight);
}
