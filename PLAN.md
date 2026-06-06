# HTML仕様書ビューワー開発計画

## 概要

空のワークスペースに、任意ディレクトリ内の静的HTML仕様書をPPTのように閲覧・検索できるElectronデスクトップアプリを新規構築する。
まず仕様書とMVPスコープを明文化し、その仕様を満たす安全寄りのローカルビューワーとして実装する。

## 方針

- 新規アプリとして `package.json`、`src/`、`docs/` を作成する。
- 技術は `Electron + Vite + React + TypeScript` を前提にする。デスクトップアプリとして任意のローカルディレクトリを開き、フォルダ内のHTML仕様書をPPT風に閲覧できるようにする。
- UIコンポーネントは shadcn/ui の Base UI 版を利用し、PPT風の操作感を保ちながらアクセシビリティと拡張性を確保する。
- 仕様駆動開発として、先に `docs/product-spec.md` と `docs/mvp-requirements.md` を作り、MVPの挙動・非対象・受け入れ条件を定義する。
- MVPは静的HTML/CSS/画像中心とし、HTML内JavaScriptの高度な実行、外部API通信、任意コード実行は後続検討に分ける。

## MVP仕様

- 入力単位は「1仕様書 = 1フォルダ」。Electronのディレクトリ選択ダイアログで任意フォルダを開く。
- ページ順は `manifest.json` では管理しない。人間が壊しにくいよう、仕様書フォルダ内の `index.html` を目次として扱い、目次内のHTMLリンク順をページ順として採用する。
- `index.html` に目次リンクがない場合は、同階層のHTMLファイルを自然順ソートして暫定デッキを生成する。ページタイトルは各HTMLの `<title>`、なければ最初の見出し、最後にファイル名から推定する。
- ページ一覧はサムネイルを表示せず、番号・ページタイトル・ファイル名を中心にした軽量なリストにする。
- 各ページは隔離された表示領域でブラウザ表示し、ローカルファイル読み込みは選択フォルダ配下に制限する。
- 左ペインにページ一覧、中央に現在ページ、上部に検索・ページ移動・ズーム・表示切替を置く。
- 全ページ検索では、Electron main/preload側で選択フォルダ配下のHTMLを読み、ページ別の検索候補とヒット件数を作る。
- ページ内検索では独自DOM検索を実装せず、Electron/Chromiumの `webContents.findInPage()` を利用して、ブラウザ標準の検索・スクロール・ハイライト挙動に寄せる。
- `details` や `hidden=until-found` など、ChromiumのFind in Pageが自動的に表示可能にする標準HTML構造は、そのブラウザ標準挙動に任せる。CSSの `display: none` や独自JSアコーディオンで完全に隠した領域はMVPの検索表示保証外とする。
- 検索結果を選ぶと該当ページへ移動し、`webContents.findInPage()` で一致箇所を表示して、次/前の一致へ順番に移動できるようにする。

## 主要な設計

```mermaid
flowchart LR
  Dialog["Open Folder Dialog"] --> MainProcess["Electron Main"]
  MainProcess --> FolderAccess["Selected Folder Access"]
  FolderAccess --> TocHtml["index.html TOC or HTML scan"]
  TocHtml --> DeckModel["Deck Model"]
  FolderAccess --> SearchCatalog["Search Catalog"]
  DeckModel --> SearchCatalog
  DeckModel --> Renderer["React Renderer"]
  SearchBox["Search UI"] --> SearchCatalog
  SearchCatalog --> ResultList["Result List"]
  ResultList --> Renderer
  Renderer --> FindInPage["webContents.findInPage"]
  FindInPage --> Webview["Isolated HTML View"]
```

- サンプル仕様書を `sample-decks/basic/` に置き、任意ディレクトリ読み込み・検索・表示の受け入れ基準にする。
- Electronは `contextIsolation: true`、`nodeIntegration: false` を基本にし、rendererからのファイルアクセスはpreload経由の限定APIに閉じる。
- HTML表示はMVPでは静的HTML中心とし、外部通信や選択フォルダ外の参照はブロックまたは未対応として仕様化する。
- 全ページの検索候補は初期実装ではクライアント内メモリで持つ。ページ内の正確な表示・ハイライト・折りたたみ展開は `webContents.findInPage()` とChromiumのFind in Page標準挙動に委ねる。
- UIは shadcn/ui Base UI 版のコンポーネントを基盤にし、検索ボックス、サイドバー、ツールバー、ダイアログ、リスト、リサイズ可能ペインを構成する。

## 実装ステップ

- プロダクト仕様書とMVP要件を作成する。
- Electron + Vite + React + TypeScript の雛形を作り、ビルド・Lint・型検査の最低限を整える。
- shadcn/ui Base UI 版を導入し、アプリ全体のUIプリミティブとテーマ方針を定義する。
- Electron main/preload/renderer の責務とIPC APIを仕様書に定義する。
- `DeckPage`、`DeckToc`、`SearchHit` などの型と、`index.html` 目次またはHTMLファイル一覧からデッキを生成する読み込み処理を実装する。
- PPT風レイアウトを作る: ページ一覧、ビューア、ツールバー、検索結果ペイン。
- 全ページ検索カタログと、`webContents.findInPage()` によるページ内検索、ブラウザ標準の `details` / `hidden=until-found` 表示、次/前ヒット移動を実装する。
- サンプルデッキと受け入れテスト観点を追加し、仕様書に沿って動作確認する。

## 後続候補

- コメント、レビュー状態、差分表示、発表者モード、サムネイル生成、PDF/PPTXエクスポート。
- AI活用向けに、仕様書フォルダから構造化コンテキストを出力する `spec-index.json` やMarkdown要約を生成する仕組み。
- クライアント確認用に、署名済みデスクトップ配布、または閲覧専用Web版を別途整える。
