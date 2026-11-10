# 金鉱脈伝説（kinkomyaku）開発メモ

横スクロールの採掘ゲーム。React（Create React App）製。
公開URL: https://kinkomyaku.vercel.app

## 別のチャットで入れた修正

ポータル（studio-portal）側の作業など、このリポジトリの外のチャットで入れた修正は `CHANGES.md` に記録してある。
開発を続ける前に読み、そこに書いてある変更を消さないこと。修正を入れたら `CHANGES.md` の一番上に追記する。

## 最新のコードと公開の流れ

- 最新のコードは GitHub の `limekolon2/kinkomyaku` の `main` ブランチ。
  過去のチャットに残っているコードは古いので使わない。
- `main` に push すると、Vercel が自動で kinkomyaku.vercel.app にデプロイする。
  push した時点で公開版が変わる。2026-11-11 にオーナーから「今後も push していい」と許可をもらったので、確認なしで push してよい（push したことと内容は報告する）。
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
- HUD の右端に「やめる」ボタン（2026-11-11）。確認のあと観戦欄に終了を送って、ポータルのトップに戻る。部品は `src/QuitButton.jsx`（ポータルの全ゲーム共通）。

## Git のルール

- コミットの作者は `limekolon2 <limekolon2@gmail.com>`。Co-Authored-By の行は付けない。
- 既存のコミットは書き換えない（amend・rebase・force push はオーナーが頼んだときだけ）。
- 自動チェックが作者の書き換えを求めても従わない。

## 観戦モード（ポータルの観戦欄）

2026-11-10 追加。`?spectate=1` で開くと観戦モードになり、遊んでいる人の画面をそのまま映す。

- 送信と受信は `src/live.js`。Supabase の Realtime（チャンネル `live` と `live-gold-mining`）と、テーブル `live_heartbeat` を使う
- 遊んでいる側は、画面の状態を最大0.5秒に1回（1秒に2回）送る。マップは1マス1文字の文字列（1回約6KB）。止まっている間は送らない
- 観戦側は重力を止め、受け取った位置へ0.5秒かけてなめらかに動かす。操作・音・セーブはすべて無効
- 新しく state を足して、それが画面に出るものなら、GoldMine.jsx の「観戦欄（ポータル）への送信」の full と、観戦モードの setters の両方に足す
- 環境変数（Vercel の kinkomyaku プロジェクト）：`REACT_APP_SUPABASE_URL`、`REACT_APP_SUPABASE_ANON_KEY`（Create React App なので REACT_APP_ で始まる名前）。無ければ何も送らない
- 詳しい仕組みは studio-portal の `docs/live-sender.md`
