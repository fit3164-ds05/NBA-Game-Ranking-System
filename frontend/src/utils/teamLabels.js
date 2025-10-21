const DEFAULT_CURRENT_SEASON_END = 2025;

export function stripParenthetical(name) {
  if (typeof name !== "string") return "";
  const base = name.includes("(") ? name.split("(")[0].trim() : name.trim();
  return base;
}

export function parseSeasonStart(value) {
  if (value == null) return null;
  const token = String(value).split("/", 1)[0];
  const parsed = parseInt(token, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function computeCurrentSeasonEnd(bounds, fallback = DEFAULT_CURRENT_SEASON_END) {
  if (!bounds || typeof bounds !== "object") {
    return fallback;
  }
  let maxStart = null;
  Object.values(bounds).forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const last =
      entry.last_year ??
      entry.lastYear ??
      entry.last ??
      entry.lastSeason ??
      entry.most_recent ??
      null;
    const parsed = parseSeasonStart(last);
    if (parsed != null && (maxStart == null || parsed > maxStart)) {
      maxStart = parsed;
    }
  });
  if (maxStart == null) {
    return fallback;
  }
  return maxStart + 1;
}

export function formatTeamLabel(team, bound, currentSeasonEnd = DEFAULT_CURRENT_SEASON_END) {
  if (!team) return team;
  const base = stripParenthetical(team) || team;
  const first =
    bound?.first_year ??
    bound?.firstYear ??
    bound?.first ??
    bound?.firstSeason ??
    bound?.initial ??
    null;
  const last =
    bound?.last_year ??
    bound?.lastYear ??
    bound?.last ??
    bound?.lastSeason ??
    bound?.final ??
    null;

  const firstYear = parseSeasonStart(first);
  const lastStartYear = parseSeasonStart(last);
  const lastEndYear = lastStartYear != null ? lastStartYear + 1 : null;

  const seasonEndCutoff =
    typeof currentSeasonEnd === "number" && Number.isFinite(currentSeasonEnd)
      ? currentSeasonEnd
      : DEFAULT_CURRENT_SEASON_END;

  if (lastEndYear != null && lastEndYear >= seasonEndCutoff) {
    return base;
  }

  if (firstYear != null && lastEndYear != null) {
    return `${base} (${firstYear}-${lastEndYear})`;
  }

  return base;
}
