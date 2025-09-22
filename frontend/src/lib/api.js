// api.js
// Central place for frontend to talk to the Flask backend.
// Pages import these helpers instead of calling axios directly.
// In dev, use a Vite proxy so baseURL can stay as "/api".
// In prod, set VITE_API_BASE_URL to your backend origin, eg https://api.example.com/api

import axios from "axios";

// Create one axios instance for the whole app
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api",
  // Increase default timeout to accommodate cold-start CSV load
  timeout: Number(import.meta.env.VITE_API_TIMEOUT_MS || 60000),
});

// Simple in-memory cache keyed by request params so repeat visits avoid refetches
const ratingsSeriesCache = new Map();

// Optional: unify success and error handling
api.interceptors.response.use(
  // Always return response so helpers can unwrap data
  res => res,
  err => {
    // Normalise a readable message
    const msg =
      err?.response?.data?.error ||
      err?.message ||
      "Request failed";
    // Re-throw with a friendly message for UI
    return Promise.reject(new Error(msg));
  }
);

// Health check
export async function healthCheck() {
  const { data } = await api.get("/");
  return data?.status === "ok";
}

// Teams list for dropdowns
export async function getTeams() {
  const { data } = await api.get("/teams");
  return data?.teams ?? [];
}

// Seasons for a selected team
export async function getSeasons(team) {
  if (!team) throw new Error("Team is required");
  const { data } = await api.get("/seasons", { params: { team } });
  return data?.seasons ?? [];
}

// Predict outcome
export async function predictGame({ home_team, home_season, away_team, away_season }) {
  if (!home_team || !away_team || !home_season || !away_season) {
    throw new Error("home_team, away_team, home_season and away_season are required");
  }
  const { data } = await api.post("/predict", {
    home_team,
    home_season,
    away_team,
    away_season,
  });
  return data; // { inputs, home_rating, away_rating, rating_diff, home_win_prob, predicted_margin, model_version }
}

// Ratings time series for the chart
export async function getRatingsSeries({ teams = [], start, end, limit, offset, forceRefresh = false } = {}) {
  const cacheKey = JSON.stringify({
    teams: Array.isArray(teams) ? Array.from(new Set(teams)).sort() : [],
    start: start ?? null,
    end: end ?? null,
    limit: typeof limit === "number" ? limit : null,
    offset: typeof offset === "number" ? offset : null,
  });

  if (forceRefresh) {
    ratingsSeriesCache.delete(cacheKey);
  } else {
    const cached = ratingsSeriesCache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const params = {};
  if (Array.isArray(teams) && teams.length) params.teams = teams.join(",");
  if (start) params.start = start;
  if (end) params.end = end;
  if (typeof limit === "number") params.limit = String(limit);
  if (typeof offset === "number") params.offset = String(offset);

  const request = (async () => {
    const res = await api.get("/ratings/series", { params });

    // Some backends may accidentally emit NaN which is invalid JSON.
    // Axios may then treat the payload as a string. Handle both shapes safely.
    let payload = res.data;

    if (typeof payload === "string") {
      try {
        // Replace bare NaN tokens with null so JSON.parse succeeds
        const sanitised = payload.replace(/\bNaN\b/g, "null");
        payload = JSON.parse(sanitised);
      } catch {
        // If parsing fails, return an empty array rather than breaking the UI
        return [];
      }
    }

    if (Array.isArray(payload?.data)) {
      return payload.data; // expected shape: { data: [...] }
    }
    if (Array.isArray(payload)) {
      return payload; // already an array
    }
    return [];
  })();

  ratingsSeriesCache.set(cacheKey, request);

  try {
    const result = await request;
    ratingsSeriesCache.set(cacheKey, result);
    return result;
  } catch (err) {
    ratingsSeriesCache.delete(cacheKey);
    throw err;
  }
}

getRatingsSeries.clearCache = () => ratingsSeriesCache.clear();

export async function searchPlayers(query, season) {
  const { data } = await api.get("/nba/players/search", { params: { q: query, season } });
  return data; // [{ playerId, name, active, team }]
}

export async function getPlayerSeasons(playerId, { onlyWithGames = true } = {}) {
  const { data } = await api.get(`/nba/players/${playerId}/seasons`, {
    params: { only_with_games: onlyWithGames },
  });
  return data; // ["2024-25","2023-24",...]
}

export async function getPlayerShots(playerId, season, { teamId = 0, measure = "FGA" } = {}) {
  const { data } = await api.get(`/nba/players/${playerId}/shots`, {
    params: { season, team_id: teamId, measure },
  });
  return data; // { playerId, season, shots: [...] }
}
