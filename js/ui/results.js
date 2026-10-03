import { normalizeName } from '../core/naming.js';

const FORMAT_LABEL = { 'image/webp': 'WebP', 'image/jpeg': 'JPEG', 'image/avif': 'AVIF' };

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function createResults(onRename) {
  const container = document.getElementById('results');
  const template = document.getElementById('result-card-template');
  const cards = new Map();

  function build(entry) {
    const root = template.content.firstElementChild.cloneNode(true);
    const els = {
      root,
      thumb: root.querySelector('.card-thumb'),
      original: root.querySelector('.card-original'),
      nameInput: root.querySelector('.card-name-input'),
      errors: root.querySelector('.card-errors'),
      tbody: root.querySelector('.card-table tbody'),
      code: root.querySelector('.card-code'),
      copy: root.querySelector('.card-copy'),
    };

    els.nameInput.value = entry.baseName;
    els.nameInput.addEventListener('input', () => {
      // 入力はそのままHTMLの属性値になるため、必ず正規化を通す。
      // これを外すと XSS と、ファイル名として壊れた文字（/ や ?）の両方が通る。
      const safe = normalizeName(`${els.nameInput.value}.x`);
      if (els.nameInput.value !== safe) {
        const pos = els.nameInput.selectionStart;
        els.nameInput.value = safe;
        els.nameInput.setSelectionRange(pos, pos);
      }
      onRename(entry.id, safe);
    });

    els.copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(entry.html);
        els.copy.textContent = 'コピーしました';
      } catch {
        // 権限拒否やフォーカス喪失で失敗する。何も起きないと故障に見えるので、
        // 失敗を伝えたうえでコード部分を選択状態にして手動コピーへ誘導する。
        els.copy.textContent = 'コピーできません';
        const range = document.createRange();
        range.selectNodeContents(els.code);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
      setTimeout(() => { els.copy.textContent = 'コピー'; }, 2000);
    });

    container.append(root);
    cards.set(entry.id, els);
    return els;
  }

  function update(entry) {
    const els = cards.get(entry.id) ?? build(entry);

    const dimensions = entry.source.width > 0
      ? `　${entry.source.width}×${entry.source.height}`
      : '';
    els.original.textContent =
      `${entry.source.originalFileName}${dimensions}　${formatBytes(entry.source.originalBytes)}`;

    if (entry.errors.length) {
      els.errors.hidden = false;
      els.errors.textContent = entry.errors.join(' / ');
    } else {
      els.errors.hidden = true;
    }

    const smallest = entry.named[0];
    if (smallest && els.thumb.dataset.for !== smallest.fileName) {
      if (els.thumb.src) URL.revokeObjectURL(els.thumb.src);
      els.thumb.src = URL.createObjectURL(smallest.blob);
      els.thumb.dataset.for = smallest.fileName;
    }

    // 生成物が無い（対応外の形式・読み込み失敗）場合は、表とHTML欄を出さない。
    // 空の表と空のコードブロックが並ぶと、壊れているのか結果が無いのか判別できない。
    els.root.setAttribute('aria-label', `${entry.source.originalFileName} の書き出し結果`);

    const hasOutputs = entry.named.length > 0;
    els.root.querySelector('.card-table-wrap').hidden = !hasOutputs;
    els.root.querySelector('.card-html').hidden = !hasOutputs;
    els.root.querySelector('.card-name').hidden = !hasOutputs;
    if (!hasOutputs) {
      els.tbody.replaceChildren();
      return;
    }

    els.tbody.replaceChildren(...entry.named.map((output) => {
      const cut = Math.round((1 - output.bytes / entry.source.originalBytes) * 1000) / 10;
      const tr = document.createElement('tr');
      for (const [text, cls] of [
        [output.fileName, ''],
        [String(output.width), ''],
        [FORMAT_LABEL[output.format] ?? output.format, ''],
        [formatBytes(output.bytes), ''],
        // 元が小さい画像では出力のほうが大きくなることがあり、
        // そのまま「−」を付けると「−-3.2%」と二重符号になる。
        [cut >= 0 ? `−${cut}%` : `+${-cut}%`, 'cut'],
      ]) {
        const td = document.createElement('td');
        td.textContent = text;
        if (cls) td.className = cls;
        tr.append(td);
      }
      return tr;
    }));

    els.code.textContent = entry.html;
  }

  return {
    update,
    clear() {
      for (const els of cards.values()) {
        if (els.thumb.src) URL.revokeObjectURL(els.thumb.src);
      }
      cards.clear();
      container.replaceChildren();
    },
  };
}
