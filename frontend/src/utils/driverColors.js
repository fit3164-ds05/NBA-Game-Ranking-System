export const DRIVER_COLORS = [
  "#2563eb",
  "#ea580c",
  "#16a34a",
  "#7c3aed",
  "#facc15",
  "#b45309",
  "#0ea5e9",
  "#f472b6",
  "#10b981",
  "#f97316",
];

export function colorForIndex(index) {
  if (!Number.isFinite(index) || index < 0) {
    return DRIVER_COLORS[0];
  }
  return DRIVER_COLORS[index % DRIVER_COLORS.length];
}

export function buildColorMap(keys = []) {
  const map = new Map();
  keys.forEach((key, idx) => {
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, colorForIndex(map.size));
    }
  });
  return map;
}
