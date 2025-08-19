// api.js
// Central place for frontend to talk to the Flask backend.
// Pages import these helpers instead of calling axios directly.
// In dev, use a Vite proxy so baseURL can stay as "/api".
// In prod, set VITE_API_BASE_URL to your backend origin, eg https://api.example.com/api

import axios from "axios";

// Create one axios instance for the whole app
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
  timeout: 10000,
});

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
export async function getRatingsSeries({ teams = [], start, end, limit, offset } = {}) {
  const params = {};
  if (Array.isArray(teams) && teams.length) params.teams = teams.join(",");
  if (start) params.start = start;
  if (end) params.end = end;
  if (typeof limit === "number") params.limit = String(limit);
  if (typeof offset === "number") params.offset = String(offset);

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
}