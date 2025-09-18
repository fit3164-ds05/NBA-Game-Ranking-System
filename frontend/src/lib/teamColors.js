// teamColors.js
// Provides deterministic, visually distinct colors for teams.
// If a team is known in the map below, use the brand color; otherwise fall back
// to a hash-based HSL color so new/historic teams still render consistently.

// Minimal curated palette for common NBA teams (extend as desired)
const TEAM_COLORS = {
  "Atlanta Hawks": "#E03A3E",
  "Boston Celtics": "#007A33",
  "Brooklyn Nets": "#000000",
  "Charlotte Hornets": "#1D1160",
  "Chicago Bulls": "#CE1141",
  "Cleveland Cavaliers": "#6F263D",
  "Dallas Mavericks": "#00538C",
  "Denver Nuggets": "#0E2240",
  "Detroit Pistons": "#C8102E",
  "Golden State Warriors": "#1D428A",
  "Houston Rockets": "#CE1141",
  "Indiana Pacers": "#002D62",
  "Los Angeles Clippers": "#1D428A",
  "Los Angeles Lakers": "#552583",
  "Memphis Grizzlies": "#5D76A9",
  "Miami Heat": "#98002E",
  "Milwaukee Bucks": "#00471B",
  "Minnesota Timberwolves": "#0C2340",
  "New Orleans Pelicans": "#0C2340",
  "New York Knicks": "#006BB6",
  "Oklahoma City Thunder": "#007AC1",
  "Orlando Magic": "#0077C0",
  "Philadelphia 76ers": "#006BB6",
  "Phoenix Suns": "#1D1160",
  "Portland Trail Blazers": "#E03A3E",
  "Sacramento Kings": "#5A2D81",
  "San Antonio Spurs": "#C4CED4",
  "Toronto Raptors": "#CE1141",
  "Utah Jazz": "#002B5C",
  "Washington Wizards": "#002B5C",
};

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < String(str).length; i++) {
    hash = (hash << 5) - hash + String(str).charCodeAt(i);
    hash |= 0; // convert to 32-bit int
  }
  return Math.abs(hash);
}

function hslColorFromName(name, s = 65, l = 45) {
  const hue = hashString(name) % 360;
  return `hsl(${hue}, ${s}%, ${l}%)`;
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  };
}

function rgbToHex(r, g, b) {
  const toHex = (v) => v.toString(16).padStart(2, "0");
  return `#${toHex(Math.max(0, Math.min(255, Math.round(r))))}${toHex(
    Math.max(0, Math.min(255, Math.round(g)))
  )}${toHex(Math.max(0, Math.min(255, Math.round(b))))}`;
}

function mixWithWhite(hex, weight = 0.2) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const w = 255 * weight;
  return rgbToHex(rgb.r * (1 - weight) + w, rgb.g * (1 - weight) + w, rgb.b * (1 - weight) + w);
}

export function getTeamColor(teamName) {
  const known = TEAM_COLORS[teamName];
  if (known) return known;
  return hslColorFromName(teamName, 65, 45);
}

export function getTeamHighlightColor(teamName) {
  const base = getTeamColor(teamName);
  if (base.startsWith("#")) {
    return mixWithWhite(base, 0.25);
  }
  // base is hsl(...) — slightly higher lightness
  const hue = hashString(teamName) % 360;
  return `hsl(${hue}, 70%, 65%)`;
}

