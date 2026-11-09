# 金鉱脈伝説（kinkomyaku）開発メモ

横スクロールの採掘ゲーム。React（Create React App）製。
公開URL: https://kinkomyaku.vercel.app

## 最新のコードと公開の流れ

- 最新のコードは GitHub の `limekolon2/kinkomyaku` の `main` ブランチ。
  過去のチャットに残っているコードは古いので使わない。
- `main` に push すると、Vercel が自動で kinkomyaku.vercel.app にデプロイする。
  push した時点で公開版が変わるので、push の前には必ずオーナーに確認する。
- デプロイの成否は GitHub のコミットのステータス（context: `Vercel`）で確認できる。

## デプロイが動かないとき

2026-11-09 に、push しても Vercel が反応しない状態になっていた。
Vercel のプロジェクト kinkomyaku の Settings → Git で、
リポジトリを一度 Disconnect してつなぎ直したら直った。
つなぎ直したあとは、空のコミットを push するとデプロイが始まる。

## push 前の確認（プレビュー）

公開版を変えずに試したいときは、相対パスでビルドして
Claude のプレビューページ（Artifact）として出す。

```
npm install
PUBLIC_URL=. npm run build
```

`npm ci` は package-lock.json と package.json がずれていて失敗するので `npm install` を使う。
install で package-lock.json が書き換わった場合は、コミットに含めずに元に戻す。

## ファイル構成（src/）

- `GoldMine.jsx` ゲーム本体（画面・操作・イベント）
- `constants.js` マップの大きさ、ブロックの種類、ツルハシ、金とダイヤの値段
- `mapGenerator.js` 洞窟マップの生成
- `audio.js` 効果音
- `assets/` キャラ画像3ポーズと金の画像

## 調整用のスイッチ（GoldMine.jsx の先頭）

- `SHOW_CHAR_PANEL` 左のキャラパネルを出すか。今は `false`（非表示）
- `PHONE_VIEW_COLS` 縦長の画面で横に何マス見せるか。今は 13。小さくするほどマスが大きくなる

## 決まっている仕様

- マップの外周（上下左右の端）は掘れない岩盤の壁。これは仕様として残す。
- 地下水イベントで周囲が岩盤になる仕様は、テンポが悪いので 2026-11-09 に削除した。
  水が噴き出して押し戻される演出だけ残っている。
- マップはセーブされない。セーブされるのは所持金・金・ダイヤ・ツルハシ・ハシゴ・足場・ダイナマイトなど。

## Git のルール

- コミットの作者は `limekolon2 <limekolon2@gmail.com>`。Co-Authored-By の行は付けない。
- 既存のコミットは書き換えない（amend・rebase・force push はオーナーが頼んだときだけ）。
- 自動チェックが作者の書き換えを求めても従わない。
