// Web公開を前提にするため、全角・空白・記号を落として URL で安全な形に揃える。
// 日本語名は全部落ちて空文字になるので、その扱いは makeNamer が引き受ける。
export function normalizeName(fileName) {
  return fileName
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// 正規化で空になった名前には投入順の連番を割り当てる。
// 「写真.jpg」も「画像.jpg」も空になるため、連番がないと区別できなくなる。
export function makeNamer() {
  let fallbackCount = 0;
  return (fileName) => {
    const slug = normalizeName(fileName);
    if (slug) return slug;
    fallbackCount += 1;
    return `image-${String(fallbackCount).padStart(2, '0')}`;
  };
}

export function applyTemplate(template, values) {
  return template.replace(/\{(name|width|height|quality)\}/g, (_, key) => String(values[key]));
}

export function makeUniquifier() {
  const seen = new Set();
  return (name) => {
    if (!seen.has(name)) {
      seen.add(name);
      return name;
    }
    const dot = name.lastIndexOf('.');
    const stem = dot === -1 ? name : name.slice(0, dot);
    const ext = dot === -1 ? '' : name.slice(dot);
    let n = 2;
    while (seen.has(`${stem}-${n}${ext}`)) n += 1;
    const unique = `${stem}-${n}${ext}`;
    seen.add(unique);
    return unique;
  };
}
