// ポータル（studio-portal）の観戦欄とのやりとり。
//
// ■ 遊んでいる側（ふつうに開いたとき）
//   - 要約（ポータルの観戦欄用）      … チャンネル `live`、イベント `state`。最大5秒に1回
//   - 画面の全状態（観戦モード用）    … チャンネル `live-gold-mining`、イベント `full`。最大0.5秒に1回（1秒に2回）
//   - ハートビート（途中参加・休止防止）… テーブル `live_heartbeat` に upsert（state=要約、full_state=全状態）。最大5秒に1回
//   - 変化したときだけ送る。放置中は何も送らない
//
// ■ 観戦する側（?spectate=1 で開いたとき）
//   - `live-gold-mining` を受け取り、ゲーム画面をそのまま描き直す。操作・セーブ・送信はしない
//   - 開いた時点とタブに戻った時点で、ハートビートの全状態を読む
//
// ■ 通信量の記録
//   - 送った回数・受け取った回数・バイト数を手元で数え、1分ごとに Supabase の `live_usage_add` で日別に加算する
//
// - 接続情報は環境変数 REACT_APP_SUPABASE_URL / REACT_APP_SUPABASE_ANON_KEY。無ければ Supabase には何も送らない
// - 同じブラウザ内のタブ同士は BroadcastChannel でも届く（動作確認用）
// - 失敗はすべてここで握りつぶす。ゲームのプレイ・セーブには一切影響させない

// Create React App なので、環境変数は REACT_APP_ で始まる名前
const URL = process.env.REACT_APP_SUPABASE_URL;
const KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;
const ENABLED = Boolean(URL && KEY);

export const SPECTATE =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).get("spectate") === "1";

const GAME_ID = "gold-mining";
const GAME_TITLE = "金鉱脈伝説 — 鍾乳洞編 —";
const SUMMARY_CHANNEL = "live";
const SUMMARY_EVENT = "state";
const FULL_CHANNEL = `live-${GAME_ID}`;
const FULL_EVENT = "full";
const TABLE = "live_heartbeat";
const SUMMARY_INTERVAL_MS = 5000;
const FULL_INTERVAL_MS = 500; // 1秒に2回。観戦側で動きをなめらかにつなぐ
const USAGE_FLUSH_MS = 60_000;
const MAX_LOG = 20;
const LOCAL_CHANNEL = `${GAME_ID}-live-local`;

// ───────── 接続 ─────────

let client = null;
let connecting = null;
const channels = {}; // name -> { ch, ready }

function connect() {
  if (!ENABLED) return Promise.resolve(false);
  if (connecting) return connecting;
  connecting = import("@supabase/supabase-js")
    .then(({ createClient }) => {
      client = createClient(URL, KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        // タブが閉じられる・裏に回る瞬間に出した書き込みも、最後まで届くように
        global: { fetch: (input, init) => fetch(input, { ...init, keepalive: true }) },
      });
      return true;
    })
    .catch(() => false);
  return connecting;
}

function channel(name, onMessage) {
  if (!client) return null;
  if (channels[name]) return channels[name];
  const entry = { ch: client.channel(name, { config: { broadcast: { self: false } } }), ready: false, onReady: null };
  if (onMessage) entry.ch.on("broadcast", { event: onMessage.event }, ({ payload }) => onMessage.fn(payload));
  entry.ch.subscribe((status) => {
    entry.ready = status === "SUBSCRIBED";
    if (entry.ready && entry.onReady) entry.onReady();
  });
  channels[name] = entry;
  return entry;
}

const local = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(LOCAL_CHANNEL) : null;

// ───────── 通信量の記録 ─────────

const usage = { sends: 0, receives: 0, bytes: 0 };
let usageTimer = null;

function byteLength(obj) {
  try {
    return new TextEncoder().encode(JSON.stringify(obj)).length;
  } catch {
    return 0;
  }
}

