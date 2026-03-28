import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import charIdleImg from "./assets/char_idle.png";
import charDigImg from "./assets/char_dig.png";
import charHitImg from "./assets/char_hit.png";
import goldImg from "./assets/gold.png";


const CHAR_IMG = {
  idle: charIdleImg,
  dig:  charDigImg,
  hit:  charHitImg,
};

const GOLD_IMG = goldImg;


const COLS = 60;
const ROWS = 40;
const B = { AIR: 0, DIRT: 1, STONE: 2, GOLD: 3, DIAMOND: 4, BEDROCK: 5, LADDER: 6, ENTRANCE: 7, STALACTITE: 8, STALAGMITE: 9, WATER: 10, LIMESTONE: 11, PLANK: 12 };
const BHP = { [B.DIRT]: 1, [B.STONE]: 3, [B.GOLD]: 2, [B.DIAMOND]: 5, [B.BEDROCK]: 999, [B.STALACTITE]: 1, [B.STALAGMITE]: 1, [B.LIMESTONE]: 2 };
const TOOLS = [
  { name: "木のツルハシ", power: 1, cost: 0 },
  { name: "鉄のツルハシ", power: 2, cost: 300 },
  { name: "鋼のツルハシ", power: 3, cost: 800 },
  { name: "金のツルハシ", power: 5, cost: 2000 },
  { name: "ダイヤツルハシ", power: 8, cost: 5000 },
];
const GP = 100, DP = 500;

// Limestone cave generation using cellular automata
function generateMap() {
  let grid = Array.from({ length: ROWS }, () => Array(COLS).fill(1));

  // Step 1: Random fill (~50% open)
  for (let y = 1; y < ROWS - 1; y++)
    for (let x = 1; x < COLS - 1; x++)
      grid[y][x] = Math.random() < 0.44 ? 0 : 1;

  // Entrance guaranteed open
  for (let y = 1; y <= 4; y++) for (let x = 1; x <= 4; x++) grid[y][x] = 0;

  // Step 2: Cellular automata smoothing (4 iterations)
  for (let iter = 0; iter < 4; iter++) {
    const next = grid.map(r => [...r]);
    for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) {
      let walls = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
        if (dy !== 0 || dx !== 0) walls += grid[y + dy][x + dx];
      // B3456/S45678 variant for organic caves
      if (grid[y][x] === 1) next[y][x] = walls >= 4 ? 1 : 0;
      else next[y][x] = walls >= 5 ? 1 : 0;
    }
    grid = next;
  }

  // Ensure entrance connectivity: flood fill from entrance, carve paths to isolated areas
  function floodFill(g, sx, sy) {
    const visited = new Set();
    const queue = [[sx, sy]];
    visited.add(sy * COLS + sx);
    while (queue.length) {
      const [cx, cy] = queue.shift();
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = cx + dx, ny = cy + dy;
        const k = ny * COLS + nx;
        if (nx > 0 && nx < COLS - 1 && ny > 0 && ny < ROWS - 1 && !visited.has(k) && g[ny][nx] === 0) {
          visited.add(k); queue.push([nx, ny]);
        }
      }
    }
    return visited;
  }

  const mainCave = floodFill(grid, 2, 2);

  // Carve tunnel from entrance toward any large disconnected cave
  for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) {
    if (grid[y][x] === 0 && !mainCave.has(y * COLS + x)) {
      // Carve a path from this cell toward entrance area
      let cx = x, cy = y;
      let steps = 0;
      while (!mainCave.has(cy * COLS + cx) && steps < 60) {
        if (cx > 3) cx--;
        else if (cy > 3) cy--;
        else break;
        grid[cy][cx] = 0;
        mainCave.add(cy * COLS + cx);
        steps++;
      }
    }
  }

  // Step 3: Build final map
  const map = Array.from({ length: ROWS }, () => Array(COLS).fill(B.AIR));
  const hp = Array.from({ length: ROWS }, () => Array(COLS).fill(0));

  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (y === 0 || y === ROWS - 1 || x === 0 || x === COLS - 1) { map[y][x] = B.BEDROCK; continue; }
    if (grid[y][x] === 1) {
      // Limestone cave walls
      map[y][x] = Math.random() < 0.7 ? B.LIMESTONE : B.STONE;
    }
  }

  // Entrance
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) map[y][x] = B.AIR;
  map[1][1] = B.ENTRANCE;

  // Step 4: Stalactites (hang from ceiling: air below, solid above)
  for (let y = 2; y < ROWS - 2; y++) for (let x = 1; x < COLS - 1; x++) {
    if (map[y][x] === B.AIR && map[y - 1][x] !== B.AIR && map[y - 1][x] !== B.BEDROCK && map[y - 1][x] !== B.ENTRANCE) {
      if (Math.random() < 0.15) {
        map[y][x] = B.STALACTITE;
        // Sometimes extend down
        if (Math.random() < 0.3 && y + 1 < ROWS - 1 && map[y + 1][x] === B.AIR) map[y + 1][x] = B.STALACTITE;
      }
    }
  }

  // Step 5: Stalagmites (rise from floor: air above, solid below)
  for (let y = 1; y < ROWS - 2; y++) for (let x = 1; x < COLS - 1; x++) {
    if (map[y][x] === B.AIR && map[y + 1][x] !== B.AIR && map[y + 1][x] !== B.BEDROCK && map[y + 1][x] !== B.WATER) {
      if (Math.random() < 0.12) {
        map[y][x] = B.STALAGMITE;
        // Sometimes extend up
        if (Math.random() < 0.25 && y - 1 > 0 && map[y - 1][x] === B.AIR) map[y - 1][x] = B.STALAGMITE;
      }
    }
  }

  // Step 6: Underground pools (water at low points of caves)
  for (let y = ROWS - 3; y > ROWS * 0.4; y--) for (let x = 1; x < COLS - 1; x++) {
    if (map[y][x] === B.AIR && map[y + 1][x] !== B.AIR && map[y + 1][x] !== B.WATER) {
      // Check if enclosed enough for a pool
      let enclosed = true;
      for (let dx = -1; dx <= 1; dx++) {
        if (x + dx < 1 || x + dx >= COLS - 1) { enclosed = false; break; }
        if (map[y + 1][x + dx] === B.AIR) enclosed = false;
      }
      if (enclosed && Math.random() < 0.25) {
        map[y][x] = B.WATER;
        // Spread water horizontally
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx > 0 && nx < COLS - 1 && map[y][nx] === B.AIR) map[y][nx] = B.WATER;
        }
      }
    }
  }

  // Step 7: Gold veins in limestone walls
  const nGold = 15 + Math.floor(Math.random() * 10);
  for (let v = 0; v < nGold; v++) {
    const gx = 2 + Math.floor(Math.random() * (COLS - 4));
    const gy = 2 + Math.floor(Math.random() * (ROWS - 4));
    if (map[gy][gx] === B.LIMESTONE || map[gy][gx] === B.STONE) {
      map[gy][gx] = B.GOLD;
      const sz = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < sz; i++) {
        const ox = gx + Math.floor(Math.random() * 3) - 1;
        const oy = gy + Math.floor(Math.random() * 3) - 1;
        if (oy > 0 && oy < ROWS - 1 && ox > 0 && ox < COLS - 1 &&
            (map[oy][ox] === B.LIMESTONE || map[oy][ox] === B.STONE))
          map[oy][ox] = B.GOLD;
      }
    }
  }

  // Deep diamonds
  const nDia = 4 + Math.floor(Math.random() * 4);
  for (let v = 0; v < nDia; v++) {
    const dx = 5 + Math.floor(Math.random() * (COLS - 10));
    const dy = Math.floor(ROWS * 0.5) + Math.floor(Math.random() * (ROWS * 0.4));
    if (dy > 0 && dy < ROWS - 1 && map[dy][dx] !== B.AIR && map[dy][dx] !== B.BEDROCK && map[dy][dx] !== B.WATER) {
      map[dy][dx] = B.DIAMOND;
      if (dy + 1 < ROWS - 1 && map[dy + 1][dx] !== B.AIR && map[dy + 1][dx] !== B.WATER) map[dy + 1][dx] = B.DIAMOND;
    }
  }

  // Clear stalactites/stalagmites from entrance area
  for (let y = 1; y <= 4; y++) for (let x = 1; x <= 4; x++)
    if (map[y][x] === B.STALACTITE || map[y][x] === B.STALAGMITE) map[y][x] = B.AIR;

  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) hp[y][x] = BHP[map[y][x]] || 0;
  return { map, hp };
}

