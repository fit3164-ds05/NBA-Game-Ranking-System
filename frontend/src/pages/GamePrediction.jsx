// frontend/src/pages/GamePrediction.jsx
// This page lets the user pick two teams and their seasons, then get a prediction
// for the outcome of the matchup. It integrates with API helpers in lib/api.js.
// Rules enforced:
// - The same team can be picked for home and away, but the seasons must differ.
// - Seasons can be linked (selecting a season for one team sets it for the other)
//   unless the same team is selected.

import { useEffect, useMemo, useState } from "react";
import { getTeams, getSeasons, predictGame } from "../lib/api";

// Simple reusable label component for form fields
function FieldLabel({ children }) {
  return <span className="block text-sm font-medium text-gray-700 mb-1">{children}</span>;
}

// Generic select dropdown with a label
function Select({ label, value, onChange, children }) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <select
        className="w-full rounded-lg border px-3 py-2 bg-white"
        value={value}
        onChange={onChange}
      >
        {children}
      </select>
    </label>
  );
}

// Card-style component for selecting a team and its season
function TeamSelectCard({
  title,
  teams,
  seasons,
  team,
  season,
  onTeam,
  onSeason,
  disabledSeasonOptions = [],
  help,
}) {
  return (
    <div className="bg-white border rounded-2xl p-4 shadow-sm">
      <h3 className="text-lg font-medium mb-3">{title}</h3>

      {/* Team dropdown */}
      <Select label="Team" value={team} onChange={(e) => onTeam(e.target.value)}>
        {teams.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </Select>

      {/* Season dropdown */}
      <div className="mt-3">
        <Select
          label="Season"
          value={season ?? ""}
          onChange={(e) => onSeason(Number(e.target.value))}
        >
          <option value="" disabled>
            Select a season
          </option>
          {seasons.map((yr) => (
            <option key={yr} value={yr} disabled={disabledSeasonOptions.includes(yr)}>
              {yr}
            </option>
          ))}
        </Select>
      </div>

      {/* Optional helper text */}
      {help && <p className="text-xs text-gray-500 mt-2">{help}</p>}
    </div>
  );
}

export default function GamePrediction() {
  // ===== State =====
  const [teams, setTeams] = useState([]); // All available team names from API

  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");

  const [homeSeasons, setHomeSeasons] = useState([]); // Available seasons for home team
  const [awaySeasons, setAwaySeasons] = useState([]); // Available seasons for away team

  const [homeSeason, setHomeSeason] = useState();
  const [awaySeason, setAwaySeason] = useState();

  const [linkSeasons, setLinkSeasons] = useState(true); // Whether seasons are linked across both teams

  const [loading, setLoading] = useState(false); // Prediction request in progress
  const [loadingTeams, setLoadingTeams] = useState(true); // Initial team list loading
  const [error, setError] = useState(""); // Error message for UI
  const [result, setResult] = useState(null); // Prediction result from API

  // Derived: whether the same team is picked
  const sameTeam = homeTeam && awayTeam && homeTeam === awayTeam;
  const canLinkSeasons = !sameTeam;

  // ===== Load teams on mount =====
  useEffect(() => {
    let active = true;
    async function run() {
      try {
        const list = await getTeams();
        if (!active) return;
        setTeams(list);

        // Pre-fill home/away teams if possible
        if (list?.length >= 2) {
          setHomeTeam(list[0]);
          setAwayTeam(list[1]);
        } else if (list?.length === 1) {
          setHomeTeam(list[0]);
        }
      } catch (e) {
        setError(e.message || "Failed to load teams");
      } finally {
        if (active) setLoadingTeams(false);
      }
    }
    run();
    return () => {
      active = false;
    };
  }, []);

  // ===== Load home team seasons when home team changes =====
  useEffect(() => {
    let active = true;
    if (!homeTeam) return;
    async function run() {
      try {
        const list = await getSeasons(homeTeam);
        if (!active) return;
        setHomeSeasons(list);

        // Auto-select first season if none is chosen
        if (!homeSeason && list?.length) {
          setHomeSeason(list[0]);
          if (linkSeasons && canLinkSeasons) setAwaySeason(list[0]);
        }
      } catch (e) {
        setError(e.message || "Failed to load seasons for home team");
      }
    }
    run();
    return () => {
      active = false;
    };
  }, [homeTeam]);

  // ===== Load away team seasons when away team changes =====
  useEffect(() => {
    let active = true;
    if (!awayTeam) return;
    async function run() {
      try {
        const list = await getSeasons(awayTeam);
        if (!active) return;
        setAwaySeasons(list);

        // Auto-select first season if none is chosen
        if (!awaySeason && list?.length) {
          setAwaySeason(list[0]);
          if (linkSeasons && canLinkSeasons) setHomeSeason(list[0]);
        }
      } catch (e) {
        setError(e.message || "Failed to load seasons for away team");
      }
    }
    run();
    return () => {
      active = false;
    };
  }, [awayTeam]);

  // ===== Season change handlers =====
  function onHomeSeasonChange(year) {
    setHomeSeason(year);
    if (linkSeasons && canLinkSeasons) setAwaySeason(year);
  }

  function onAwaySeasonChange(year) {
    setAwaySeason(year);
    if (linkSeasons && canLinkSeasons) setHomeSeason(year);
  }

  // ===== Season disabling logic =====
  // If same team is picked, disable same season on the other dropdown
  const disabledAwaySeasons = useMemo(
    () => (sameTeam && typeof homeSeason === "number" ? [homeSeason] : []),
    [sameTeam, homeSeason]
  );

  const disabledHomeSeasons = useMemo(
    () => (sameTeam && typeof awaySeason === "number" ? [awaySeason] : []),
    [sameTeam, awaySeason]
  );

  // ===== Utility actions =====
  function swapTeams() {
    const t = homeTeam;
    const s = homeSeason;
    setHomeTeam(awayTeam);
    setAwayTeam(t);
    setHomeSeason(awaySeason);
    setAwaySeason(s);
  }

  function resetAll() {
    if (teams.length >= 2) {
      setHomeTeam(teams[0]);
      setAwayTeam(teams[1]);
    } else {
      setHomeTeam(teams[0] || "");
      setAwayTeam("");
    }
    setHomeSeasons([]);
    setAwaySeasons([]);
    setHomeSeason(undefined);
    setAwaySeason(undefined);
    setLinkSeasons(true);
    setError("");
    setResult(null);
  }

  // ===== Validation before predicting =====
  function validate() {
    if (!homeTeam || !awayTeam || !homeSeason || !awaySeason) {
      return "Please select teams and seasons for both sides";
    }
    if (sameTeam && homeSeason === awaySeason) {
      return "If the same team is chosen the seasons must differ";
    }
    return "";
  }

  // ===== Prediction request handler =====
  async function onPredict(e) {
    e.preventDefault();
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError("");
    setLoading(true);
    setResult(null);
    try {
      const data = await predictGame({
        home_team: homeTeam,
        home_season: homeSeason,
        away_team: awayTeam,
        away_season: awaySeason,
      });
      setResult(data);
    } catch (e) {
      setError(e.message || "Prediction failed");
    } finally {
      setLoading(false);
    }
  }

  // ===== Render =====
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Page header */}
      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold">Predict a game outcome</h1>
        <p className="text-gray-600 mt-2">
          Choose teams and seasons. You can pick the same team on both sides as long as the seasons differ.
        </p>
      </header>

      {/* Loading state for team list */}
      {loadingTeams && (
        <div className="rounded-2xl border p-4 bg-white shadow-sm mb-6">
          Loading teams
        </div>
      )}

      {/* Main form */}
      <form onSubmit={onPredict} className="space-y-6">
        {/* Team selectors */}
        <div className="grid md:grid-cols-2 gap-6">
          <TeamSelectCard
            title="Home"
            teams={teams}
            seasons={homeSeasons}
            team={homeTeam}
            season={homeSeason}
            onTeam={(t) => {
              setHomeTeam(t);
              if (!canLinkSeasons && linkSeasons) setLinkSeasons(false);
              setHomeSeason(undefined);
              setHomeSeasons([]);
            }}
            onSeason={onHomeSeasonChange}
            disabledSeasonOptions={disabledHomeSeasons}
            help="Home selection and season"
          />

          <TeamSelectCard
            title="Away"
            teams={teams}
            seasons={awaySeasons}
            team={awayTeam}
            season={awaySeason}
            onTeam={(t) => {
              setAwayTeam(t);
              if (!canLinkSeasons && linkSeasons) setLinkSeasons(false);
              setAwaySeason(undefined);
              setAwaySeasons([]);
            }}
            onSeason={onAwaySeasonChange}
            disabledSeasonOptions={disabledAwaySeasons}
            help="Away selection and season"
          />
        </div>

        {/* Actions row */}
        <div className="bg-white border rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-start md:items-center gap-3 justify-between">
          {/* Swap/reset buttons */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium hover:bg-gray-200"
              onClick={swapTeams}
            >
              Swap teams
            </button>
            <button
              type="button"
              className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium hover:bg-gray-200"
              onClick={resetAll}
            >
              Reset
            </button>
          </div>

          {/* Link seasons toggle */}
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={linkSeasons && canLinkSeasons}
              onChange={(e) => setLinkSeasons(e.target.checked && canLinkSeasons)}
            />
            Link seasons
            {!canLinkSeasons && (
              <span className="text-gray-500">
                Not available when the same team is selected
              </span>
            )}
          </label>

          {/* Submit button */}
          <button
            type="submit"
            className="rounded-lg bg-black text-white px-5 py-2 font-medium disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Predicting" : "Predict"}
          </button>
        </div>

        {/* Error display */}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-red-700">
            {error}
          </div>
        )}

        {/* Prediction result display */}
        <div className="bg-white border rounded-2xl p-4 shadow-sm">
          {!result && !loading && (
            <p className="text-gray-600">Your prediction will appear here.</p>
          )}

          {loading && <p className="text-gray-600">Working on it.</p>}

          {result && (
            <div className="space-y-2">
              <h3 className="text-lg font-medium">
                {result.inputs.home_team} {result.inputs.home_season} vs{" "}
                {result.inputs.away_team} {result.inputs.away_season}
              </h3>
              <p>
                Home rating {result.home_rating.toFixed(1)}. Away rating{" "}
                {result.away_rating.toFixed(1)}.
              </p>
              <p>Home win probability {Math.round(result.home_win_prob * 100)} percent</p>
              <p>Predicted margin {result.predicted_margin.toFixed(1)}</p>
              <p className="text-sm text-gray-500">Model version {result.model_version}</p>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}