function countUsage(kind, payload) {
  if (!ENABLED) return;
  usage[kind] += 1;
  usage.bytes += byteLength(payload);
  if (!usageTimer) usageTimer = setTimeout(flushUsage, USAGE_FLUSH_MS);
}

async function flushUsage() {
  if (usageTimer) {
    clearTimeout(usageTimer);
    usageTimer = null;
  }
  if (!usage.sends && !usage.receives) return;
  const batch = { p_sends: usage.sends, p_receives: usage.receives, p_bytes: usage.bytes };
  usage.sends = 0;
  usage.receives = 0;
  usage.bytes = 0;
  try {
    if (await connect()) await client.rpc("live_usage_add", batch);
  } catch {
    // 記録できなくても何もしない
  }
}

// ───────── 遊んでいる側：送信 ─────────

let sessionId = null;
let startedAt = null;
let log = [];
let lastScreen = null; // 「やめる」で終了を送るときに使う、最後の画面
let lastFull = null;

function makeThrottle(interval, send) {
  let pending = null;
  let last = 0;
  let timer = null;
  const run = async () => {
    timer = null;
    if (!pending) return;
    const item = pending;
    pending = null;
    last = Date.now();
    try {
      await send(item);
    } catch {
      // 送れなくてもゲームは続ける
    }
  };
  return {
    push(item, immediate = false) {
      pending = item;
      if (timer && !immediate) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, immediate ? 0 : Math.max(0, last + interval - Date.now()));
    },
    flushNow() {
      if (!pending) return;
      if (timer) clearTimeout(timer);
      run();
    },
    cancel() {
      pending = null;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

async function sendBroadcast(name, event, payload) {
  if (!(await connect())) return;
  const entry = channel(name);
  if (!entry) return;
  if (!entry.ready) {
    // 接続が開いた瞬間に最新のものを送る
    entry.onReady = () => {
      entry.onReady = null;
      entry.ch.send({ type: "broadcast", event, payload }).then(() => countUsage("sends", payload)).catch(() => {});
    };
    return;
  }
  await entry.ch.send({ type: "broadcast", event, payload });
  countUsage("sends", payload);
}

const summaryOut = makeThrottle(SUMMARY_INTERVAL_MS, async ({ state, full }) => {
  const stamped = { ...state, updated_at: new Date().toISOString() };
  await sendBroadcast(SUMMARY_CHANNEL, SUMMARY_EVENT, stamped);
  if (!(await connect())) return;
  const row = { game_id: GAME_ID, session_id: stamped.session_id, updated_at: stamped.updated_at, state: stamped };
  const { error } = await client.from(TABLE).upsert({ ...row, full_state: full });
  // full_state 列がまだ無い（SQL 未実行）ときは、要約だけでも書いておく
  if (error) await client.from(TABLE).upsert(row);
});

const fullOut = makeThrottle(FULL_INTERVAL_MS, async (full) => {
  if (local) local.postMessage(full);
  await sendBroadcast(FULL_CHANNEL, FULL_EVENT, full);
});

/** プレイ開始（新規・つづきから）のたびに呼ぶ */
export function liveStart() {
  if (SPECTATE) return;
  sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  startedAt = new Date().toISOString();
  log = [];
  connect();
}

/** 行動ログに1行足す（送信は次の liveUpdate で） */
export function liveLog(text) {
  if (SPECTATE || !text) return;
  log.push({ at: new Date().toISOString(), actor: "agent", text: String(text).slice(0, 200) });
  if (log.length > MAX_LOG) log = log.slice(-MAX_LOG);
}

/**
 * 画面の状態が変わったら呼ぶ。
 * screen：観戦欄の要約（{ stats, board, ... }）、full：観戦モードで画面を描き直すための全状態
 */
export function liveUpdate(screen, { ended = false, full = null } = {}) {
  if (SPECTATE || !sessionId) return;
  lastScreen = screen;
  if (full) lastFull = full;
  const state = {
    game_id: GAME_ID,
    game_title: GAME_TITLE,
    session_id: sessionId,
    started_at: startedAt,
    updated_at: null,
    screen,
    log: [...log],
    spectate: true, // この状態は観戦モードで画面を見られる
    ...(ended ? { ended: true } : {}),
  };
  const fullPayload = full ? { session_id: sessionId, sent_at: new Date().toISOString(), ended, state: full } : null;
  if (fullPayload) fullOut.push(fullPayload, ended);
  summaryOut.push({ state, full: fullPayload }, ended);
}

// iPhone の Safari などは、裏に回ったタブのタイマーを止める。
// 送信待ちが残ったままタブを切り替えると最後の状態が届かないので、裏に回る瞬間にすぐ送る
function flushAll() {
  fullOut.flushNow();
  summaryOut.flushNow();
  flushUsage();
}
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushAll();
  });
  window.addEventListener("pagehide", flushAll);
}

