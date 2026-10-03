export async function buildZip(items, onProgress) {
  if (!window.JSZip) throw new Error('JSZip が読み込まれていません');

  const zip = new window.JSZip();
  for (const item of items) {
    zip.file(item.fileName, item.blob);
  }

  // DEFLATE をかけてもほとんど縮まない（中身は圧縮済みの画像）。
  // CPU時間の無駄なので無圧縮で格納する。
  return zip.generateAsync(
    { type: 'blob', compression: 'STORE' },
    (meta) => onProgress?.(meta.percent),
  );
}
