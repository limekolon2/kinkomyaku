export const COLS = 60;
export const ROWS = 40;
export const B = { AIR: 0, DIRT: 1, STONE: 2, GOLD: 3, DIAMOND: 4, BEDROCK: 5, LADDER: 6, ENTRANCE: 7, STALACTITE: 8, STALAGMITE: 9, WATER: 10, LIMESTONE: 11, PLANK: 12 };
export const BHP = { [B.DIRT]: 1, [B.STONE]: 3, [B.GOLD]: 2, [B.DIAMOND]: 5, [B.BEDROCK]: 999, [B.STALACTITE]: 1, [B.STALAGMITE]: 1, [B.LIMESTONE]: 2 };
export const TOOLS = [
  { name: "木のツルハシ", power: 1, cost: 0 },
  { name: "鉄のツルハシ", power: 2, cost: 3000000 },
  { name: "鋼のツルハシ", power: 3, cost: 8000000 },
  { name: "金のツルハシ", power: 5, cost: 20000000 },
  { name: "ダイヤツルハシ", power: 8, cost: 50000000 },
];
export const GP = 1000000;
export const DP = 5000000;
