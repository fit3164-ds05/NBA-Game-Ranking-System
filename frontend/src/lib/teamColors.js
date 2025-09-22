// teamColors.js
// Provides deterministic, visually distinct colors for teams.
// If a team is known in the map below, use the brand color; otherwise fall back
// to a hash-based HSL color so new/historic teams still render consistently.

// Minimal curated palette for common NBA teams (extend as desired)
const TEAM_COLORS = {
  "Atlanta Hawks": "#E03A3E",       // Hawks Red (main color of the hawk logo):contentReference[oaicite:1]{index=1}
  "Boston Celtics": "#007A33",      // Celtics Green – primary color of the shamrock/logo:contentReference[oaicite:2]{index=2}
  "Brooklyn Nets": "#000000",       // Black – dominant in the Nets logo:contentReference[oaicite:3]{index=3}
  "Charlotte Hornets": "#00788C",   // Teal – most visible color in the Hornets emblem:contentReference[oaicite:4]{index=4}
  "Chicago Bulls": "#CE1141",       // Bulls Red:contentReference[oaicite:5]{index=5}
  "Cleveland Cavaliers": "#860038", // Cavaliers Wine – the large shield color:contentReference[oaicite:6]{index=6}
  "Dallas Mavericks": "#00538C",    // Royal Blue – dominant in the horse/ball mark:contentReference[oaicite:7]{index=7}
  "Denver Nuggets": "#0E2240",      // Midnight Blue – primary field behind the Nuggets logo:contentReference[oaicite:8]{index=8}
  "Detroit Pistons": "#C8102E",     // Pistons Red – central field of the badge:contentReference[oaicite:9]{index=9}
  "Golden State Warriors": "#FFC72C",// Golden Yellow – fills the bridge in the Warriors logo:contentReference[oaicite:10]{index=10}
  "Houston Rockets": "#CE1141",     // Rockets Red – primary color of the “R” rocket icon:contentReference[oaicite:11]{index=11}
  "Indiana Pacers": "#002D62",      // Pacers Blue – background color of the “P” icon:contentReference[oaicite:12]{index=12}
  "Los Angeles Clippers": "#C8102E",// Clippers Red – fills the “C” in their primary logo:contentReference[oaicite:13]{index=13}
  "Los Angeles Lakers": "#552583",  // Lakers Purple – main color around the wordmark and ball:contentReference[oaicite:14]{index=14}
  "Memphis Grizzlies": "#12173F",   // Navy – dominant head/outline color of the grizzly logo:contentReference[oaicite:15]{index=15}
  "Miami Heat": "#98002E",          // Heat Red – core color of the flaming basketball:contentReference[oaicite:16]{index=16}
  "Milwaukee Bucks": "#00471B",     // Good Land Green – fills the deer's body in the logo:contentReference[oaicite:17]{index=17}
  "Minnesota Timberwolves": "#0C2340",// Midnight Blue – largest area of the circular logo:contentReference[oaicite:18]{index=18}
  "New Orleans Pelicans": "#0C2340",// Pelicans Navy – dominant background color:contentReference[oaicite:19]{index=19}
  "New York Knicks": "#006BB6",     // Knicks Blue – primary field of the crest:contentReference[oaicite:20]{index=20}
  "Oklahoma City Thunder": "#007AC1",// Thunder Blue – dominant color in the shield:contentReference[oaicite:21]{index=21}
  "Orlando Magic": "#0077C0",       // Magic Blue – fills the basketball and wordmark:contentReference[oaicite:22]{index=22}
  "Philadelphia 76ers": "#006BB6",  // Sixers Blue – primary color of the “76ers” typeface:contentReference[oaicite:23]{index=23}
  "Phoenix Suns": "#1D1160",        // Purple – background of the sunburst logo:contentReference[oaicite:24]{index=24}
  "Portland Trail Blazers": "#E03A3E",// Trail Blazers Red – fills the ribbon mark:contentReference[oaicite:25]{index=25}
  "Sacramento Kings": "#5A2D81",    // Kings Purple – main color of the crown icon:contentReference[oaicite:26]{index=26}
  "San Antonio Spurs": "#000000",   // Black – primary color of the Spurs wordmark:contentReference[oaicite:27]{index=27}
  "Toronto Raptors": "#CE1141",     // Raptors Red – dominant color of the basketball claw logo:contentReference[oaicite:28]{index=28}
  "Utah Jazz": "#002B5C",           // Jazz Navy – fills the note logo:contentReference[oaicite:29]{index=29}
  "Washington Wizards": "#E31837"   // Wizards Red – the prominent top half of the ball logo:contentReference[oaicite:30]{index=30}
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

