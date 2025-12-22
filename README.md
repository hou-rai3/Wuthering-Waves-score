https://hou-rai3.github.io/Wuthering-Waves-score/

# Echo OCR Scorer

Wuthering Waves のゲーム画面から「音骸（Echo）」のステータスを自動読み込みし、スコアを算出する Web アプリケーション。

## 機能

- **画像入力**: クリップボードペースト（Ctrl+V）またはドラッグ&ドロップ
- **自動ROI抽出**: 画面比率から音骸情報領域を自動特定
- **OCR処理**: Tesseract.js で日本語・数字を認識
- **デバッグモード**: 二値化画像と OCR 生テキストを表示
- **エラーハンドリング**: トースト通知で処理状況を表示

## スタック

- **Framework**: React 18 + TypeScript
- **Build**: Vite
- **Styling**: Tailwind CSS
- **OCR**: Tesseract.js (日本語対応)
- **画像処理**: Canvas API
- **ホスティング**: GitHub Pages

## セットアップ

```bash
npm install
npm run dev
```

## ビルド

```bash
npm run build
```

## 構成

```
src/
  App.tsx                 # メインアプリケーション
  main.tsx               # エントリーポイント
  index.css              # Tailwind スタイル
  utils/
    imageProcessor.ts    # ROI抽出・二値化ロジック
  hooks/
    useOcr.ts            # Tesseract.js フック
  components/
    DebugPanel.tsx       # デバッグUI
```

## 開発

- `npm run dev`: ローカル開発サーバー起動
- `npm run build`: 本番ビルド
- `npm run preview`: ビルド結果をプレビュー
- `npm run lint`: ESLint による型チェック
