import { detectCapabilities } from './core/capability.js';
import { buildFileNames } from './core/pipeline.js';
import { makeNamer, makeUniquifier } from './core/naming.js';
import { buildPictureHtml } from './core/html.js';
import { createPool } from './core/pool.js';
import { buildZip } from './core/zip.js';
import { initDropzone } from './ui/dropzone.js';
import { initSettings } from './ui/settings.js';
import { createProgress } from './ui/progress.js';
import { createResults, formatBytes } from './ui/results.js';

const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']);
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const SOFT_FILE_COUNT = 50;
const MAX_ZIP_BYTES = 1024 * 1024 * 1024;

const entries = [];
let settings;
let pool = null;
let nextId = 0;
let busy = false;

const settingsUI = initSettings(handleSettingsChange);
settings = settingsUI.read();

const progress = createProgress(() => pool?.cancel());
const results = createResults(handleRename);

const dropzone = document.getElementById('dropzone');
const settingsPanel = document.getElementById('settings');
const bulk = document.getElementById('bulk');
const bulkSummary = document.getElementById('bulk-summary');
const notice = document.getElementById('capability-warning');

initDropzone(dropzone, document.getElementById('file-input'), handleFiles);

document.getElementById('zip-btn').addEventListener('click', downloadZip);
document.getElementById('copy-all-btn').addEventListener('click', copyAllHtml);
document.getElementById('clear-btn').addEventListener('click', clearAll);

checkCapabilities();
validateFormats();

function showNotice(text) {
  notice.hidden = !text;
  notice.textContent = text ?? '';
}

async function checkCapabilities() {
  let support;
  try {
    support = await detectCapabilities();
  } catch {
    // OffscreenCanvas 自体が無い環境ではここで例外になる。
    // 握りつぶすと警告が出ないまま全件エラーになるので、必ず拾う。
    support = { 'image/webp': false, 'image/jpeg': false };
  }

  const webp = document.getElementById('set-webp');
  const jpeg = document.getElementById('set-jpeg');

  if (!support['image/jpeg'] && !support['image/webp']) {
    showNotice('このブラウザは画像の書き出しに対応していません。Chrome、Edge、Firefox の最新版をお使いください。');
    dropzone.setAttribute('aria-disabled', 'true');
    return;
  }
  if (!support['image/webp']) {
    webp.checked = false;
    webp.disabled = true;
    showNotice('このブラウザはWebPの書き出しに対応していません。JPEGのみで出力します。');
  }
  if (!support['image/jpeg']) {
    jpeg.checked = false;
    jpeg.disabled = true;
  }
  settings = settingsUI.read();
  validateFormats();
}

// 両方オフにすると1ファイルも生成されない。黙って空の結果が出るのを防ぐ。
function validateFormats() {
  const none = !settings.formats.webp && !settings.formats.jpegFallback && !settings.formats.avif;
  if (none) showNotice('出力する形式が1つも選ばれていません。WebP・AVIF・JPEGのいずれかを有効にしてください。');
  else if (notice.textContent.startsWith('出力する形式')) showNotice(null);
  return !none;
}

function setBusy(value) {
  busy = value;
  dropzone.setAttribute('aria-busy', String(value));
  settingsPanel.querySelectorAll('input, select').forEach((el) => {
    if (el.dataset.lockedByCapability === 'true') return;
    el.disabled = value;
  });
}

function rejectionReason(file) {
  if (!ACCEPTED.has(file.type)) return '対応していない形式です';
  if (file.size > MAX_FILE_BYTES) return `ファイルが大きすぎます（上限 ${formatBytes(MAX_FILE_BYTES)}）`;
  return null;
}

async function handleFiles(files) {
  if (busy) {
    showNotice('処理中です。完了してから追加してください。');
    return;
  }
  if (!validateFormats()) return;

  if (entries.length + files.length > SOFT_FILE_COUNT) {
    const ok = window.confirm(
      `${SOFT_FILE_COUNT}枚を超えています。処理に時間がかかる可能性がありますが続けますか。`,
    );
    if (!ok) return;
  }

  await processAll(files);
}

// Workerの起動は安くない。バッチごとに作り直すと、6個分の起動コストを毎回払うことになる。
// 実測で、使い回しに変えるまで並列化の効果が1.44倍に埋もれていた。
function getPool() {
  if (!pool) pool = createPool(new URL('./worker/encoder.worker.js', import.meta.url));
  return pool;
}

