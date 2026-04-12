import { COLS, ROWS, B, BHP } from "./constants";

// Limestone cave generation using cellular automata
export function generateMap() {
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
