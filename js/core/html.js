// ブラウザは <source> を上から順に評価し、表示できる最初の形式を使う。
// 圧縮率の高い順に並べないと、対応しているのに重い形式が選ばれてしまう。
const SOURCE_ORDER = ['image/avif', 'image/webp'];

function escapeAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export function buildPictureHtml(outputs, settings) {
  if (outputs.length === 0) return '';

  const byFormat = new Map();
  for (const output of outputs) {
    if (!byFormat.has(output.format)) byFormat.set(output.format, []);
    byFormat.get(output.format).push(output);
  }
  for (const list of byFormat.values()) list.sort((a, b) => a.width - b.width);

  const sources = [];
  for (const mime of SOURCE_ORDER) {
    const list = byFormat.get(mime);
    if (!list?.length) continue;
    const srcset = list.map((o) => `${escapeAttr(o.fileName)} ${o.width}w`).join(', ');
    sources.push(`  <source type="${mime}" srcset="${srcset}" sizes="${escapeAttr(settings.sizesAttr)}">`);
  }

  // <img> の src は1つしか指定できないので、フォールバックは最大幅の1枚だけでよい。
  // 複数サイズを用意する役目は srcset が担う。
  const jpeg = byFormat.get('image/jpeg');
  const candidates = jpeg?.length ? jpeg : outputs;
  const fallback = candidates.reduce((a, b) => (b.width > a.width ? b : a));

  // width/height が無いと、画像が届くまで高さ0として扱われ、
  // 読み込み完了時に下の文章が押し出される（レイアウトシフト／CLS）。
  const img = `  <img src="${escapeAttr(fallback.fileName)}" alt="" width="${fallback.width}" height="${fallback.height}" loading="lazy" decoding="async">`;

  return ['<picture>', ...sources, img, '</picture>'].join('\n');
}
