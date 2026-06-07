export type BlockGroupId = "html" | "layout" | "custom"

export interface BlockGroup {
  id: BlockGroupId
  label: string
}

/** ブロックパレットの表示グループ（大まかな分類） */
export const BLOCK_GROUPS: BlockGroup[] = [
  { id: "html", label: "HTML要素" },
  { id: "layout", label: "レイアウト要素" },
  { id: "custom", label: "カスタム要素" },
]

export interface BlockTemplate {
  id: string
  label: string
  /** 挿入する HTML 断片(単一ルート要素) */
  html: string
  group: BlockGroupId
}

/** ブロックパレット。HTML ページでよく使う要素を中心に用意 */
export const BLOCK_TEMPLATES: BlockTemplate[] = [
  { id: "h2", label: "見出し (H2)", html: "<h2>見出し</h2>", group: "html" },
  { id: "h3", label: "小見出し (H3)", html: "<h3>小見出し</h3>", group: "html" },
  {
    id: "p",
    label: "段落",
    html: "<p>ここに本文を入力してください。</p>",
    group: "html",
  },
  {
    id: "ul",
    label: "箇条書きリスト",
    html: "<ul><li>項目 1</li><li>項目 2</li><li>項目 3</li></ul>",
    group: "html",
  },
  {
    id: "ol",
    label: "番号付きリスト",
    html: "<ol><li>手順 1</li><li>手順 2</li><li>手順 3</li></ol>",
    group: "html",
  },
  {
    id: "table",
    label: "表",
    html: '<table border="1" cellpadding="6" style="border-collapse:collapse"><thead><tr><th>項目</th><th>説明</th></tr></thead><tbody><tr><td>項目1</td><td>説明1</td></tr><tr><td>項目2</td><td>説明2</td></tr></tbody></table>',
    group: "html",
  },
  {
    id: "blockquote",
    label: "引用",
    html: "<blockquote><p>引用文をここに記載します。</p></blockquote>",
    group: "html",
  },
  {
    id: "img",
    label: "画像",
    html: '<img alt="" style="max-width:100%;height:auto" src="./placeholder.png" />',
    group: "html",
  },
  {
    id: "video",
    label: "動画",
    html: '<video controls preload="metadata" style="max-width:100%;height:auto" src=""></video>',
    group: "html",
  },
  {
    id: "audio",
    label: "音声",
    html: '<audio controls preload="metadata" src=""></audio>',
    group: "html",
  },
  {
    id: "details",
    label: "詳細（開閉）",
    html: "<details><summary>詳細を表示</summary><p>ここに詳細内容を入力してください。</p></details>",
    group: "html",
  },
  { id: "hr", label: "区切り線", html: "<hr />", group: "html" },
  {
    id: "div",
    label: "コンテナ (div)",
    html: "<div><p>コンテナの中身</p></div>",
    group: "html",
  },
  {
    id: "columns",
    label: "カラム",
    html: '<div class="he-cols"><div class="he-col"><h4>左カラム</h4><p>左側の内容を入力してください。</p></div><div class="he-col"><h4>右カラム</h4><p>右側の内容を入力してください。</p></div></div>',
    group: "layout",
  },
  {
    id: "grid",
    label: "グリッド",
    html: '<div class="he-grid"><div class="he-card"><h4>項目 1</h4><p>説明を入力してください。</p></div><div class="he-card"><h4>項目 2</h4><p>説明を入力してください。</p></div><div class="he-card"><h4>項目 3</h4><p>説明を入力してください。</p></div><div class="he-card"><h4>項目 4</h4><p>説明を入力してください。</p></div></div>',
    group: "layout",
  },
  {
    id: "card",
    label: "カード",
    html: '<article class="he-card"><h4>カード見出し</h4><p>カード本文を入力してください。</p></article>',
    group: "layout",
  },
  {
    id: "note",
    label: "注記",
    html: "<aside style=\"margin:16px 0;padding:12px 16px;border-left:4px solid #94a3b8;background:#f8fafc;border-radius:8px\"><p>補足や注記をここに記載します。</p></aside>",
    group: "custom",
  },
  {
    id: "callout-info",
    label: "コールアウト（情報）",
    html: '<aside class="he-callout he-callout-info"><h4>情報</h4><p>補足情報を入力してください。</p></aside>',
    group: "custom",
  },
  {
    id: "callout-warning",
    label: "コールアウト（警告）",
    html: '<aside class="he-callout he-callout-warning"><h4>警告</h4><p>注意点を入力してください。</p></aside>',
    group: "custom",
  },
  {
    id: "callout-success",
    label: "コールアウト（成功）",
    html: '<aside class="he-callout he-callout-success"><h4>成功</h4><p>良い状態や完了事項を入力してください。</p></aside>',
    group: "custom",
  },
]

/** 表示順どおりにグループ化したテンプレート一覧 */
export function blockTemplatesByGroup(): {
  group: BlockGroup
  templates: BlockTemplate[]
}[] {
  return BLOCK_GROUPS.map((group) => ({
    group,
    templates: BLOCK_TEMPLATES.filter((tpl) => tpl.group === group.id),
  })).filter((entry) => entry.templates.length > 0)
}
