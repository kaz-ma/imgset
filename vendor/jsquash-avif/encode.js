/**
 * @jsquash/avif v2.1.1 の encode.js を、このプロジェクト用に調整したもの。
 * 元コード: Copyright 2020 Google Inc. / Apache License 2.0
 * https://github.com/jamsinclair/jSquash
 *
 * 変更点:
 *  1. wasm-feature-detect への依存を削除し、常にシングルスレッド版のコーデックを使う。
 *     マルチスレッド版は SharedArrayBuffer を要求し、そのためにサーバー側で
 *     COOP/COEP ヘッダを設定する必要がある。単純な静的ホスティングでは設定できないため、
 *     判定しても結局シングルスレッド版に落ちる。判定ごと外して依存を1つ減らした。
 *  2. Node / Cloudflare Workers 向けの分岐を削除（ブラウザでしか動かさないため）。
 */
import { defaultOptions } from './meta.js';
import { initEmscriptenModule } from './utils.js';

let emscriptenModule;

export async function init(module, moduleOptionOverrides) {
  const avifEncoder = await import('./codec/enc/avif_enc.js');
  emscriptenModule = initEmscriptenModule(avifEncoder.default, module, moduleOptionOverrides);
  return emscriptenModule;
}

export default async function encode(data, options = {}) {
  if (!emscriptenModule) emscriptenModule = init();

  const _options = { ...defaultOptions, ...options };
  const module = await emscriptenModule;
  const output = module.encode(
    new Uint8Array(data.data.buffer),
    data.width,
    data.height,
    _options,
  );
  if (!output) throw new Error('AVIFのエンコードに失敗しました');
  return output.buffer;
}