function useContainerSize(ref) {
  const [size, setSize] = useState({ w: 800, h: 600 });
  useEffect(() => {
    const measure = () => {
      if (ref.current) setSize({ w: ref.current.clientWidth, h: ref.current.clientHeight });
      else setSize({ w: window.innerWidth, h: window.innerHeight });
    };
    measure();
    window.addEventListener("resize", measure);
    const ro = new ResizeObserver(measure);
    if (ref.current) ro.observe(ref.current);
    return () => { window.removeEventListener("resize", measure); ro.disconnect(); };
  }, [ref]);
  return size;
}

function DPad({ onMove }) {
  const iv = useRef(null);
  const start = (dx, dy) => { onMove(dx, dy); iv.current = setInterval(() => onMove(dx, dy), 120); };
  const stop = () => { if (iv.current) { clearInterval(iv.current); iv.current = null; } };
  const sz = 52, g = 3;
  const bS = () => ({
    width: sz, height: sz, borderRadius: sz * 0.22,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
    color: "rgba(255,255,255,0.45)", fontSize: sz * 0.36, fontWeight: 700,
    touchAction: "none", userSelect: "none", WebkitUserSelect: "none", cursor: "pointer",
  });
  const wrap = { position: "relative", width: sz * 3 + g * 2, height: sz * 3 + g * 2 };
  const pos = (x, y) => ({ position: "absolute", left: x, top: y });
  return (
    <div style={wrap}>
      {[{ l: "▲", dx: 0, dy: -1, x: sz + g, y: 0 }, { l: "◀", dx: -1, dy: 0, x: 0, y: sz + g },
        { l: "▶", dx: 1, dy: 0, x: sz * 2 + g * 2, y: sz + g }, { l: "▼", dx: 0, dy: 1, x: sz + g, y: sz * 2 + g * 2 }
      ].map(d => (
        <div key={d.l} style={pos(d.x, d.y)}
          onPointerDown={() => start(d.dx, d.dy)} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}>
          <div style={bS()}>{d.l}</div>
        </div>
      ))}
    </div>
  );
}

