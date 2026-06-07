# SpecDeck

PPT-like viewer and editor for HTML specifications.

ローカルフォルダ内のHTML仕様書を、デッキ形式で閲覧・検索するElectronデスクトップアプリです。`index.html` や `menu.json` からページ一覧を作り、ページ移動、ズーム、全文検索、最近使ったフォルダの再オープンを提供します。

## 主な機能

- フォルダを開いてHTML仕様書を1冊のデッキとして表示
- `index.html` のリンク、または `menu.json` からページ一覧を生成
- 目次がない場合はフォルダ配下のHTMLを再帰スキャン
- アンカー付きリンクを同一ページの子項目として表示
- 全ページ検索とページ内ハイライト
- 前後ページ移動、ズーム、サイドバー表示切替、集中モード
- ローカルHTTPサーバーを `127.0.0.1` に立てて選択フォルダを配信

## セットアップ

```sh
npm install
```

## 開発

```sh
npm run dev
```

Viteのrenderer、Electron main/preloadのTypeScriptビルド、Electronアプリ起動をまとめて実行します。

## ビルドと起動

```sh
npm run build
npm start
```

`npm start` は事前に `npm run build` を実行します。

## 配布用アプリの書き出し

```sh
npm run dist
```

macOS では `release/` に `.dmg` と `.zip` が生成されます。インストーラを作らず `.app` だけ確認する場合:

```sh
npm run dist:dir
```

生成物は `release/mac-arm64/SpecDeck.app`（Apple Silicon）または `release/mac/SpecDeck.app`（Intel）です。

未署名のビルドは macOS で初回起動時に Gatekeeper の警告が出る場合があります。右クリック →「開く」で起動できます。

## テスト

```sh
npm test
npm run lint
npm run typecheck
npm run test:e2e
npm run test:smoke
```

`test:e2e` と `test:smoke` はビルド済みElectronアプリを使います。

## デッキの作り方

### `index.html` を使う場合

選択フォルダ直下の `index.html` に含まれるHTMLリンクをページとして扱います。`index.html` 自体はページ一覧に含めません。

```html
<a href="intro.html">イントロ</a>
<a href="chapter-1.html#overview">1章: 概要</a>
<a href="chapter-1.html#details">1章: 詳細</a>
```

同じHTMLファイルへのアンカー付きリンクは、1ページに統合されて子項目として表示されます。

### `menu.json` を使う場合

`menu.json` がある場合は、そこからページ一覧を読み込みます。

```json
{
  "pages": [
    { "href": "intro.html", "title": "イントロ", "num": "1" },
    { "href": "chapter-1.html#overview", "title": "概要", "num": "2.1" }
  ]
}
```

### 目次がない場合

`index.html` または有効な `menu.json` がない場合、フォルダ配下の `.html` / `.htm` ファイルを再帰スキャンして自然順でページ化します。

## サンプル

動作確認用のサンプルデッキがあります。

- `sample-decks/basic`
- `sample-decks/file-scan`
- `sample-decks/menu-config`

アプリ起動後、これらのフォルダを選択して確認できます。

## プロジェクト構成

```text
src/main/       Electron mainプロセス、デッキ解析、検索、ローカルサーバー
src/preload/    rendererへ公開する限定API
src/renderer/   React UI
src/shared/     main/renderer共通型とユーティリティ
sample-decks/   手動確認用のHTMLデッキ
docs/           仕様書とMVP要件
e2e/            Playwright E2Eテスト
scripts/        Electron確認・スモークテスト用スクリプト
```

## 関連ドキュメント

- [プロダクト仕様書](docs/product-spec.md)
- [MVP要件定義](docs/mvp-requirements.md)
