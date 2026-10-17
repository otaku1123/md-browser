// Minimal UI translations shared by the web app and the extension.
// (chrome.i18n is unavailable on the web build, so the browser language is used directly.)

const en = {
  openFile: 'Open file',
  openFolder: 'Open folder',
  toc: 'Table of contents',
  dropHere: 'Drop here',
  welcomeLead: 'Drag & drop a Markdown file here, or open one with the buttons above.',
  welcomeAutoReload: '"Open file" / "Open folder": changes are detected and re-rendered automatically (Chrome / Edge).',
  welcomeImages: 'Use "Open folder" to display images referenced by relative paths.',
  welcomePrivacy: 'Files are processed only in your browser and are never uploaded.',
  loadFailed: 'Failed to load: {path} ({error})',
  autoReloadOn: 'Auto-reload ON',
  autoReloadUnsupported: 'Auto-reload unavailable (dropped file)',
  updatedAt: 'updated {time}',
  noMarkdown: 'No Markdown files found: {label}',
  scanning: 'Scanning {name}/ …',
  fileGone: 'Cannot access the file (moved or deleted?): {path} ({error})',
  linkNotFound: 'Cannot open link: {href}',
  imageNotFound: 'Image not found: {ref}',
  imageNeedsFolder: 'Use "Open folder" to display images with relative paths: {ref}',
  imageAlt: '[image: {ref}]',
  mermaidFailed: 'Failed to render Mermaid diagram: {error}',
  plantumlNote: 'PlantUML (not supported yet; showing source)',
  autoReloadOff: 'Auto-reload OFF (cannot re-read the file: {error})',
  fileUnreadable: 'Auto-reload: cannot read the file (moved or deleted?)',
  setupTitle: 'One more step: allow access to local files',
  setupBody:
    'To render .md files opened from your computer (file://), Chrome requires you to turn on "Allow access to file URLs" for this extension.',
  setupStep1: 'Click "Open extension settings" below.',
  setupStep2: 'Turn on "Allow access to file URLs".',
  setupStep3: 'Drag a .md file into Chrome. It will be rendered with a table of contents and diagrams.',
  setupButton: 'Open extension settings',
  setupDone: 'File access is enabled. Drag a .md file into Chrome to view it.',
} as const;

type Key = keyof typeof en;

const ja: Record<Key, string> = {
  openFile: 'ファイルを開く',
  openFolder: 'フォルダを開く',
  toc: '目次',
  dropHere: 'ここにドロップ',
  welcomeLead: 'Markdown ファイルをここにドラッグ&ドロップするか、上のボタンから開いてください。',
  welcomeAutoReload: '「ファイルを開く」「フォルダを開く」: 更新を検知して自動で再描画します（Chrome / Edge）。',
  welcomeImages: '相対パスの画像を表示するには「フォルダを開く」を使ってください。',
  welcomePrivacy: 'ファイルはブラウザ内だけで処理され、外部に送信されることはありません。',
  loadFailed: '読み込みに失敗しました: {path} ({error})',
  autoReloadOn: '自動更新 ON',
  autoReloadUnsupported: '自動更新 非対応（ドロップしたファイル）',
  updatedAt: '{time} 更新',
  noMarkdown: 'Markdown ファイルが見つかりません: {label}',
  scanning: '{name}/ をスキャン中…',
  fileGone: 'ファイルにアクセスできません（削除・移動された可能性）: {path} ({error})',
  linkNotFound: 'リンク先を開けません: {href}',
  imageNotFound: '画像が見つかりません: {ref}',
  imageNeedsFolder: '相対パスの画像を表示するには「フォルダを開く」を使ってください: {ref}',
  imageAlt: '[画像: {ref}]',
  mermaidFailed: 'Mermaid の描画に失敗しました: {error}',
  plantumlNote: 'PlantUML（未対応のためソースを表示）',
  autoReloadOff: '自動更新 OFF（ファイルを再読込できません: {error}）',
  fileUnreadable: '自動更新: ファイルを読めません（削除・移動された可能性）',
  setupTitle: 'あと 1 ステップ: ローカルファイルへのアクセスを許可してください',
  setupBody:
    'パソコン上の .md ファイル（file://）を表示するには、この拡張機能の「ファイルの URL へのアクセスを許可する」を ON にする必要があります（Chrome の仕様）。',
  setupStep1: '下の「拡張機能の設定を開く」をクリックします。',
  setupStep2: '「ファイルの URL へのアクセスを許可する」を ON にします。',
  setupStep3: '.md ファイルを Chrome にドラッグすると、目次や図つきで表示されます。',
  setupButton: '拡張機能の設定を開く',
  setupDone: 'ファイルへのアクセスが許可されています。.md ファイルを Chrome にドラッグして表示できます。',
};

export const lang: 'ja' | 'en' = (navigator.language || 'en').toLowerCase().startsWith('ja') ? 'ja' : 'en';
const dict: Record<Key, string> = lang === 'ja' ? ja : en;

export function t(key: Key, vars: Record<string, string | number> = {}): string {
  return dict[key].replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

/** Fills elements marked with data-i18n="key" (text) / data-i18n-aria="key" (aria-label). */
export function applyI18n(root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) el.textContent = t(el.dataset.i18n as Key);
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-aria]'))
    el.setAttribute('aria-label', t(el.dataset.i18nAria as Key));
  document.documentElement.lang = lang;
}