export default function CaveMiner() {
  const rootRef = useRef(null);
  const vp = useContainerSize(rootRef);
  const [screen, setScreen] = useState("title");
  const [charFace, setCharFace] = useState("idle");
  const charTimer = useRef(null);
  const [mapData, setMapData] = useState(null);
  const [px, setPx] = useState(2);
  const [py, setPy] = useState(2);
  const [inv, setInv] = useState({ gold: 0, diamond: 0 });
  const [money, setMoney] = useState(0);
  const [tool, setTool] = useState(0);
  const [camX, setCamX] = useState(0);
  const [camY, setCamY] = useState(0);
  const [particles, setParticles] = useState([]);
  const [totalSold, setTotalSold] = useState(0);
  const [ladders, setLadders] = useState(5);
  const [planks, setPlanks] = useState(5);
  const [msg, setMsg] = useState("");
  const [drips, setDrips] = useState([]);
  const [shopOpen, setShopOpen] = useState(false);
  const [mapView, setMapView] = useState(false);
  const msgT = useRef(null);
  const keys = useRef({});
  const facingDir = useRef(1); // 1=right, -1=left
  const camDragging = useRef(false);
  const camDragResumeTimer = useRef(null);
  const camDragAccum = useRef({ x: 0, y: 0 });
  const [fever, setFever] = useState(false);
  const feverTimer = useRef(null);
  const pxRef = useRef(2);
  const pyRef = useRef(2);

  const layout = useMemo(() => {
    const w = vp.w, h = vp.h, hudH = 42;
    const availH = h - hudH, availW = w;
    const tH = Math.floor(availH / 18);
    const tW = Math.floor(availW / 22);
    const tile = Math.max(12, Math.min(40, Math.min(tH, tW)));
    const vc = Math.min(COLS, Math.floor(availW / tile));
    const vr = Math.min(ROWS, Math.floor(availH / tile));
    return { tile, viewCols: vc, viewRows: vr, gameW: vc * tile, gameH: vr * tile };
  }, [vp.w, vp.h]);

  const flash = useCallback((m) => {
    setMsg(m);
    if (msgT.current) clearTimeout(msgT.current);
    msgT.current = setTimeout(() => setMsg(""), 2000);
  }, []);

  const startGame = useCallback(() => {
    const md = generateMap();
    setMapData(md);
    setPx(2); setPy(2);
    setInv({ gold: 0, diamond: 0 }); setMoney(0); setTool(0);
    setCamX(0); setCamY(0);
    setParticles([]); setDrips([]); setTotalSold(0); setLadders(5); setPlanks(5); setShopOpen(false);
    setScreen("game");
  }, []);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap";
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, []);

  useEffect(() => {
    if (!mapData || camDragging.current) return;
    setCamX(Math.max(0, Math.min(px - Math.floor(layout.viewCols / 2), COLS - layout.viewCols)));
    setCamY(Math.max(0, Math.min(py - Math.floor(layout.viewRows / 2), ROWS - layout.viewRows)));
  }, [px, py, mapData, layout.viewCols, layout.viewRows]);

  const burst = useCallback((bx, by, color) => {
    const T = layout.tile;
    const ps = Array.from({ length: 5 }, () => ({
      id: Math.random(), x: bx * T + T / 2 + (Math.random() - 0.5) * 14,
      y: by * T + T / 2 + (Math.random() - 0.5) * 14,
      vx: (Math.random() - 0.5) * 4, vy: -Math.random() * 2.5 - 1, color, life: 16,
    }));
    setParticles(prev => [...prev.slice(-30), ...ps]);
  }, [layout.tile]);

  const showFace = useCallback((face, duration = 800) => {
    setCharFace(face);
    if (charTimer.current) clearTimeout(charTimer.current);
    charTimer.current = setTimeout(() => setCharFace("idle"), duration);
  }, []);

  useEffect(() => { pxRef.current = px; }, [px]);
  useEffect(() => { pyRef.current = py; }, [py]);

  const tryMove = useCallback((dx, dy) => {
    if (!mapData) return;
    if (dx !== 0) facingDir.current = dx;
    const nx = px + dx, ny = py + dy;
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) return;
    const block = mapData.map[ny][nx];
    if (block === B.AIR || block === B.LADDER || block === B.ENTRANCE || block === B.WATER || block === B.PLANK) {
      setPx(nx); setPy(ny);
    } else if (block !== B.BEDROCK) {
      const newHp = mapData.hp.map(r => [...r]);
      newHp[ny][nx] -= TOOLS[tool].power * (fever ? 2 : 1);
      if (newHp[ny][nx] <= 0) {
        const newMap = mapData.map.map(r => [...r]);
        const broken = newMap[ny][nx];
        newMap[ny][nx] = B.AIR; newHp[ny][nx] = 0;
        setMapData({ map: newMap, hp: newHp });
        if (broken === B.GOLD) { setInv(p => ({ ...p, gold: p.gold + 1 })); flash("⛏ 金塊 +1"); burst(nx, ny, "#FFD700"); showFace("hit", 1000); }
        else if (broken === B.DIAMOND) { setInv(p => ({ ...p, diamond: p.diamond + 1 })); flash("💎 ダイヤ +1"); burst(nx, ny, "#00CED1"); showFace("hit", 1200); }
        else { burst(nx, ny, broken === B.DIRT ? "#8B6914" : "#666"); showFace("dig", 600); }
        setPx(nx); setPy(ny);
      } else {
        setMapData({ map: mapData.map, hp: newHp });
        burst(nx, ny, block === B.GOLD ? "#FFD700" : block === B.DIAMOND ? "#00CED1" : "#666");
        showFace("dig", 400);
      }
    }
  }, [mapData, px, py, tool, fever, flash, burst, showFace]);

  const placeLadder = useCallback(() => {
    if (ladders <= 0 || !mapData) return;
    if (mapData.map[py][px] === B.AIR) {
      const nm = mapData.map.map(r => [...r]);
      nm[py][px] = B.LADDER;
      setMapData({ map: nm, hp: mapData.hp.map(r => [...r]) });
      setLadders(p => p - 1); flash("🪜 ハシゴ設置");
    }
  }, [ladders, mapData, px, py, flash]);

  const placePlank = useCallback(() => {
    if (planks <= 0 || !mapData) return;
    const tx = px + facingDir.current;
    const ty = py;
    if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return;
    if (mapData.map[ty][tx] === B.AIR || mapData.map[ty][tx] === B.WATER) {
      const nm = mapData.map.map(r => [...r]);
      nm[ty][tx] = B.PLANK;
      setMapData({ map: nm, hp: mapData.hp.map(r => [...r]) });
      setPlanks(p => p - 1); flash(`🪵 足場設置 ${facingDir.current > 0 ? '→' : '←'}`);
    } else {
      flash("そこには置けない！");
    }
  }, [planks, mapData, px, py, flash]);

  // Gravity
  useEffect(() => {
    if (!mapData || screen !== "game") return;
    const g = setInterval(() => {
      setPy(prev => {
        if (prev + 1 >= ROWS) return prev;
        const below = mapData.map[prev + 1][px];
        const cur = mapData.map[prev][px];
        // Don't fall if on ladder, on plank, or block below is plank (acts as floor)
        if (cur === B.LADDER || cur === B.PLANK || below === B.PLANK) return prev;
        if (below === B.AIR || below === B.ENTRANCE || below === B.WATER) {
          return prev + 1;
        }
        return prev;
      });
    }, 100);
    return () => clearInterval(g);
  }, [mapData, screen, px]);

  // Particles
  useEffect(() => {
    if (!particles.length) return;
    const t = setInterval(() => {
      setParticles(prev => prev.map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.2, life: p.life - 1 })).filter(p => p.life > 0));
    }, 45);
    return () => clearInterval(t);
  }, [particles.length]);

  // Drip spawning — periodically create water drops from stalactites
  useEffect(() => {
    if (!mapData || screen !== "game") return;
    const spawnInterval = setInterval(() => {
      const T = layout.tile;
      const newDrips = [];
      // Scan visible area for stalactites
      for (let y = Math.max(0, camY); y < Math.min(ROWS, camY + layout.viewRows + 2); y++) {
        for (let x = Math.max(0, camX); x < Math.min(COLS, camX + layout.viewCols + 2); x++) {
          if (mapData.map[y][x] === B.STALACTITE) {
            // ~8% chance per stalactite per tick
            if (Math.random() < 0.08) {
              newDrips.push({
                id: Math.random(),
                x: x * T + T * 0.5 + (Math.random() - 0.5) * T * 0.2,
                y: y * T + T * 0.85,
                vy: 0.3 + Math.random() * 0.4,
                tileX: x, tileY: y,
                life: 120,
                phase: Math.random() * Math.PI * 2,
              });
            }
          }
        }
      }
      if (newDrips.length > 0) {
        setDrips(prev => [...prev.slice(-20), ...newDrips]);
      }
    }, 1800);
    return () => clearInterval(spawnInterval);
  }, [mapData, screen, camX, camY, layout.tile, layout.viewCols, layout.viewRows]);

  // Drip update — fall and splash
  useEffect(() => {
    if (!drips.length || !mapData) return;
    const T = layout.tile;
    const t = setInterval(() => {
      setDrips(prev => {
        const kept = [];
        const splashes = [];
        for (const d of prev) {
          const ny = d.y + d.vy;
          const nvy = d.vy + 0.12;
          const nLife = d.life - 1;
          // Check tile collision
          const tileY = Math.floor(ny / T);
          const tileX = Math.floor(d.x / T);
          if (tileY >= 0 && tileY < ROWS && tileX >= 0 && tileX < COLS) {
            const block = mapData.map[tileY][tileX];
            if (block !== B.AIR && block !== B.STALACTITE && block !== B.ENTRANCE) {
              // Hit something — splash!
              const color = block === B.WATER ? "rgba(100,180,255,0.7)" : "rgba(140,200,240,0.5)";
              for (let i = 0; i < 3; i++) {
                splashes.push({
                  id: Math.random(),
                  x: d.x + (Math.random() - 0.5) * 6,
                  y: ny - 2,
                  vx: (Math.random() - 0.5) * 2,
                  vy: -Math.random() * 1.5 - 0.5,
                  color, life: 10,
                });
              }
              continue; // remove this drip
            }
          }
          if (nLife <= 0) continue;
          kept.push({ ...d, y: ny, vy: nvy, life: nLife });
        }
        if (splashes.length > 0) {
          setParticles(p => [...p.slice(-30), ...splashes]);
        }
        return kept;
      });
    }, 55);
    return () => clearInterval(t);
  }, [drips.length, mapData, layout.tile]);

  // Keys
  useEffect(() => {
    if (screen !== "game") return;
    const dn = (e) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d", "e", "m", " "].includes(e.key.toLowerCase())) e.preventDefault();
      keys.current[e.key] = true;
      if (e.key === "e" || e.key === "E") placeLadder();
      if (e.key === "q" || e.key === "Q") placePlank();
      if (e.key === "m" || e.key === "M") setMapView(v => !v);
    };
    const up = (e) => { keys.current[e.key] = false; };
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, [screen, placeLadder, placePlank]);

  useEffect(() => {
    if (screen !== "game") return;
    const loop = setInterval(() => {
      const k = keys.current;
      if (k["ArrowRight"] || k["d"]) tryMove(1, 0);
      else if (k["ArrowLeft"] || k["a"]) tryMove(-1, 0);
      else if (k["ArrowUp"] || k["w"]) tryMove(0, -1);
      else if (k["ArrowDown"] || k["s"]) tryMove(0, 1);
    }, 120);
    return () => clearInterval(loop);
  }, [screen, tryMove]);

  useEffect(() => {
    const prevent = (e) => { if (screen === "game") e.preventDefault(); };
    document.addEventListener("touchmove", prevent, { passive: false });
    return () => document.removeEventListener("touchmove", prevent);
  }, [screen]);

  const atEntrance = mapData && mapData.map[py][px] === B.ENTRANCE;

  const sell = useCallback(() => {
    const t = inv.gold * GP + inv.diamond * DP;
    if (!t) { flash("売るものがない！"); return; }
    setMoney(p => p + t); setTotalSold(p => p + t);
    flash(`💰 ¥${t} 獲得！`); setInv({ gold: 0, diamond: 0 });
  }, [inv, flash]);

  const buyTool = useCallback((i) => {
    if (i <= tool || money < TOOLS[i].cost) { flash(i <= tool ? "購入済み" : "お金が足りない！"); return; }
    setMoney(p => p - TOOLS[i].cost); setTool(i); flash(`🔨 ${TOOLS[i].name} を購入！`);
  }, [money, tool, flash]);

  const buyLadder = useCallback(() => {
    if (money < 50) { flash("お金が足りない！"); return; }
    setMoney(p => p - 50); setLadders(p => p + 3); flash("🪜 ハシゴ x3 購入！");
  }, [money, flash]);

  const buyPlank = useCallback(() => {
    if (money < 50) { flash("お金が足りない！"); return; }
    setMoney(p => p - 50); setPlanks(p => p + 3); flash("🪵 足場 x3 購入！");
  }, [money, flash]);

  const newMapBtn = useCallback(() => {
    if (money < 300) { flash("¥300 必要！"); return; }
    setMoney(p => p - 300);
    setMapData(generateMap()); setPx(2); setPy(2); setLadders(p => p + 3); setPlanks(p => p + 3); setDrips([]);
    flash("🗺️ 新しい洞窟を発見！");
  }, [money, flash]);

  // Random events
  useEffect(() => {
    if (screen !== "game") return;
    const interval = setInterval(() => {
      setMapData(prev => {
        if (!prev) return prev;
        const cx = pxRef.current, cy = pyRef.current;
        const events = [
          // ⚡ 採掘フィーバー
          () => {
            setFever(true);
            flash("⚡ 採掘フィーバー！ 15秒間威力2倍！");
            if (feverTimer.current) clearTimeout(feverTimer.current);
            feverTimer.current = setTimeout(() => { setFever(false); flash("⚡ フィーバー終了"); }, 15000);
            return prev;
          },
          // 💫 金脈発見
          () => {
            const newMap = prev.map.map(r => [...r]);
            const newHp = prev.hp.map(r => [...r]);
            let count = 0;
            for (let dy = -4; dy <= 4 && count < 5; dy++) {
              for (let dx = -4; dx <= 4 && count < 5; dx++) {
                const nx = cx + dx, ny = cy + dy;
                if (nx > 0 && nx < COLS - 1 && ny > 0 && ny < ROWS - 1 &&
                    (newMap[ny][nx] === B.LIMESTONE || newMap[ny][nx] === B.STONE || newMap[ny][nx] === B.DIRT) &&
                    Math.random() < 0.5) {
                  newMap[ny][nx] = B.GOLD;
                  newHp[ny][nx] = BHP[B.GOLD];
                  count++;
                }
              }
            }
            if (count > 0) flash(`💫 金脈発見！ ${count}箇所に金が出現！`);
            return { map: newMap, hp: newHp };
          },
          // 💎 宝石発見
          () => {
            const newMap = prev.map.map(r => [...r]);
            const newHp = prev.hp.map(r => [...r]);
            let placed = 0;
            for (let attempt = 0; attempt < 30 && placed < 2; attempt++) {
              const dx = 3 + Math.floor(Math.random() * (COLS - 6));
              const dy = Math.floor(ROWS * 0.5) + Math.floor(Math.random() * (ROWS * 0.45));
              if (dy < ROWS - 1 && newMap[dy][dx] !== B.AIR && newMap[dy][dx] !== B.BEDROCK && newMap[dy][dx] !== B.WATER) {
                newMap[dy][dx] = B.DIAMOND;
                newHp[dy][dx] = BHP[B.DIAMOND];
                placed++;
              }
            }
            if (placed > 0) flash("💎 宝石発見！ 深部にダイヤが出現した！");
            return { map: newMap, hp: newHp };
          },
          // ⚠️ 落盤警告
          () => {
            const newHp = prev.hp.map(r => [...r]);
            let count = 0;
            for (let dy = -3; dy <= 0; dy++) {
              for (let dx = -3; dx <= 3; dx++) {
                const nx = cx + dx, ny = cy + dy;
                if (nx > 0 && nx < COLS - 1 && ny > 0 && ny < ROWS - 1 &&
                    prev.map[ny][nx] !== B.AIR && prev.map[ny][nx] !== B.BEDROCK &&
                    prev.map[ny][nx] !== B.WATER && prev.hp[ny][nx] > 1) {
                  newHp[ny][nx] = 1;
                  count++;
                }
              }
            }
            if (count > 0) flash("⚠️ 落盤注意！ 頭上のブロックが脆くなった！");
            return { map: prev.map, hp: newHp };
          },
          // 🌊 地下水脈
          () => {
            const newMap = prev.map.map(r => [...r]);
            const newHp = prev.hp.map(r => [...r]);
            let spread = 0;
            for (let y = Math.floor(ROWS * 0.4); y < ROWS - 2; y++) {
              for (let x = 1; x < COLS - 1; x++) {
                if (newMap[y][x] === B.WATER) {
                  for (const [ddx, ddy] of [[1,0],[-1,0],[0,1]]) {
                    const nx = x + ddx, ny = y + ddy;
                    if (nx > 0 && nx < COLS - 1 && ny < ROWS - 1 && newMap[ny][nx] === B.AIR && spread < 8) {
                      newMap[ny][nx] = B.WATER;
                      newHp[ny][nx] = 0;
                      spread++;
                    }
                  }
                }
              }
            }
            if (spread > 0) flash("🌊 地下水脈が広がった！");
            else flash("🌊 地下水脈の気配…");
            return { map: newMap, hp: newHp };
          },
        ];
        const chosen = events[Math.floor(Math.random() * events.length)];
        return chosen();
      });
    }, 25000 + Math.random() * 15000);
    return () => clearInterval(interval);
  }, [screen, flash]);

  // --- TITLE ---
  if (screen === "title") {
    return (
      <div ref={rootRef} style={{
        position: "fixed", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: "radial-gradient(ellipse at 50% 30%, #1a1500 0%, #0a0800 40%, #050505 100%)",
        fontFamily: "'Noto Sans JP', sans-serif", color: "#FFD700", overflow: "hidden", touchAction: "none",
      }}>
        <div style={{ fontSize: "clamp(10px,1.8vw,13px)", letterSpacing: 8, color: "#554422", marginBottom: 14 }}>
          ⛏ CAVE MINER ⛏
        </div>
        <div style={{
          fontSize: "clamp(26px,5.5vw,46px)", fontWeight: 900, letterSpacing: 4,
          textShadow: "0 0 20px #FFD700, 0 0 50px #aa8800, 0 2px 0 #664400",
          marginBottom: 8, textAlign: "center",
        }}>金 鉱 脈 伝 説</div>
        <div style={{ fontSize: "clamp(12px,2.2vw,16px)", color: "#aa8844", marginBottom: 10, letterSpacing: 4 }}>
          — 鍾乳洞編 —
        </div>
        <div style={{ fontSize: "clamp(10px,1.6vw,12px)", color: "#665533", marginBottom: 44, letterSpacing: 1, textAlign: "center", lineHeight: 2, padding: "0 24px" }}>
          暗い洞窟の奥深くに眠る黄金を掘り当てろ<br />鍾乳石と地底湖が広がる神秘の世界
        </div>
        <button onClick={startGame} style={{
          padding: "14px 52px", fontSize: "clamp(15px,2.8vw,22px)", fontWeight: 700,
          background: "linear-gradient(180deg, #FFD700, #aa7700)", color: "#1a0f00",
          border: "3px solid #886600", borderRadius: 8, cursor: "pointer",
          fontFamily: "'Noto Sans JP', sans-serif", letterSpacing: 6,
          boxShadow: "0 0 40px rgba(255,170,0,0.2), inset 0 2px 0 rgba(255,255,255,0.2)",
          touchAction: "manipulation",
        }}>洞 窟 突 入</button>
        <div style={{ marginTop: 40, fontSize: "clamp(9px,1.4vw,11px)", color: "#443322", textAlign: "center", lineHeight: 2.4, padding: "0 20px" }}>
          WASD / 矢印: 移動・採掘　　E: ハシゴ　Q: 足場　M: マップ<br />
          タッチ: 画面の十字キーで操作<br />
          入口🏪に戻って金塊を売り、装備を強化しよう！
        </div>
      </div>
    );
  }

  // --- GAME ---
  const T = layout.tile;
  const { gameW, gameH, viewCols, viewRows } = layout;
  const miniW = Math.min(120, vp.w * 0.18);
  const miniH = Math.floor(miniW * ROWS / COLS);
  const mTW = miniW / COLS, mTH = miniH / ROWS;

  const blockColor = (b, x, y) => {
    if (b === B.DIRT) { const h = (x * 374761 + y * 668265) % 100; return h < 30 ? "#7a5c2e" : h < 60 ? "#8a6832" : "#806028"; }
    if (b === B.STONE) { const h = (x * 123457 + y * 789013) % 100; return h < 25 ? "#555568" : h < 50 ? "#606072" : "#5a5a6a"; }
    if (b === B.LIMESTONE) { const h = (x * 234567 + y * 876543) % 100; return h < 25 ? "#8a8878" : h < 50 ? "#9a9485" : h < 75 ? "#928b7c" : "#a09882"; }
    if (b === B.STALACTITE) { const h = (x * 345 + y * 678) % 100; return h < 50 ? "#8aaab8" : "#a0c0cc"; }
    if (b === B.STALAGMITE) { const h = (x * 456 + y * 789) % 100; return h < 50 ? "#809aa8" : "#98b4be"; }
    if (b === B.WATER) return "#2a5a8a";
    if (b === B.GOLD) return "#FFD700";
    if (b === B.DIAMOND) return "#00CED1";
    if (b === B.BEDROCK) return "#252525";
    if (b === B.LADDER) return "#8B4513";
    if (b === B.PLANK) return "#a08050";
    if (b === B.ENTRANCE) return "transparent";
    return "#444";
  };

  return (
    <div ref={rootRef} style={{
      position: "fixed", inset: 0, background: "#0e0e14",
      fontFamily: "'Noto Sans JP', sans-serif", display: "flex", flexDirection: "column",
      color: "#ddd", userSelect: "none", WebkitUserSelect: "none", overflow: "hidden", touchAction: "none",
    }}>
      {/* HUD */}
      <div style={{
        width: "100%", height: "clamp(48px,7vh,64px)", flexShrink: 0, display: "flex", alignItems: "center",
        justifyContent: "center", gap: "clamp(8px,2vw,20px)", flexWrap: "nowrap",
        fontSize: "clamp(13px,1.8vw,18px)", padding: "0 12px",
        background: "rgba(0,0,0,0.85)", borderBottom: "1px solid #1a1a1a", overflow: "hidden",
      }}>
        <span style={{ color: "#FFD700", fontWeight: 700 }}>💰¥{money}</span>
        <span style={{ color: "#FFD700" }}>金:{inv.gold}</span>
        <span style={{ color: "#00CED1" }}>💎:{inv.diamond}</span>
        <span style={{ color: "#aa8844" }}>⛏{TOOLS[tool].name}</span>
        <span style={{ color: "#8B4513" }}>🪜{ladders}</span>
        <span style={{ color: "#a08050" }}>🪵{planks}</span>
        <span style={{ color: "#777" }}>深度:{py}</span>
        {fever && <span style={{ color: "#ff4400", fontWeight: 700, animation: "none", textShadow: "0 0 8px #ff6600" }}>⚡フィーバー中</span>}
        <button onClick={() => setShopOpen(true)} style={{
          padding: "4px 12px", fontSize: "clamp(12px,1.6vw,17px)",
          background: atEntrance ? "#2a2000" : "#111",
          color: atEntrance ? "#FFD700" : "#555",
          border: atEntrance ? "1px solid #aa8800" : "1px solid #222",
          borderRadius: 5, fontFamily: "inherit", cursor: "pointer", touchAction: "manipulation", whiteSpace: "nowrap",
        }}>🏪ショップ</button>
        <button onClick={() => setMapView(v => !v)} style={{
          padding: "4px 12px", fontSize: "clamp(12px,1.6vw,17px)",
          background: mapView ? "#1a2a1a" : "#111",
          color: mapView ? "#88cc88" : "#555",
          border: mapView ? "1px solid #448844" : "1px solid #222",
          borderRadius: 5, fontFamily: "inherit", cursor: "pointer", touchAction: "manipulation", whiteSpace: "nowrap",
        }}>🗺️マップ</button>
      </div>

      {/* Game */}
      <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "stretch", justifyContent: "center", position: "relative", overflow: "hidden" }}>
        {/* Character Panel */}
        <div style={{
          width: "clamp(70px, 12vw, 130px)", flexShrink: 0,
          background: "linear-gradient(180deg, #12121e 0%, #1a1028 100%)",
          borderRight: "1px solid #2a1a3a",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end",
          paddingBottom: 16, gap: 6, position: "relative", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", inset: 0,
            background: "radial-gradient(ellipse at 50% 80%, rgba(180,100,255,0.08) 0%, transparent 70%)",
            pointerEvents: "none",
          }} />
          <img
            src={CHAR_IMG[charFace]}
            alt="character"
            style={{
              width: "90%", objectFit: "contain",
              filter: charFace === "hit" ? "drop-shadow(0 0 8px rgba(255,220,50,0.8))" : charFace === "dig" ? "drop-shadow(0 0 4px rgba(150,100,255,0.5))" : "none",
              transition: "filter 0.2s",
            }}
          />
          <div style={{ fontSize: "clamp(8px,1vw,10px)", color: "#666", letterSpacing: 1 }}>
            {charFace === "dig" ? "⛏ 掘削中" : charFace === "hit" ? "✨ 発見！" : "待機中"}
          </div>
        </div>
        <div style={{ width: gameW, height: gameH, position: "relative", overflow: "hidden", background: "#1a1c24" }}>
          <div style={{
            position: "absolute", width: COLS * T, height: ROWS * T,
            transform: `translate(${-camX * T}px, ${-camY * T}px)`,
            transition: "transform 0.1s ease-out",
          }}>
            {/* Render blocks */}
            {mapData && mapData.map.map((row, y) => {
              if (y < camY - 1 || y > camY + viewRows + 1) return null;
              return row.map((block, x) => {
                if (x < camX - 1 || x > camX + viewCols + 1) return null;

                if (block === B.AIR) {
                  return (
                    <div key={`${x}-${y}`} style={{
                      position: "absolute", left: x * T, top: y * T, width: T, height: T,
                      background: "#1a1c24",
                    }} />
                  );
                }

                if (block === B.ENTRANCE) {
                  return (
                    <div key={`${x}-${y}`} style={{
                      position: "absolute", left: x * T, top: y * T, width: T, height: T,
                      background: "#2a2520",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: T * 0.7,
                    }}>🏪</div>
                  );
                }

                if (block === B.WATER) {
                  return (
                    <div key={`${x}-${y}`} style={{
                      position: "absolute", left: x * T, top: y * T, width: T, height: T,
                      background: "linear-gradient(180deg, #1a3a5a 0%, #2a5a8a 40%, #3068a0 100%)",
                      boxShadow: "inset 0 -2px 6px rgba(100,180,255,0.15)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: T * 0.3, color: "rgba(130,200,255,0.4)",
                    }}>～</div>
                  );
                }

                if (block === B.STALACTITE) {
                  const bg = blockColor(block, x, y);
                  return (
                    <div key={`${x}-${y}`} style={{
                      position: "absolute", left: x * T, top: y * T, width: T, height: T,
                      display: "flex", alignItems: "flex-start", justifyContent: "center",
                    }}>
                      <div style={{
                        width: T * 0.35, height: T * 0.9,
                        background: `linear-gradient(180deg, ${bg} 0%, #7a9aaa 100%)`,
                        borderRadius: `${T * 0.1}px ${T * 0.1}px ${T * 0.15}px ${T * 0.15}px`,
                        boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                      }} />
                    </div>
                  );
                }

                if (block === B.STALAGMITE) {
                  const bg = blockColor(block, x, y);
                  return (
                    <div key={`${x}-${y}`} style={{
                      position: "absolute", left: x * T, top: y * T, width: T, height: T,
                      display: "flex", alignItems: "flex-end", justifyContent: "center",
                    }}>
                      <div style={{
                        width: T * 0.4, height: T * 0.85,
                        background: `linear-gradient(0deg, ${bg} 0%, #8aabb8 100%)`,
                        borderRadius: `${T * 0.15}px ${T * 0.15}px ${T * 0.08}px ${T * 0.08}px`,
                        boxShadow: "0 -1px 3px rgba(0,0,0,0.3)",
                      }} />
                    </div>
                  );
                }

                if (block === B.PLANK) {
                  return (
                    <div key={`${x}-${y}`} style={{
                      position: "absolute", left: x * T, top: y * T, width: T, height: T,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <div style={{
                        width: T, height: T * 0.3,
                        background: "linear-gradient(180deg, #b89860 0%, #9a7840 100%)",
                        borderRadius: 2,
                        boxShadow: "0 1px 2px rgba(0,0,0,0.4)",
                        border: "1px solid rgba(80,60,30,0.5)",
                      }} />
                    </div>
                  );
                }

                const bg = blockColor(block, x, y);
                const maxH = BHP[block] || 1, curH = mapData.hp[y][x], dmg = 1 - curH / maxH;

                if (block === B.GOLD) {
                  return (
                    <div key={`${x}-${y}`} style={{
                      position: "absolute", left: x * T, top: y * T, width: T, height: T,
                      backgroundImage: `url("${GOLD_IMG}")`,
                      backgroundSize: "cover", imageRendering: "pixelated",
                      boxSizing: "border-box",
                    }}>
                      {dmg > 0 && <div style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${dmg * 0.5})`, pointerEvents: "none" }} />}
                    </div>
                  );
                }

                return (
                  <div key={`${x}-${y}`} style={{
                    position: "absolute", left: x * T, top: y * T, width: T, height: T,
                    background: bg, boxSizing: "border-box",
                    border: block === B.DIAMOND ? "1px solid #009999"
                      : block === B.LADDER ? "none"
                      : block === B.LIMESTONE ? "1px solid rgba(100,95,80,0.4)"
                      : "1px solid rgba(0,0,0,0.3)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: T * 0.38, fontWeight: 700,
                    color: block === B.DIAMOND ? "rgba(170,255,255,0.8)" : "#6a4020",
                    opacity: block === B.LADDER ? 0.7 : 1,
                    boxShadow: block === B.DIAMOND ? `inset 0 0 ${T * 0.3}px rgba(0,206,209,0.35)` : "none",
                  }}>
                    {block === B.DIAMOND ? "◆" : block === B.LADDER ? "H" : ""}
                    {dmg > 0 && block !== B.LADDER && (
                      <div style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${dmg * 0.4})`, pointerEvents: "none" }} />
                    )}
                  </div>
                );
              });
            })}

            {/* Player */}
            <div style={{
              position: "absolute", left: px * T, top: py * T, width: T, height: T,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: T * 0.7, zIndex: 10,
              filter: "drop-shadow(0 0 6px rgba(255,200,50,0.6))",
              transition: "left 0.08s, top 0.08s",
            }}>⛏️</div>

            {/* Particles */}
            {particles.map(p => (
              <div key={p.id} style={{
                position: "absolute", left: p.x, top: p.y,
                width: 3, height: 3, borderRadius: "50%",
                background: p.color, opacity: p.life / 16,
                pointerEvents: "none", boxShadow: `0 0 4px ${p.color}`, zIndex: 11,
              }} />
            ))}

            {/* Water drips from stalactites */}
            {drips.map(d => {
              const wobble = Math.sin(d.phase + d.y * 0.15) * 0.8;
              const opacity = Math.min(1, d.life / 30);
              const size = Math.max(2, 4 - d.vy * 0.3);
              const stretch = Math.min(2.2, 1 + d.vy * 0.15);
              return (
                <div key={d.id} style={{
                  position: "absolute",
                  left: d.x + wobble - size / 2,
                  top: d.y - size * stretch / 2,
                  width: size,
                  height: size * stretch,
                  borderRadius: `${size * 0.3}px ${size * 0.3}px ${size * 0.5}px ${size * 0.5}px`,
                  background: "radial-gradient(ellipse at 40% 30%, rgba(180,220,255,0.9), rgba(80,150,220,0.6))",
                  opacity,
                  pointerEvents: "none",
                  boxShadow: "0 0 3px rgba(100,180,255,0.4), 0 1px 2px rgba(80,160,240,0.3)",
                  zIndex: 9,
                }} />
              );
            })}
          </div>

          {/* Msg */}
          {msg && (
            <div style={{
              position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)",
              background: "rgba(0,0,0,0.92)", color: "#FFD700",
              padding: "7px 20px", borderRadius: 8, fontSize: "clamp(11px,1.8vw,15px)", fontWeight: 700,
              border: "1px solid #886600", zIndex: 20, whiteSpace: "nowrap",
            }}>{msg}</div>
          )}

          {atEntrance && !shopOpen && (
            <div style={{
              position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)",
              background: "rgba(0,0,0,0.92)", color: "#FFD700",
              padding: "6px 14px", borderRadius: 8, fontSize: 12,
              border: "1px solid #554400", zIndex: 20,
            }}>🏪 入口ショップ — 売買できます</div>
          )}

          {/* Minimap */}
          <div style={{
            position: "absolute", top: 4, right: 4, zIndex: 15,
            background: "rgba(0,0,0,0.85)", borderRadius: 4, padding: 2,
            border: "1px solid #1a1a1a",
          }}>
            <div style={{ width: miniW, height: miniH, position: "relative", overflow: "hidden" }}>
              {mapData && mapData.map.map((row, y) => row.map((block, x) => {
                if (block === B.AIR || block === B.LADDER || block === B.ENTRANCE) return null;
                const c = block === B.GOLD ? "#FFD700" : block === B.DIAMOND ? "#00CED1"
                  : block === B.WATER ? "#2a5a8a"
                  : block === B.STALACTITE || block === B.STALAGMITE ? "#8ab0be"
                  : block === B.BEDROCK ? "#1a1a1a"
                  : block === B.LIMESTONE ? "#6a6658"
                  : block === B.STONE ? "#444" : "#5a4828";
                return <div key={`m${x}-${y}`} style={{
                  position: "absolute", left: x * mTW, top: y * mTH,
                  width: Math.ceil(mTW), height: Math.ceil(mTH), background: c,
                }} />;
              }))}
              <div
                style={{
                  position: "absolute", left: camX * mTW, top: camY * mTH,
                  width: viewCols * mTW, height: viewRows * mTH,
                  border: "1px solid rgba(255,170,50,0.9)", boxSizing: "border-box",
                  cursor: "grab", touchAction: "none",
                }}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  camDragging.current = true;
                  camDragAccum.current = { x: 0, y: 0 };
                  if (camDragResumeTimer.current) clearTimeout(camDragResumeTimer.current);
                }}
                onPointerMove={(e) => {
                  if (!camDragging.current) return;
                  camDragAccum.current.x += e.movementX;
                  camDragAccum.current.y += e.movementY;
                  const dx = Math.trunc(camDragAccum.current.x / mTW);
                  const dy = Math.trunc(camDragAccum.current.y / mTH);
                  if (dx !== 0) { setCamX(prev => Math.max(0, Math.min(prev + dx, COLS - viewCols))); camDragAccum.current.x -= dx * mTW; }
                  if (dy !== 0) { setCamY(prev => Math.max(0, Math.min(prev + dy, ROWS - viewRows))); camDragAccum.current.y -= dy * mTH; }
                }}
                onPointerUp={() => {
                  camDragging.current = false;
                  if (camDragResumeTimer.current) clearTimeout(camDragResumeTimer.current);
                  camDragResumeTimer.current = setTimeout(() => {
                    camDragging.current = false;
                    setCamX(Math.max(0, Math.min(px - Math.floor(viewCols / 2), COLS - viewCols)));
                    setCamY(Math.max(0, Math.min(py - Math.floor(viewRows / 2), ROWS - viewRows)));
                  }, 2000);
                }}
              />
              <div style={{
                position: "absolute", left: px * mTW - 1.5, top: py * mTH - 1.5,
                width: 4, height: 4, borderRadius: "50%",
                background: "#ff8800", boxShadow: "0 0 4px #ff6600",
              }} />
            </div>
          </div>
        </div>

        {/* D-Pad */}
        <div style={{ position: "absolute", bottom: 12, left: "calc(clamp(70px, 12vw, 130px) + 12px)", zIndex: 30 }}>
          <DPad onMove={tryMove} />
        </div>

        {/* Action buttons - bottom right */}
        <div style={{ position: "absolute", bottom: 16, right: 16, zIndex: 30, display: "flex", gap: 10 }}>
          <div onPointerDown={placePlank} style={{
            width: 60, height: 60, borderRadius: 14,
            display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column",
            background: planks > 0 ? "rgba(160,128,80,0.35)" : "rgba(255,255,255,0.04)",
            border: planks > 0 ? "1px solid rgba(160,128,80,0.4)" : "1px solid rgba(255,255,255,0.08)",
            color: planks > 0 ? "#b89860" : "rgba(255,255,255,0.12)",
            fontSize: 22, touchAction: "none", userSelect: "none", WebkitUserSelect: "none", cursor: "pointer",
          }}>
            🪵
            <span style={{ fontSize: 10, marginTop: 2, opacity: 0.7 }}>x{planks}</span>
          </div>
          <div onPointerDown={placeLadder} style={{
            width: 60, height: 60, borderRadius: 14,
            display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column",
            background: ladders > 0 ? "rgba(139,69,19,0.35)" : "rgba(255,255,255,0.04)",
            border: ladders > 0 ? "1px solid rgba(187,136,68,0.4)" : "1px solid rgba(255,255,255,0.08)",
            color: ladders > 0 ? "#bb8844" : "rgba(255,255,255,0.12)",
            fontSize: 22, touchAction: "none", userSelect: "none", WebkitUserSelect: "none", cursor: "pointer",
          }}>
            🪜
            <span style={{ fontSize: 10, marginTop: 2, opacity: 0.7 }}>x{ladders}</span>
          </div>
        </div>
      </div>

      {/* Full Map View */}
      {mapView && mapData && (() => {
        const pad = 20;
        const availW = vp.w - pad * 2;
        const availH = vp.h - pad * 2 - 50;
        const fmTile = Math.max(4, Math.min(Math.floor(availW / COLS), Math.floor(availH / ROWS)));
        const fmW = COLS * fmTile;
        const fmH = ROWS * fmTile;
        const fmBlockColor = (b, x, y) => {
          if (b === B.AIR) return "#1a1c24";
          if (b === B.ENTRANCE) return "#44aa44";
          if (b === B.WATER) return "#2a5a8a";
          if (b === B.GOLD) return "#FFD700";
          if (b === B.DIAMOND) return "#00CED1";
          if (b === B.STALACTITE || b === B.STALAGMITE) return "#8ab0be";
          if (b === B.LIMESTONE) { const h = (x * 234567 + y * 876543) % 100; return h < 50 ? "#7a7668" : "#8a8474"; }
          if (b === B.STONE) return "#505060";
          if (b === B.BEDROCK) return "#1a1a1a";
          if (b === B.LADDER) return "#cc8844";
          if (b === B.PLANK) return "#b89860";
          if (b === B.DIRT) return "#6a5228";
          return "#444";
        };
        return (
          <div style={{
            position: "fixed", inset: 0, zIndex: 90,
            background: "rgba(0,0,0,0.88)", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", touchAction: "none",
          }} onClick={() => setMapView(false)}>
            <div style={{ color: "#888", fontSize: 13, marginBottom: 8, letterSpacing: 2 }}>
              🗺️ 全体マップ — タップで閉じる
            </div>
            <div style={{
              width: fmW, height: fmH, position: "relative",
              border: "2px solid #333", borderRadius: 4, overflow: "hidden",
              boxShadow: "0 0 40px rgba(0,0,0,0.5)",
            }}>
              {mapData.map.map((row, y) => row.map((block, x) => {
                const c = fmBlockColor(block, x, y);
                return (
                  <div key={`fm${x}-${y}`} style={{
                    position: "absolute", left: x * fmTile, top: y * fmTile,
                    width: fmTile, height: fmTile, background: c,
                  }} />
                );
              }))}
              {/* Current viewport rectangle */}
              <div style={{
                position: "absolute",
                left: camX * fmTile, top: camY * fmTile,
                width: viewCols * fmTile, height: viewRows * fmTile,
                border: "2px solid rgba(255,255,255,0.3)", boxSizing: "border-box",
                borderRadius: 2,
              }} />
              {/* Player position */}
              <div style={{
                position: "absolute",
                left: px * fmTile + fmTile / 2 - 5,
                top: py * fmTile + fmTile / 2 - 5,
                width: 10, height: 10, borderRadius: "50%",
                background: "#ff4444", boxShadow: "0 0 8px #ff0000, 0 0 16px rgba(255,0,0,0.4)",
                zIndex: 2,
              }} />
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 11, color: "#666", flexWrap: "wrap", justifyContent: "center" }}>
              <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#FFD700", borderRadius: 2, marginRight: 4, verticalAlign: "middle" }} />金鉱</span>
              <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#00CED1", borderRadius: 2, marginRight: 4, verticalAlign: "middle" }} />ダイヤ</span>
              <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#2a5a8a", borderRadius: 2, marginRight: 4, verticalAlign: "middle" }} />地底湖</span>
              <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#44aa44", borderRadius: 2, marginRight: 4, verticalAlign: "middle" }} />入口</span>
              <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#ff4444", borderRadius: "50%", marginRight: 4, verticalAlign: "middle" }} />現在地</span>
            </div>
          </div>
        );
      })()}

      {/* Shop Modal */}
      {shopOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 100,
          background: "rgba(0,0,0,0.85)", display: "flex",
          alignItems: "center", justifyContent: "center", touchAction: "none",
        }} onClick={() => setShopOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            width: Math.min(380, vp.w - 24), maxHeight: vp.h - 40,
            background: "#0e0e0e", borderRadius: 12, border: "2px solid #2a2a2a",
            padding: 18, overflowY: "auto", color: "#ddd",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: "#FFD700" }}>🏪 入口ショップ</span>
              <button onClick={() => setShopOpen(false)} style={{
                background: "none", border: "none", color: "#555", fontSize: 26, cursor: "pointer",
                padding: "4px 8px", touchAction: "manipulation", lineHeight: 1,
              }}>✕</button>
            </div>

            {!atEntrance && (
              <div style={{
                background: "#1a0f00", border: "1px solid #443300", borderRadius: 8,
                padding: 12, marginBottom: 14, color: "#aa8844", fontSize: 13, textAlign: "center",
              }}>入口🏪に戻ると売買できます</div>
            )}

            <div style={{ marginBottom: 14 }}>
              <div style={{ color: "#FFD700", fontWeight: 700, marginBottom: 6, fontSize: 14 }}>💰 売却</div>
              <div style={{ color: "#777", fontSize: 12, marginBottom: 6 }}>
                金塊 {inv.gold}個 (¥{inv.gold * GP}) / ダイヤ {inv.diamond}個 (¥{inv.diamond * DP})
              </div>
              <button onClick={sell} disabled={!atEntrance} style={{
                width: "100%", padding: "10px 0", fontSize: 14, fontWeight: 700,
                background: atEntrance ? "linear-gradient(180deg,#FFD700,#bb8800)" : "#1a1a1a",
                color: atEntrance ? "#1a0f00" : "#444",
                border: atEntrance ? "1px solid #886600" : "1px solid #222",
                borderRadius: 6, fontFamily: "inherit", cursor: atEntrance ? "pointer" : "not-allowed",
                touchAction: "manipulation",
              }}>全て売る (¥{inv.gold * GP + inv.diamond * DP})</button>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ color: "#aa8844", fontWeight: 700, marginBottom: 6, fontSize: 14 }}>⛏ ツール強化</div>
              {TOOLS.map((t, i) => (
                <button key={i} onClick={() => { if (atEntrance) buyTool(i); }}
                  disabled={!atEntrance || i <= tool || money < t.cost}
                  style={{
                    width: "100%", padding: "6px 10px", fontSize: 12, marginBottom: 3,
                    background: i === tool ? "#1a1a00" : "#111",
                    color: i === tool ? "#FFD700" : i < tool ? "#333" : "#999",
                    border: i === tool ? "1px solid #886600" : "1px solid #1a1a1a",
                    borderRadius: 4, fontFamily: "inherit", textAlign: "left",
                    cursor: (atEntrance && i > tool && money >= t.cost) ? "pointer" : "default",
                    touchAction: "manipulation",
                  }}>
                  {t.name} (パワー:{t.power})
                  {i > tool && <span style={{ float: "right", color: "#aa7700" }}>¥{t.cost}</span>}
                  {i === tool && <span style={{ float: "right", color: "#FFD700" }}>装備中</span>}
                  {i < tool && i > 0 && <span style={{ float: "right", color: "#333" }}>済</span>}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <button onClick={() => { if (atEntrance) buyLadder(); }} disabled={!atEntrance || money < 50} style={{
                flex: 1, padding: "10px 0", fontSize: 13,
                background: (atEntrance && money >= 50) ? "#1a1200" : "#111",
                color: (atEntrance && money >= 50) ? "#bb8844" : "#333",
                border: "1px solid #1a1a1a", borderRadius: 6, fontFamily: "inherit",
                cursor: (atEntrance && money >= 50) ? "pointer" : "default", touchAction: "manipulation",
              }}>🪜 ハシゴ x3<br /><span style={{ fontSize: 11 }}>¥50</span></button>
              <button onClick={() => { if (atEntrance) buyPlank(); }} disabled={!atEntrance || money < 50} style={{
                flex: 1, padding: "10px 0", fontSize: 13,
                background: (atEntrance && money >= 50) ? "#1a1000" : "#111",
                color: (atEntrance && money >= 50) ? "#b89860" : "#333",
                border: "1px solid #1a1a1a", borderRadius: 6, fontFamily: "inherit",
                cursor: (atEntrance && money >= 50) ? "pointer" : "default", touchAction: "manipulation",
              }}>🪵 足場 x3<br /><span style={{ fontSize: 11 }}>¥50</span></button>
              <button onClick={() => { if (atEntrance) newMapBtn(); }} disabled={!atEntrance || money < 300} style={{
                flex: 1, padding: "10px 0", fontSize: 13,
                background: (atEntrance && money >= 300) ? "#0e0e20" : "#111",
                color: (atEntrance && money >= 300) ? "#7777bb" : "#333",
                border: "1px solid #1a1a1a", borderRadius: 6, fontFamily: "inherit",
                cursor: (atEntrance && money >= 300) ? "pointer" : "default", touchAction: "manipulation",
              }}>🗺️ 新しい洞窟<br /><span style={{ fontSize: 11 }}>¥300</span></button>
            </div>

            <div style={{ color: "#333", fontSize: 11, textAlign: "center" }}>
              総売上: ¥{totalSold}　/　パワー: {TOOLS[tool].power}　/　所持金: ¥{money}
            </div>
          </div>
        </div>
      )}

      <style>{`
        *,*::before,*::after{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        html,body,#root{margin:0;padding:0;width:100%;height:100%;overflow:hidden}
        button:active{opacity:.8}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#222;border-radius:2px}
      `}</style>
    </div>
  );
}
