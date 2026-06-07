export type EditorMode = "view" | "edit" | "source"

/** body を起点にした子インデックスの配列で要素位置を一意に表す */
export type ElementPath = number[]

export interface SelectionInfo {
  /** body 起点の子インデックス列 */
  path: ElementPath
  /** タグ名(小文字) */
  tagName: string
  /** id 属性(あれば) */
  id: string | null
  /** class 属性(あれば) */
  className: string | null
  /** テキスト断片(プレビュー用) */
  textPreview: string
  /** img 要素か */
  isImage: boolean
  /** 注釈ラッパーを考慮した画像の表示幅 */
  imageDisplayWidth: string | null
  /** video 要素か */
  isVideo: boolean
  /** audio 要素か */
  isAudio: boolean
  /** テキストを直接持つ編集向き要素か */
  isTextEditable: boolean
  /** 自身または祖先がロックされ、編集不可か */
  isLocked: boolean
  /** 選択要素自身にロック属性があるか */
  isSelfLocked: boolean
  /** 祖先のロックによって編集不可か */
  isLockedByAncestor: boolean
  /** 表(table)の内部にある要素か */
  isInTable: boolean
  /** 囲っている details の開閉状態(details 配下でなければ null) */
  detailsOpen: boolean | null
  /** カラムブロック(.he-cols)の内部にある要素か */
  isInColumns: boolean
  /** グリッドブロック(.he-grid)の内部にある要素か */
  isInGrid: boolean
  /** グリッドブロックの現在の列数 */
  gridColumnCount: number | null
  /** 選択要素の属性スナップショット */
  attributes: Record<string, string>
  /** 選択要素の編集対象スタイル状態 */
  styleState: Record<string, StylePropState>
  /** パンくず(祖先 → 自身) */
  breadcrumb: BreadcrumbItem[]
}

export type StyleTokenKind = "color" | "size" | "unknown"

export interface StyleToken {
  name: `--${string}`
  value: string
  kind: StyleTokenKind
}

export interface StyleCatalog {
  all: StyleToken[]
  colors: StyleToken[]
  sizes: StyleToken[]
}

export type StylePropSource = "inline" | "author" | "unset"

export interface StylePropState {
  prop: string
  inlineValue: string
  computedValue: string
  source: StylePropSource
}

export interface BreadcrumbItem {
  label: string
  path: ElementPath
}

export interface OutlineNode {
  path: ElementPath
  tagName: string
  label: string
  textPreview: string
  directTextPreview: string
  isLocked: boolean
  children: OutlineNode[]
}

export interface LoadedFile {
  text: string
  /** File System Access API のハンドル(対応環境のみ) */
  handle: FileSystemFileHandle | null
  name: string
}

export type SaveResult =
  | { kind: "overwritten"; name: string; handle: FileSystemFileHandle | null }
  | { kind: "downloaded"; name: string }
  | { kind: "cancelled" }