async function processAll(files) {
  setBusy(true);
  const workers = getPool();
  const namer = makeNamer();

  // 並列処理は終わる順がばらつく。先に投入順で枠を作っておかないと、
  // 表示順も連番（image-01, image-02）も実行のたびに変わってしまう。
  // 受け付けられなかったファイルも枠を作り、理由をカードに残す（黙って消さない）。
  const slots = files.map((file) => {
    const reason = rejectionReason(file);
    const entry = {
      id: nextId++,
      file,
      baseName: namer(file.name),
      source: { originalFileName: file.name, originalBytes: file.size, width: 0, height: 0 },
      outputs: [],
      errors: reason ? [reason] : [],
      skipped: Boolean(reason),
      named: [],
      html: '',
    };
    entries.push(entry);
    return entry;
  });

  const targets = slots.filter((entry) => !entry.skipped);
  const total = targets.length;
  let done = 0;

  if (total === 0) {
    rebuildAll();
    setBusy(false);
    return;
  }

  progress.start(total);

  await Promise.allSettled(targets.map(async (entry) => {
    try {
      const result = await workers.run(entry.file, settings);
      entry.source = result.source;
      entry.outputs = result.outputs;
      entry.errors = result.errors;
    } catch (error) {
      entry.errors = [error.message];
    } finally {
      done += 1;
      progress.update(done, total, entry.file.name);
    }
  }));

  rebuildAll();
  progress.done();
  setBusy(false);
}

// ファイル名の重複はバッチ全体で見る必要があるため、1枚変えたら全部組み直す。
// 再エンコードは起きない（Blobは使い回す）ので、実測で1ミリ秒未満。
function rebuildAll() {
  const uniquify = makeUniquifier();
  for (const entry of entries) {
    entry.named = buildFileNames(entry.outputs, entry.baseName, settings, uniquify);
    entry.html = buildPictureHtml(entry.named, settings);
    results.update(entry);
  }
  updateBulk();
}

function handleRename(id, baseName) {
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;
  entry.baseName = baseName || 'image';
  rebuildAll();
}

function handleSettingsChange(next) {
  const needsReencode =
    JSON.stringify(next.widths) !== JSON.stringify(settings.widths) ||
    JSON.stringify(next.formats) !== JSON.stringify(settings.formats) ||
    next.quality !== settings.quality ||
    next.noUpscale !== settings.noUpscale;

  settings = next;
  validateFormats();

  if (entries.length === 0 || busy) return;
  if (!needsReencode) {
    rebuildAll();
    return;
  }
  if (!validateFormats()) return;

  const files = entries.map((e) => e.file);
  entries.length = 0;
  results.clear();
  processAll(files);
}

function updateBulk() {
  const all = entries.flatMap((e) => e.named);
  if (all.length === 0) {
    bulk.hidden = true;
    return;
  }
  const before = entries
    .filter((e) => e.named.length > 0)
    .reduce((sum, e) => sum + e.source.originalBytes, 0);
  const after = all.reduce((sum, o) => sum + o.bytes, 0);
  bulk.hidden = false;
  bulkSummary.textContent =
    `${entries.length}枚 → ${all.length}ファイル生成　元の合計 ${formatBytes(before)} ／ 生成した全ファイルの合計 ${formatBytes(after)}`;
}

async function copyText(text, button, label) {
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'コピーしました';
  } catch {
    // 権限拒否やフォーカス喪失で失敗する。黙って何も起きないのが最悪なので、
    // 失敗を伝えたうえで手動コピーの導線を残す。
    button.textContent = 'コピーできませんでした';
    showNotice('クリップボードへのコピーが拒否されました。コード部分を選択して手動でコピーしてください。');
  }
  setTimeout(() => { button.textContent = label; }, 2000);
}

async function downloadZip() {
  const items = entries.flatMap((e) => e.named);
  if (items.length === 0) return;

  const total = items.reduce((sum, o) => sum + o.bytes, 0);
  if (total > MAX_ZIP_BYTES) {
    showNotice('ZIPが大きすぎます。枚数を分けてください。');
    return;
  }

  const button = document.getElementById('zip-btn');
  button.disabled = true;
  progress.message('ZIPを作成中…');
  try {
    const blob = await buildZip(items, (percent) => progress.setFill(percent));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'imgset.zip';
    a.click();
    // click() の直後に revoke すると、ダウンロードが始まる前にデータが消えて失敗しうる。
    // 保存はブラウザ側の非同期処理なので、十分な猶予を置いてから解放する。
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    showNotice(`ZIPの作成に失敗しました：${error.message}`);
  } finally {
    button.disabled = false;
    progress.done();
  }
}

async function copyAllHtml() {
  const html = entries.map((e) => e.html).filter(Boolean).join('\n\n');
  if (!html) return;
  await copyText(html, document.getElementById('copy-all-btn'), 'すべてのHTMLをコピー');
}

function clearAll() {
  entries.length = 0;
  results.clear();
  updateBulk();
}
