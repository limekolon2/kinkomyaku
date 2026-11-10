// ゲームをやめてポータルに戻るボタン（確認つき）。ポータル（studio-portal）に載せている全ゲームで同じ部品を使う。
// 押す → 確認 → onQuit()（セーブ・観戦欄への終了の連絡）→ ポータルのトップへ移動する。
// 見た目はゲームごとに theme（確認画面の色）と style / className（ボタン本体）で合わせる。
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export const PORTAL_URL = "https://studio-portal-ashy.vercel.app/";

const DEFAULT_THEME = {
  panel: "#1c1b20",
  text: "#f0ece4",
  sub: "#a39d93",
  border: "rgba(255,255,255,0.14)",
  accent: "#e9c46a",
  accentText: "#1c1b20",
  font: "inherit",
  radius: 12,
};

const DEFAULT_BUTTON = {
  background: "rgba(0,0,0,0.35)",
  color: "#f0ece4",
  border: "1px solid rgba(255,255,255,0.25)",
  borderRadius: 999,
  padding: "6px 14px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  lineHeight: 1.2,
  whiteSpace: "nowrap",
};

// 押した操作がゲーム側（画面タップで動くなど）に伝わらないようにする
const stop = (e) => e.stopPropagation();
const STOP_PROPS = {
  onClick: stop,
  onMouseDown: stop,
  onMouseUp: stop,
  onPointerDown: stop,
  onPointerUp: stop,
  onTouchStart: stop,
  onTouchEnd: stop,
  onKeyDown: stop,
};

export default function QuitButton({
  onQuit, // やめる前にすること（セーブなど）。Promise を返してよい（最大2秒待つ）
  note = "ここまでの進み具合は保存されます。",
  theme,
  style,
  className,
  label = "やめる",
  hidden = false, // 観戦モードなどで出さないとき
}) {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const stayRef = useRef(null);
  const t = { ...DEFAULT_THEME, ...theme };

  useEffect(() => {
    if (!open) return undefined;
    if (stayRef.current) stayRef.current.focus();
    // 確認中はゲームのキー操作を止める（Esc で閉じる）
    const onKey = (e) => {
      if (e.key === "Escape" && !leaving) setOpen(false);
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, leaving]);

  if (hidden) return null;

  const quit = async () => {
    if (leaving) return;
    setLeaving(true);
    try {
      await Promise.race([
        Promise.resolve().then(() => (onQuit ? onQuit() : null)),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
    } catch {
      // セーブなどに失敗しても、ポータルには戻す
    }
    window.location.assign(PORTAL_URL);
  };

  const dialog = (
    <div
      {...STOP_PROPS}
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget && !leaving) setOpen(false);
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483000,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        boxSizing: "border-box",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quit-dialog-title"
        style={{
          width: "100%",
          maxWidth: 340,
          boxSizing: "border-box",
          background: t.panel,
          color: t.text,
          border: `1px solid ${t.border}`,
          borderRadius: t.radius,
          padding: "22px 20px 18px",
          fontFamily: t.font,
          textAlign: "center",
          boxShadow: "0 18px 48px rgba(0,0,0,0.45)",
        }}
      >
        <div id="quit-dialog-title" style={{ fontSize: 17, fontWeight: 700, letterSpacing: "0.04em" }}>
          ゲームをやめますか？
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.7, color: t.sub, margin: "10px 0 18px" }}>
          {note}
          {note ? <br /> : null}
          ポータルに戻ります。
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            ref={stayRef}
            type="button"
            disabled={leaving}
            onClick={() => setOpen(false)}
            style={{
              flex: 1,
              padding: "11px 0",
              borderRadius: Math.max(4, t.radius - 4),
              border: `1px solid ${t.border}`,
              background: "transparent",
              color: t.text,
              fontFamily: t.font,
              fontSize: 14,
              fontWeight: 700,
              cursor: leaving ? "default" : "pointer",
              opacity: leaving ? 0.5 : 1,
            }}
          >
            続ける
          </button>
          <button
            type="button"
            disabled={leaving}
            onClick={quit}
            style={{
              flex: 1,
              padding: "11px 0",
              borderRadius: Math.max(4, t.radius - 4),
              border: "none",
              background: t.accent,
              color: t.accentText,
              fontFamily: t.font,
              fontSize: 14,
              fontWeight: 700,
              cursor: leaving ? "default" : "pointer",
            }}
          >
            {leaving ? "戻っています…" : "やめる"}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        {...STOP_PROPS}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        aria-haspopup="dialog"
        className={className}
        style={className && !style ? undefined : { ...(className ? {} : DEFAULT_BUTTON), ...style }}
      >
        {label}
      </button>
      {open && typeof document !== "undefined" ? createPortal(dialog, document.body) : null}
    </>
  );
}
