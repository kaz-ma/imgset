import { resizeTo } from './resize.js';
import { encodeVerified, encodeAvif } from './encode.js';
import { extensionFor } from './capability.js';
import { applyTemplate } from './naming.js';

export const DEFAULT_SETTINGS = {
  widths: [320, 640, 1024, 1920],
  formats: { avif: false, webp: true, jpegFallback: true },
  quality: 80,
  noUpscale: true,
  nameTemplate: '{name}-{width}',
  sizesAttr: '100vw',
};

export async function processImage(file, settings = DEFAULT_SETTINGS) {
  // from-image でブラウザがEXIFのOrientationを適用する。以降の寸法は必ずこの
  // bitmap の値を使う。元ファイルのヘッダ値は回転前なので縦横が逆になる。
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });

  const source = {
    file,
    originalFileName: file.name,
    originalBytes: file.size,
    width: bitmap.width,
    height: bitmap.height,
  };

  let widths = [...new Set(settings.widths)].sort((a, b) => a - b);
  if (settings.noUpscale) {
    const fitted = widths.filter((w) => w <= bitmap.width);
    widths = fitted.length > 0 ? fitted : [bitmap.width];
  }
  const maxWidth = widths[widths.length - 1];

  const quality = settings.quality / 100;
  const outputs = [];
  const errors = [];
  const disabled = new Set();

  for (const width of widths) {
    const canvas = resizeTo(bitmap, width);

    const formats = [];
    if (settings.formats.avif) formats.push('image/avif');
    if (settings.formats.webp) formats.push('image/webp');
    if (settings.formats.jpegFallback && width === maxWidth) formats.push('image/jpeg');

    for (const mime of formats) {
      if (disabled.has(mime)) continue;
      try {
        const blob = mime === 'image/avif'
          ? await encodeAvif(canvas, settings.quality)
          : await encodeVerified(canvas, mime, quality);
        outputs.push({
          width: canvas.width,
          height: canvas.height,
          format: mime,
          blob,
          bytes: blob.size,
        });
      } catch (error) {
        // 1形式の失敗で全体を止めない。その形式だけ以降スキップする。
        disabled.add(mime);
        errors.push(error.message);
      }
    }
  }

  bitmap.close();
  return { source, outputs, errors };
}

// 出力名を変えるたびに再エンコードしていたら数秒待たされて使い物にならない。
// Blob はそのまま使い回し、ファイル名だけ組み立て直す。
export function buildFileNames(outputs, baseName, settings, uniquify) {
  return outputs.map((output) => {
    const stem = applyTemplate(settings.nameTemplate, {
      name: baseName,
      width: output.width,
      height: output.height,
      quality: settings.quality,
    });
    // 重複判定は拡張子まで含めて行う。stem だけで判定すると
    // hero-1920.webp と hero-1920.jpg が衝突扱いになり、HTMLの参照先とずれる。
    return { ...output, fileName: uniquify(`${stem}.${extensionFor(output.format)}`) };
  });
}
