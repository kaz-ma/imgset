# imgset

**srcset用の画像とHTML、ドラッグ1回で全部出す。**

画像をドラッグすると、`srcset` 用の複数サイズを WebP / AVIF / JPEG で書き出し、
対応する `<picture>` タグまで生成します。

**画像はブラウザの外に出ません。** すべての処理がブラウザ内で完結し、サーバーへの送信は一切ありません。
開発者ツールのネットワークタブを開けば、ご自分で確認できます。

---

## なぜ作ったか

レスポンシブ対応をきちんとやろうとすると、画像1枚につきこれだけの作業が発生します。

- 320 / 640 / 1024 / 1920 の4サイズに縮小する
- WebP と AVIF に変換する
- 古いブラウザ用に JPEG も残す
- ファイル名を規則的に揃える
- `<picture>` タグを手で書く

画像10枚なら90ファイル。1枚ずつ設定して書き出していたら1時間では終わりません。
だから多くの現場で、srcset対応は「やったほうがいいのは分かっているが、後回し」になります。

既存のツールを調べたところ、**1枚から複数サイズを一度に書き出すもの**も、
**HTMLタグまで生成するもの**も見つかりませんでした。画像を作った後にHTMLを書く手間が
残っている限り、作業は終わりません。

---

## 使い方

1. 画像をドラッグ＆ドロップ（クリックして選択、Ctrl+Vでの貼り付けも可）
2. 設定はそのままで構いません
3. ZIPでダウンロードし、生成されたHTMLをコピーして貼る

出力例：

```html
<picture>
  <source type="image/avif" srcset="hero-320.avif 320w, hero-640.avif 640w, hero-1024.avif 1024w, hero-1920.avif 1920w" sizes="100vw">
  <source type="image/webp" srcset="hero-320.webp 320w, hero-640.webp 640w, hero-1024.webp 1024w, hero-1920.webp 1920w" sizes="100vw">
  <img src="hero-1920.jpg" alt="" width="1920" height="1080" loading="lazy" decoding="async">
</picture>
```

---

## 実装上の注意点（同じ実装をする人向け）

### Canvas の `toBlob('image/avif')` は信用できない

ブラウザで AVIF を書き出そうとして `convertToBlob({ type: 'image/avif' })` を呼ぶと、
**エラーを出さずに PNG が返ってくることがあります。**

実測したところ、AVIF を要求したときと PNG を要求したときで、
**処理時間もファイルサイズも1バイト単位で一致**していました。

| 幅 | 要求した形式 | 時間 | 容量 | 実際に返った type |
|---|---|---|---|---|
| 1920 | WebP | 427 ms | 538.4 KB | `image/webp` |
| 1920 | **AVIF** | 1177 ms | **4500.4 KB** | **`image/png`** |
| 1920 | PNG | 1174 ms | 4499.7 KB | `image/png` |

仕様上、非対応の形式を要求されたときは PNG にフォールバックすることになっており、
**事前に対応状況を問い合わせる API はありません。**

対策は、返ってきた Blob の `type` を検証することだけです。

```js
const blob = await canvas.convertToBlob({ type: mime, quality });
if (blob.type !== mime) throw new Error(`${mime} は書き出せません（${blob.type} が返りました）`);
```

このツールは AVIF を Canvas ではなく WebAssembly のエンコーダ（libavif）で処理しています。

### EXIF の Orientation を捨てる前に適用する

スマートフォンで縦向きに撮った写真は、**ピクセルは横向きのまま保存され**、
「表示時に回転せよ」という指示が EXIF に入っているだけです。
EXIF を単純に削除すると、縦向きの写真が横倒しで出力されます。

`createImageBitmap(file, { imageOrientation: 'from-image' })` を使うとブラウザが
回転を適用してくれるため、EXIF を自力で解析する必要はありません。
ただし**回転すると幅と高さが入れ替わる**ので、寸法は必ずデコード後の値を使ってください。

### 大きく縮小するときは段階的に

`drawImage` は縮小時に近傍の数ピクセルしか参照しないため、
1/2 を超える縮小を一度に行うと元画像の大半のピクセルが無視されます。
半分ずつ畳んでから最終サイズに合わせると、全ピクセルが平均に寄与します。

---

## 技術構成

- **ビルド不要。** 素の HTML / CSS / JavaScript（ES Modules）
- エンコードは Web Worker で並列処理（UIを固めないため）
- WebP / JPEG は Canvas のネイティブエンコーダ
- AVIF は WebAssembly（任意指定。初回のみ約3.5MBの読み込みが必要で、書き出しに数秒かかります）

ローカルで動かす場合は、`src` で静的サーバーを立ててください
（ES Modules は `file://` では動作しません）。

```bash
python -m http.server 8000
```

---

## 同梱しているもの

外部CDNへの依存を持たないため、以下をリポジトリに同梱しています。

| ライブラリ | 用途 | ライセンス |
|---|---|---|
| [jSquash](https://github.com/jamsinclair/jSquash)（`@jsquash/avif` の一部） | AVIFエンコード | Apache License 2.0 / Copyright 2020 Google Inc. |
| [JSZip](https://stuk.github.io/jszip/) | ZIP生成 | MIT License |

`vendor/jsquash-avif/encode.js` は、マルチスレッド版の判定を外すために改変しています
（マルチスレッド版は `SharedArrayBuffer` を要求し、COOP/COEP ヘッダの設定が必要なため）。
改変内容はファイル先頭のコメントに記載しています。