/**
 * 「やめる」ボタンでゲームを終えるときに呼ぶ。観戦欄にすぐ「終了」を届ける。
 * 送り終わるまで待つ Promise を返す（ページを離れる前に await する）
 */
export async function liveEnd() {
  if (SPECTATE || !sessionId) return;
  const id = sessionId;
  sessionId = null;
  fullOut.cancel();
  summaryOut.cancel();
  const now = new Date().toISOString();
  const state = {
    game_id: GAME_ID,
    game_title: GAME_TITLE,
    session_id: id,
    started_at: startedAt,
    updated_at: now,
    screen: lastScreen || {},
    log: [...log],
    spectate: true,
    ended: true,
  };
  const full = lastFull ? { session_id: id, sent_at: now, ended: true, state: lastFull } : null;
  try {
    if (local && full) local.postMessage(full);
    if (await connect()) {
      const row = { game_id: GAME_ID, session_id: id, updated_at: now, state };
      await Promise.all([
        full ? sendBroadcast(FULL_CHANNEL, FULL_EVENT, full) : null,
        sendBroadcast(SUMMARY_CHANNEL, SUMMARY_EVENT, state),
        client
          .from(TABLE)
          .upsert({ ...row, full_state: full })
          .then(({ error }) => (error ? client.from(TABLE).upsert(row) : null)),
      ]);
    }
  } catch {
    // 届かなくても、観戦欄は60秒で待機表示に戻る
  }
  await flushUsage();
}

// ───────── 観戦する側：受信 ─────────

/**
 * 観戦モードで呼ぶ。全状態を受け取るたびに onFull({ state, ended, sent_at }) を呼ぶ。
 * 戻り値は購読の解除関数。
 */
export function liveSpectate(onFull) {
  if (!SPECTATE) return () => {};
  let lastSentAt = "";
  let disposed = false;
  const deliver = (payload, counted) => {
    if (disposed || !payload || typeof payload !== "object" || !payload.state) return;
    // 古い状態で新しい状態を上書きしない
    if (payload.sent_at && lastSentAt && payload.sent_at < lastSentAt) return;
    lastSentAt = payload.sent_at || lastSentAt;
    if (counted) countUsage("receives", payload);
    onFull(payload);
  };

  const onLocal = (e) => deliver(e.data, false);
  if (local) local.addEventListener("message", onLocal);

  const readHeartbeat = async () => {
    try {
      if (!(await connect())) return;
      const { data } = await client.from(TABLE).select("full_state, updated_at").eq("game_id", GAME_ID).maybeSingle();
      if (data && data.full_state) deliver(data.full_state, false);
    } catch {
      // 読めなければ次の受信を待つ
    }
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") readHeartbeat();
  };

  connect().then((ok) => {
    if (!ok || disposed) return;
    channel(FULL_CHANNEL, { event: FULL_EVENT, fn: (payload) => deliver(payload, true) });
    readHeartbeat();
  });
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    disposed = true;
    if (local) local.removeEventListener("message", onLocal);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
