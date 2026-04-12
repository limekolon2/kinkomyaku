// Simple synthesized sound effects using Web Audio API

let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playTone(freq, type, duration, vol = 0.1) {
  const ctx = initAudio();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

export const soundEffects = {
  dig: () => {
    // 短い「カッ」という音
    playTone(150 + Math.random() * 50, 'square', 0.1, 0.05);
  },
  gold: () => {
    // キラキラ音
    const ctx = initAudio();
    if (!ctx) return;
    [600, 800, 1200].forEach((f, i) => {
      setTimeout(() => playTone(f, 'sine', 0.3, 0.08), i * 80);
    });
  },
  diamond: () => {
    const ctx = initAudio();
    if (!ctx) return;
    [1000, 1500, 2000].forEach((f, i) => {
      setTimeout(() => playTone(f, 'sine', 0.4, 0.1), i * 100);
    });
  },
  buy: () => {
    // チリン音
    playTone(1200, 'sine', 0.1, 0.05);
    setTimeout(() => playTone(1600, 'sine', 0.3, 0.05), 100);
  },
  sell: () => {
    // チャリンチャリン
    playTone(800, 'triangle', 0.1, 0.08);
    setTimeout(() => playTone(1200, 'triangle', 0.2, 0.08), 100);
  },
  water: () => {
    // ざっぱん！という音（ノイズっぽいものを擬似的に）
    playTone(100, 'triangle', 0.4, 0.2);
    setTimeout(() => playTone(150, 'sine', 0.3, 0.1), 50);
  },
  collapse: () => {
    // ドゴォォン
    playTone(80 + Math.random() * 20, 'sawtooth', 0.6, 0.3);
    setTimeout(() => playTone(60, 'square', 0.5, 0.2), 100);
  },
  explosion: () => {
    playTone(100, 'square', 0.1, 0.4);
    setTimeout(() => playTone(60, 'sawtooth', 0.5, 0.4), 50);
    setTimeout(() => playTone(40, 'square', 0.4, 0.3), 150);
  }
};
