// frontend/src/pages/GamePrediction.jsx
// This page lets the user pick two teams and their seasons, then get a prediction
// for the outcome of the matchup. It integrates with API helpers in lib/api.js.
// Rules enforced:
// - The same team can be picked for home and away, but the seasons must differ.

import { useCallback, useEffect, useMemo, useState } from "react";
import { getTeams, getSeasons, predictGame } from "../lib/api";
import RatingChart from "../components/RatingChart";
import { getTeamColor, getTeamHighlightColor } from "../lib/teamColors";
import { buildFactorNarrative } from "../utils/featureNarratives";
import FloatingCard from "../components/FloatingCard";
import chartLineIcon from "../assets/chartline.svg";
import chartLineDownIcon from "../assets/chartlinedown.svg";
import clockLinesIcon from "../assets/clocklines.svg";

function TrendUpIcon({ className = "", ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M3 17h18" />
      <path d="M4.5 12.5 9.5 7.5 13.5 11.5 20 5" />
    </svg>
  );
}

function TrendDownIcon({ className = "", ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M3 17h18" />
      <path d="m4.5 7.5 5 5 4-4 6.5 6.5" />
    </svg>
  );
}

function CompassIcon({ className = "", ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="8.5" />
      <path fill="currentColor" stroke="none" d="m10.3 10.3 7-2-2 7-7 2z" />
      <circle
        cx="12"
        cy="12"
        r="1.2"
        fill="currentColor"
        fillOpacity="0.2"
        stroke="currentColor"
        strokeWidth="0.6"
      />
    </svg>
  );
}

function ShieldIcon({ className = "", ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M12 3 19 7v5c0 5.4-3.7 9.9-7 11-3.3-1.1-7-5.6-7-11V7l7-4Z" />
    </svg>
  );
}

function TargetIcon({ className = "", ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function StatusDotIcon({ className = "", ...props }) {
  return (
    <svg viewBox="0 0 8 8" fill="currentColor" className={className} aria-hidden="true" {...props}>
      <circle cx="4" cy="4" r="3.5" />
    </svg>
  );
}

function formatSeasonLabel(year) {
  const numeric = Number(year);
  if (!Number.isFinite(numeric)) {
    return String(year ?? "");
  }
  const startYear = numeric;
  const endYear = numeric + 1;
  const startShort = String(startYear).slice(-2).padStart(2, "0");
  const endShort = String(endYear).slice(-2).padStart(2, "0");
  return `${startShort}/${endShort}`;
}

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
    <FloatingCard tone="light" padding="p-5" wrapChildren={false}>
      <div className="space-y-3">
        <h3 className="text-lg font-medium">{title}</h3>
        <Select label="Team" value={team} onChange={(e) => onTeam(e.target.value)}>
          {teams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
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
              {formatSeasonLabel(yr)}
            </option>
          ))}
        </Select>
        {help && <p className="text-xs text-gray-500">{help}</p>}
      </div>
    </FloatingCard>
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

  const [loading, setLoading] = useState(false); // Prediction request in progress
  const [loadingTeams, setLoadingTeams] = useState(true); // Initial team list loading
  const [error, setError] = useState(""); // Error message for UI
  const [result, setResult] = useState(null); // Prediction result from API
  const [activeModel, setActiveModel] = useState("xgboost");
  const [teamSeasonBounds, setTeamSeasonBounds] = useState({});

  const allowedSeasonLists = useMemo(() => {
    const map = {};
    if (teamSeasonBounds && typeof teamSeasonBounds === "object") {
      Object.entries(teamSeasonBounds).forEach(([team, bounds]) => {
        if (!bounds || typeof bounds !== "object") return;
        const first = Number(bounds.first_year);
        const last = Number(bounds.last_year);
        if (!Number.isFinite(first) || !Number.isFinite(last)) return;
        const start = Math.min(first, last);
        const end = Math.max(first, last);
        const years = [];
        for (let year = end; year >= start; year -= 1) {
          years.push(year);
        }
        map[team] = years;
      });
    }
    return map;
  }, [teamSeasonBounds]);

  const clampSeasons = useCallback(
    (team, seasons) => {
      const incoming = Array.isArray(seasons)
        ? seasons.filter((yr) => Number.isFinite(Number(yr))).map((yr) => Number(yr))
        : [];
      const allowed = allowedSeasonLists[team];
      if (allowed && allowed.length) {
        const allowedSet = new Set(allowed);
        const filtered = incoming.filter((yr) => allowedSet.has(yr));
        if (filtered.length) {
          return Array.from(new Set(filtered)).sort((a, b) => b - a);
        }
        return allowed;
      }
      return Array.from(new Set(incoming)).sort((a, b) => b - a);
    },
    [allowedSeasonLists]
  );

  // Derived: whether the same team is picked
  const sameTeam = homeTeam && awayTeam && homeTeam === awayTeam;

  // ===== Load teams on mount =====
  useEffect(() => {
    let active = true;
    async function run() {
      try {
        const { teams: list, seasonBounds } = await getTeams();
        if (!active) return;
        setTeams(list);
        setTeamSeasonBounds(seasonBounds || {});

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
        const filtered = clampSeasons(homeTeam, list);
        setHomeSeasons(filtered);
        setHomeSeason((prev) => {
          if (!Array.isArray(filtered) || filtered.length === 0) {
            const allowed = allowedSeasonLists[homeTeam];
            return allowed && allowed.length ? allowed[0] : undefined;
          }
          if (typeof prev === "number" && filtered.includes(prev)) {
            return prev;
          }
          return filtered[0];
        });
      } catch (e) {
        setError(e.message || "Failed to load seasons for home team");
      }
    }
    run();
    return () => {
      active = false;
    };
  }, [homeTeam, clampSeasons, allowedSeasonLists]);

  // ===== Load away team seasons when away team changes =====
  useEffect(() => {
    let active = true;
    if (!awayTeam) return;
    async function run() {
      try {
        const list = await getSeasons(awayTeam);
        if (!active) return;
        const filtered = clampSeasons(awayTeam, list);
        setAwaySeasons(filtered);
        setAwaySeason((prev) => {
          if (!Array.isArray(filtered) || filtered.length === 0) {
            const allowed = allowedSeasonLists[awayTeam];
            return allowed && allowed.length ? allowed[0] : undefined;
          }
          if (typeof prev === "number" && filtered.includes(prev)) {
            return prev;
          }
          return filtered[0];
        });
      } catch (e) {
        setError(e.message || "Failed to load seasons for away team");
      }
    }
    run();
    return () => {
      active = false;
    };
  }, [awayTeam, clampSeasons, allowedSeasonLists]);

  // ===== Season change handlers =====
  function onHomeSeasonChange(year) {
    setHomeSeason(year);
  }

  function onAwaySeasonChange(year) {
    setAwaySeason(year);
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
    setError("");
    setResult(null);
    setActiveModel("xgboost");
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
    setActiveModel("xgboost");
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

  // When a new result arrives, ensure the active model is available
  useEffect(() => {
    if (!result?.available_models?.length) return;
    setActiveModel((current) => {
      if (result.available_models.includes(current)) {
        return current;
      }
      if (result.available_models.includes("xgboost")) {
        return "xgboost";
      }
      return result.available_models[0];
    });
  }, [result]);

  // Build per-team highlighted years for the RatingChart
  const selectedYearsByTeam = useMemo(() => {
    const map = {};
    if (homeTeam && typeof homeSeason === "number") map[homeTeam] = String(homeSeason);
    if (awayTeam && typeof awaySeason === "number") map[awayTeam] = String(awaySeason);
    return map;
  }, [homeTeam, homeSeason, awayTeam, awaySeason]);

  // ===== Render =====
  return (
    <div className="flex w-full flex-col gap-6 text-slate-900">
      {/* Page header */}
      <FloatingCard
        title="Predict a game outcome"
        body="Choose teams and seasons to compare rankings and predict a winner over the seasons chosen. You can pick the same team on both sides as long as the seasons differ."
      />

      {/* Loading state for team list */}
      {loadingTeams && (
        <FloatingCard tone="light" padding="p-4" wrapChildren={false}>
          Loading teams
        </FloatingCard>
      )}

      {/* Main form */}
      <form onSubmit={onPredict} className="space-y-6">
        <div className="bg-white border rounded-2xl p-4 shadow-sm space-y-4">
          <p className="text-sm text-gray-600">
            Choose teams and seasons. You can pick the same team on both sides as long as the seasons differ.
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            <TeamSelectCard
              title="Home"
              teams={teams}
              seasons={homeSeasons}
              team={homeTeam}
              season={homeSeason}
              onTeam={(t) => {
                setHomeTeam(t);
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
                setAwaySeason(undefined);
                setAwaySeasons([]);
              }}
              onSeason={onAwaySeasonChange}
              disabledSeasonOptions={disabledAwaySeasons}
              help="Away selection and season"
            />
          </div>

        {/* Actions row */}
        <FloatingCard
          tone="light"
          padding="p-4"
          className="flex flex-col md:flex-row items-start md:items-center gap-3 justify-between"
          wrapChildren={false}
        >
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

        <div className="flex justify-center">
          <button
            type="submit"
            className="rounded-lg bg-black text-white px-5 py-2 font-medium disabled:opacity-60 cursor-pointer"
            disabled={loading}
          >
            {loading ? "Predicting" : "Predict"}
          </button>
        </div>

        <div className="flex justify-center md:justify-end">
          <button
            type="button"
            className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium hover:bg-gray-200"
            onClick={resetAll}
          >
            Reset teams and seasons
          </button>
        </div>
      </FloatingCard>
      </div>

        {/* Error display */}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-red-700">
            {error}
          </div>
        )}

        <RatingChart
          teams={[homeTeam, awayTeam].filter(Boolean)}
          selectedYearsByTeam={selectedYearsByTeam}
          showTooltip={false}
          showZoomControls={false}
        />

        {/* Prediction result display */}
        <FloatingCard tone="light" padding="p-4" wrapChildren={false}>
          {!result && !loading && (
            <p className="text-gray-600">Your prediction will appear here.</p>
          )}

          {loading && <p className="text-gray-600">Working on it.</p>}

          {result && (
            <ResultPanel
              result={result}
              activeModel={activeModel}
              onSelectModel={setActiveModel}
            />
          )}
        </FloatingCard>
      </form>
    </div>
  );
}

function formatPercent(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

function formatNumber(value, digits = 1) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

function formatWithUnits(value, unit, digits = 1) {
  const base = formatNumber(value, digits);
  return base === "—" ? base : `${base} ${unit}`;
}

function formatMargin(margin, sigma) {
  const base = formatWithUnits(margin, "pts");
  if (typeof sigma === "number" && !Number.isNaN(sigma)) {
    const spread = formatNumber(sigma, 1);
    if (spread !== "—") {
      return `${base} (±${spread})`;
    }
  }
  return base;
}

function computeConfidence(prob, margin, sigma, marginProb, homeTeam, awayTeam, interval) {
  if (typeof margin === "number" && typeof sigma === "number" && sigma > 0) {
    const z = Math.abs(margin) / sigma;
    const favourite = margin >= 0 ? homeTeam : awayTeam;
    const detailParts = [`margin favours ${favourite} by ${formatNumber(Math.abs(margin), 1)} pts`];
    detailParts.push(`≈ ${formatNumber(z, 2)}σ from even`);
    if (typeof marginProb === "number") {
      detailParts.push(`${formatPercent(marginProb)} via margin model`);
    }
    if (interval && interval.lower_68 !== undefined && interval.upper_68 !== undefined) {
      detailParts.push(`calibrated 68% ${formatPercent(interval.lower_68)}–${formatPercent(interval.upper_68)} (n=${interval.count ?? 0})`);
    }
    const detail = detailParts.join(" · ");
    let label = "Low";
    if (z >= 1.25) {
      label = "High";
    } else if (z >= 0.5) {
      label = "Medium";
    }
    return { label, detail, interval };
  }
  if (typeof prob === "number") {
    const diff = Math.abs(prob - 0.5);
    const detailParts = [`${homeTeam} win chance ${formatPercent(prob)} (50% = even matchup)`];
    if (interval && interval.lower_68 !== undefined && interval.upper_68 !== undefined) {
      detailParts.push(`calibrated 68% ${formatPercent(interval.lower_68)}–${formatPercent(interval.upper_68)} (n=${interval.count ?? 0})`);
    }
    const detail = detailParts.join(" · ");
    let label = "Low";
    if (diff >= 0.2) {
      label = "High";
    } else if (diff >= 0.08) {
      label = "Medium";
    }
    return { label, detail, interval };
  }
  return { label: "Unknown", detail: "Insufficient data", interval: null };
}

function formatProbDelta(a, b) {
  if (typeof a !== "number" || typeof b !== "number") return "";
  const delta = Math.round((a - b) * 100);
  if (!Number.isFinite(delta) || delta === 0) return "";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta} ppt`;
}

function explainProbDelta(delta, homeTeam, awayTeam) {
  if (!delta) return "aligns with the classifier odds";
  const value = parseInt(delta.replace(/[^-\d]/g, ""), 10);
  if (!Number.isFinite(value) || value === 0) return "aligns with the classifier odds";
  const magnitude = Math.abs(value);
  const adjective = magnitude >= 10 ? "much" : magnitude >= 5 ? "more" : "slightly";
  const direction = value > 0 ? homeTeam : awayTeam;
  return `${delta} → ${adjective} more confidence in ${direction}`;
}

function describeMarginExpectation(margin) {
  if (typeof margin !== "number" || Number.isNaN(margin)) return "margin unavailable";
  const abs = Math.abs(margin);
  const favours = margin >= 0 ? "home team" : "away team";
  if (abs < 3) return `expects a tight game leaning ${favours}`;
  if (abs < 8) return `sees a modest edge for the ${favours}`;
  return `projects a decisive advantage for the ${favours}`;
}


function ResultPanel({ result, activeModel, onSelectModel }) {
  const models = result?.models ?? {};
  const availableModels = result?.available_models ?? [];
  const orderedModels = [...availableModels].sort((a, b) => {
    if (a === "xgboost") return -1;
    if (b === "xgboost") return 1;
    if (a === "xgb_simple") return -1;
    if (b === "xgb_simple") return 1;
    return 0;
  });
  const active = orderedModels.includes(activeModel) ? models[activeModel] : null;
  const otherModels = orderedModels.filter((m) => m !== activeModel);
  const marginProb = typeof active?.win_prob_from_margin === "number" ? active.win_prob_from_margin : null;
  const confidence = computeConfidence(
    typeof active?.home_win_prob === "number" ? active.home_win_prob : null,
    typeof active?.predicted_margin === "number" ? active.predicted_margin : null,
    typeof active?.margin_sigma === "number" ? active.margin_sigma : null,
    marginProb,
    result.inputs.home_team,
    result.inputs.away_team,
    active?.confidence_interval,
  );
  const headToHead = result?.head_to_head ?? null;
  const homeTeamName = result.inputs.home_team;
  const awayTeamName = result.inputs.away_team;
  const driverFactors = Array.isArray(active?.top_factors) ? active.top_factors : [];
  const driverNarratives = driverFactors
    .map((factor) =>
      buildFactorNarrative(factor, {
        homeTeam: homeTeamName,
        awayTeam: awayTeamName,
        formatNumber,
      }),
    )
    .filter(Boolean);
  const leadNarrative = driverNarratives[0] ?? null;
  const supportingNarratives = leadNarrative ? driverNarratives.slice(1) : driverNarratives;
  const interval = active?.confidence_interval;
  const winProb = typeof active?.home_win_prob === "number" ? active.home_win_prob : null;
  const predictedMargin = typeof active?.predicted_margin === "number" ? active.predicted_margin : null;
  const predictedWinner = winProb !== null ? (winProb >= 0.5 ? homeTeamName : awayTeamName) : null;
  const winnerProb = winProb !== null && predictedWinner ? (predictedWinner === homeTeamName ? winProb : 1 - winProb) : null;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">
          {result.inputs.home_team} {result.inputs.home_season} vs{" "}
          {result.inputs.away_team} {result.inputs.away_season}
        </h3>
        <p className="text-sm text-gray-600">
          Home rating {formatNumber(result.home_rating, 1)} · Away rating {formatNumber(result.away_rating, 1)} · Rating diff {formatNumber(result.rating_diff, 1)}
        </p>
        <p className="text-xs text-gray-400">Model bundle {result.model_version}</p>
      </div>

      {!!result.xgboost_error && (
        <p className="text-sm text-red-600 border border-red-100 bg-red-50 rounded-lg px-3 py-2">
          XGBoost unavailable: {result.xgboost_error}
        </p>
      )}

      {orderedModels.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {orderedModels.map((key) => {
            const label = models[key]?.label || key;
            const isActive = key === activeModel;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelectModel(key)}
                className={`rounded-full border px-4 py-1 text-sm font-medium transition ${
                  isActive ? "bg-black text-white border-black" : "bg-white text-gray-700 hover:bg-gray-100"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {active ? (
        <div className="space-y-3">
          <OutcomeSummary
            title={active.label || activeModel}
            homeTeam={homeTeamName}
            awayTeam={awayTeamName}
            predictedWinner={predictedWinner}
            winnerProb={winnerProb}
            classifierProb={winProb}
            marginProb={marginProb}
            predictedMargin={active.predicted_margin}
            marginSigma={active.margin_sigma}
            confidence={confidence}
          />

          <InterpretationCard
            classifierProb={active.home_win_prob}
            marginProb={marginProb}
            marginValue={active.predicted_margin}
            marginSigma={active.margin_sigma}
            confidence={confidence}
            modelType={activeModel}
            leadDriver={leadNarrative}
            homeTeam={homeTeamName}
            awayTeam={awayTeamName}
          />

          {supportingNarratives.length > 0 ? (
            <DriversCard
              narratives={supportingNarratives}
              title={`Other key drivers (${active.label || activeModel})`}
            />
          ) : activeModel === "xgb_simple" ? (
            <div className="rounded-2xl border bg-white px-4 py-3 text-sm text-gray-500">
              Key drivers unavailable for this matchup.
            </div>
          ) : null}

          {otherModels.length > 0 && (
            <div className="mt-2">
              <h5 className="text-sm font-medium text-gray-600">Model comparison</h5>
              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                {otherModels.map((key) => {
                  const model = models[key];
                  if (!model) return null;
                  const delta = formatProbDelta(active.home_win_prob, model.home_win_prob);
                  const deltaExplanation = explainProbDelta(delta, homeTeamName, awayTeamName);
                  const marginDescription = describeMarginExpectation(model.predicted_margin);
                  return (
                    <li key={key}>
                      <span className="font-medium">{model.label || key}</span>: {formatPercent(model.home_win_prob)}
                      {delta && ` (${deltaExplanation})`}
                      {typeof model.predicted_margin === "number" && ` · margin ${formatMargin(model.predicted_margin, model.margin_sigma)} (${marginDescription})`}
                    </li>
                  );
                })}
              </ul>
              {(() => {
                const deltas = otherModels
                  .map((key) => {
                    const model = models[key];
                    if (!model) return 0;
                    if (typeof active.home_win_prob !== "number" || typeof model.home_win_prob !== "number") return 0;
                    return Math.abs(active.home_win_prob - model.home_win_prob);
                  })
                  .filter((v) => Number.isFinite(v));
                const maxDelta = deltas.length ? Math.max(...deltas) : 0;
                if (maxDelta >= 0.08) {
                  const deltaLabel = `${Math.round(maxDelta * 100)} ppt`;
                  return (
                    <p className="mt-2 text-xs text-amber-600">Models disagree by up to {deltaLabel}; treat this as lower confidence.</p>
                  );
                }
                return null;
              })()}
            </div>
          )}

          {headToHead && <HeadToHeadCard summary={headToHead} homeTeam={result.inputs.home_team} />}
        </div>
      ) : (
        <p className="text-gray-600">Model outputs unavailable.</p>
      )}
    </div>
  );
}

function OutcomeSummary({
  title,
  homeTeam,
  awayTeam,
  predictedWinner,
  winnerProb,
  classifierProb,
  marginProb,
  predictedMargin,
  marginSigma,
  confidence,
}) {
  const stats = [];

  if (typeof classifierProb === "number") {
    const homeChance = formatPercent(classifierProb);
    stats.push({
      key: "classifier",
      label: "Classifier win chance",
      value: homeChance,
      caption: `${homeTeam} chance via classifier`,
      detail: (
        <ProbabilityBar
          value={classifierProb}
          homeLabel={`${homeTeam} ${homeChance}`}
          awayLabel={`${awayTeam} ${formatPercent(1 - classifierProb)}`}
        />
      ),
      tone: "primary",
    });
  }

  if (typeof predictedMargin === "number") {
    const marginCaption = typeof marginProb === "number"
      ? `${formatPercent(marginProb)} chance for ${homeTeam}`
      : "Expected margin from regression";
    stats.push({
      key: "margin",
      label: "Margin projection",
      value: formatMargin(predictedMargin, marginSigma),
      caption: marginCaption,
      detail: (
        <MarginDistribution
          margin={predictedMargin}
          sigma={marginSigma}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          winProb={marginProb}
        />
      ),
      tone: predictedMargin >= 0 ? "success" : "danger",
    });
  } else if (typeof marginProb === "number") {
    stats.push({
      key: "marginProb",
      label: "Margin win chance",
      value: formatPercent(marginProb),
      caption: `${homeTeam} win chance via margin model`,
      tone: "success",
    });
  }

  if (confidence?.label) {
    const detailItems = typeof confidence.detail === "string" ? confidence.detail.split(" · ") : [];
    stats.push({
      key: "confidence",
      label: "Confidence",
      value: confidence.label,
      caption: null,
      detail: (
        <div className="space-y-2">
          <ConfidenceBadge label={confidence.label} />
          {detailItems.length > 0 && (
            <ul className="space-y-1 text-xs text-gray-600">
              {detailItems.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-gray-400">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ),
      tone: getConfidenceTone(confidence.label),
    });
  }

  const summaryParts = [];
  if (predictedWinner && typeof winnerProb === "number") {
    summaryParts.push(`${predictedWinner} win chance ${formatPercent(winnerProb)}`);
  } else if (typeof classifierProb === "number") {
    summaryParts.push(`${homeTeam} win chance ${formatPercent(classifierProb)}`);
  }
  if (typeof predictedMargin === "number") {
    summaryParts.push(`Margin ${formatMargin(predictedMargin, marginSigma)}`);
  }
  if (confidence?.label) {
    summaryParts.push(`${confidence.label} confidence`);
  }
  const summaryLine = summaryParts.join(" · ");

  return (
    <div className="rounded-3xl border bg-white px-5 py-4 shadow-sm">
      <div className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-[0.32em] text-gray-500">Projected winner</p>
        <h4 className="text-2xl font-semibold text-gray-900">
          {predictedWinner || "Prediction unavailable"}
        </h4>
        {summaryLine ? (
          <p className="text-sm text-gray-600">{summaryLine}</p>
        ) : (
          <p className="text-sm text-gray-500">Waiting for model outputs.</p>
        )}
        {title && <p className="text-xs text-gray-400">{title}</p>}
      </div>

      {stats.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map((item) => (
            <StatBlock
              key={item.key}
              label={item.label}
              value={item.value}
              caption={item.caption}
              detail={item.detail}
              tone={item.tone}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StatBlock({ label, value, caption, detail, tone = "neutral" }) {
  const toneStyles = {
    primary: { container: "border-sky-300 bg-white", value: "text-sky-900" },
    success: { container: "border-emerald-300 bg-white", value: "text-emerald-900" },
    warning: { container: "border-amber-300 bg-white", value: "text-amber-900" },
    danger: { container: "border-rose-300 bg-white", value: "text-rose-900" },
    neutral: { container: "border-gray-200 bg-white", value: "text-gray-900" },
  };
  const selected = toneStyles[tone] ?? toneStyles.neutral;
  return (
    <div className={`rounded-2xl border px-4 py-3 shadow-sm ${selected.container}`}>
      <p className="text-xs uppercase tracking-wide text-gray-600">{label}</p>
      <div className={`text-lg font-semibold ${selected.value}`}>{value ?? "—"}</div>
      {caption && <p className="mt-1 text-xs text-gray-600">{caption}</p>}
      {detail && <div className="mt-3">{detail}</div>}
    </div>
  );
}

function ProbabilityBar({ value, homeLabel, awayLabel }) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  const pct = Math.min(1, Math.max(0, value));
  const leftLabel = homeLabel || "Home";
  const rightLabel = awayLabel || "Away";
  return (
    <div>
      <div className="relative h-2 rounded-full bg-gray-200">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-sky-500"
          style={{ width: `${pct * 100}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[0.65rem] uppercase tracking-wider text-gray-500">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  );
}

function MarginDistribution({ margin, sigma, homeTeam, awayTeam, winProb }) {
  if (typeof margin !== "number" || Number.isNaN(margin)) return null;
  const safeSigma = typeof sigma === "number" && sigma > 0 ? sigma : null;
  if (!safeSigma) {
    return (
      <p className="text-xs text-gray-500">Margin model uncertainty unavailable.</p>
    );
  }

  const span = Math.max(safeSigma * 3, Math.abs(margin) * 1.5, 6);
  const width = 200;
  const height = 90;
  const baseline = height - 18;
  const steps = 80;
  const samples = [];
  let maxY = 0;
  for (let i = 0; i <= steps; i += 1) {
    const x = -span + (2 * span * i) / steps;
    const y = Math.exp(-0.5 * ((x - margin) / safeSigma) ** 2);
    maxY = Math.max(maxY, y);
    samples.push({ x, y });
  }

  const mapX = (x) => ((x + span) / (2 * span)) * width;
  const mapY = (y) => baseline - (y / maxY) * (height - 30);

  const curvePath = samples
    .map((point, idx) => `${idx === 0 ? "M" : "L"} ${mapX(point.x)} ${mapY(point.y)}`)
    .join(" ");

  const meanX = mapX(margin);
  const zeroX = mapX(0);
  const awayLabel = awayTeam || "Away";
  const homeLabel = homeTeam || "Home";
  const splitLabel = (label) => {
    if (!label) return { first: "", rest: "" };
    const parts = String(label).split(" ");
    if (parts.length === 1) return { first: parts[0], rest: "" };
    return { first: parts[0], rest: parts.slice(1).join(" ") };
  };
  const awayLabelParts = splitLabel(awayLabel);
  const homeLabelParts = splitLabel(homeLabel);
  const formattedHomeProb = typeof winProb === "number" ? formatPercent(winProb) : null;
  const highlightTeam = margin >= 0 ? homeLabel : awayLabel;
  const highlightProbValue = typeof winProb === "number" ? (margin >= 0 ? winProb : 1 - winProb) : null;
  const highlightProb = highlightProbValue !== null ? formatPercent(highlightProbValue) : null;
  const awayGradient = getTeamHighlightColor(awayTeam);
  const homeGradient = getTeamHighlightColor(homeTeam);
  const awayStroke = getTeamColor(awayTeam);
  const homeStroke = getTeamColor(homeTeam);
  const pointerColor = margin >= 0 ? homeStroke : awayStroke;
  const gradientStyle = {
    background: `linear-gradient(90deg, ${awayGradient} 0%, ${homeGradient} 100%)`,
  };

  const highlightCondition = margin >= 0 ? (point) => point.x >= 0 : (point) => point.x <= 0;
  const highlightedSamples = samples.filter(highlightCondition);
  const highlightPath = highlightedSamples.length
    ? [
        `M ${mapX(margin >= 0 ? 0 : highlightedSamples[0].x)} ${baseline}`,
        highlightedSamples
          .map((point) => `L ${mapX(point.x)} ${mapY(point.y)}`)
          .join(" "),
        `L ${mapX(highlightedSamples[highlightedSamples.length - 1].x)} ${baseline} Z`,
      ].join(" ")
    : "";

  return (
    <div className="space-y-2" style={{ width }}>
      <div className="relative" style={{ height: height }}>
        <svg
          width={width}
          height={height - 16}
          viewBox={`0 0 ${width} ${height - 16}`}
          role="img"
          aria-label="Margin distribution"
          className="absolute inset-x-0 top-0"
        >
          <defs>
            <linearGradient id="marginHighlight" x1="0" x2="1">
              <stop offset="0%" stopColor={awayStroke} stopOpacity="0.15" />
              <stop offset="100%" stopColor={homeStroke} stopOpacity="0.25" />
            </linearGradient>
          </defs>
          <line x1="0" y1={baseline - 16} x2={width} y2={baseline - 16} stroke="#e5e7eb" strokeWidth="1" />
          <line x1={zeroX} y1={baseline - 16} x2={zeroX} y2={baseline - 70} stroke="#4b5563" strokeWidth="2.5" />
          <line x1={meanX} y1={baseline - 16} x2={meanX} y2={baseline - 70} stroke={pointerColor} strokeWidth="2.5" />
          {highlightPath && <path d={highlightPath} fill="url(#marginHighlight)" opacity={0.9} />}
          <path d={`${curvePath}`} fill="none" stroke={pointerColor} strokeWidth="1.5" />
        </svg>
        <div className="absolute inset-x-0 bottom-0">
          <div className="relative h-2 rounded-full" style={gradientStyle}>
            <div className="absolute left-1/2 top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-gray-500" />
            <div
              className="absolute top-1/2 h-3 w-3 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-white shadow"
              style={{ left: `${((Math.max(-span, Math.min(span, margin)) + span) / (2 * span)) * 100}%`, backgroundColor: pointerColor }}
            />
          </div>
        </div>
      </div>
      <div className="flex justify-between text-[0.65rem] uppercase tracking-wider text-gray-500">
        <div className="flex flex-col items-start leading-tight">
          <span>{awayLabelParts.first}</span>
          {awayLabelParts.rest && <span>{awayLabelParts.rest}</span>}
        </div>
        <div className="flex flex-col items-end leading-tight">
          <span>{homeLabelParts.first}</span>
          {homeLabelParts.rest && <span>{homeLabelParts.rest}</span>}
        </div>
      </div>
      <div className="text-xs text-gray-600">
        <span className="font-medium">{formatNumber(margin, 1)} pts</span> mean · σ {formatNumber(safeSigma, 1)} · {highlightTeam} area ≈ {highlightProb || "—"}
      </div>
    </div>
  );
}

function ConfidenceBadge({ label }) {
  const map = {
    high: { bg: "bg-emerald-100", text: "text-emerald-700", dot: "text-emerald-600" },
    medium: { bg: "bg-amber-100", text: "text-amber-700", dot: "text-amber-600" },
    low: { bg: "bg-rose-100", text: "text-rose-700", dot: "text-rose-600" },
    unknown: { bg: "bg-gray-100", text: "text-gray-700", dot: "text-gray-500" },
  };
  const tone = map[label?.toLowerCase()] ?? map.unknown;
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${tone.bg} ${tone.text}`}>
      <StatusDotIcon className={`h-2.5 w-2.5 ${tone.dot}`} />
      <span>{label || "Unknown"} confidence</span>
    </span>
  );
}

function getConfidenceTone(label) {
  const value = (label || "").toLowerCase();
  if (value === "high") return "success";
  if (value === "medium") return "warning";
  if (value === "low") return "danger";
  return "neutral";
}

function InterpretationCard({
  classifierProb,
  marginProb,
  marginValue,
  marginSigma,
  confidence,
  modelType,
  leadDriver,
  homeTeam,
  awayTeam,
}) {
  const homeLabel = homeTeam || "home team";
  const iconClass = "mt-0.5 h-4 w-4 text-gray-500 flex-shrink-0";
  return (
    <div className="rounded-2xl border bg-white px-4 py-3">
      <h5 className="text-sm font-semibold text-gray-700">How to interpret</h5>
      <ul className="mt-2 space-y-2 text-sm text-gray-600">
        <li className="flex items-start gap-2">
          <img
            src={chartLineIcon}
            alt=""
            aria-hidden="true"
            className="mt-0.5 h-5 w-5"
          />
          <span>
            {modelType === "xgb_simple"
              ? `Compact model pegs the home win chance at ${formatPercent(classifierProb)}.`
              : `XGBoost classifier gives ${formatPercent(classifierProb)} chance for ${homeLabel} to win.`}
          </span>
        </li>
        {typeof marginProb === "number" ? (
          <li className="flex items-start gap-2">
            <img
            src={chartLineDownIcon}
            alt=""
            aria-hidden="true"
            className="mt-0.5 h-5 w-5"
          />
            <span>
              Margin model translates {formatMargin(marginValue, marginSigma)} into {formatPercent(marginProb)} home win probability.
            </span>
          </li>
        ) : modelType === "xgb_simple" ? (
          <li className="flex items-start gap-2">
            <img
            src={chartLineDownIcon}
            alt=""
            aria-hidden="true"
            className="mt-0.5 h-5 w-5"
          />
            <span>The compact model does not provide a margin projection—focus on the probability and key drivers.</span>
          </li>
        ) : null}
        {leadDriver && (
          <li className="flex items-start gap-2">
            <img
            src={clockLinesIcon}
            alt=""
            aria-hidden="true"
            className="mt-0.5 h-5 w-5"
          />
            <span>
              Lead driver: <span className="font-medium">{leadDriver.label}</span> — {leadDriver.summary}
            </span>
          </li>
        )}
        <li className="flex items-start gap-2">
          <ShieldIcon className="mt-0.5 h-5 w-5 text-gray-500" aria-hidden="true" />
          <span>Confidence drivers: {confidence.detail}.</span>
        </li>
        {confidence.interval && (
          <li className="flex items-start gap-2">
            <TargetIcon className={iconClass} />
            <span>
              Calibrated 68% interval: {formatPercent(confidence.interval.lower_68)}–{formatPercent(confidence.interval.upper_68)} (based on {confidence.interval.count ?? 0} validation games).
            </span>
          </li>
        )}
      </ul>
    </div>
  );
}

function DriversCard({ narratives, title }) {
  return (
    <div className="rounded-2xl border bg-white px-4 py-3">
      <h5 className="text-sm font-semibold text-gray-700">{title}</h5>
      <ul className="mt-2 space-y-1 text-sm text-gray-600 list-disc list-inside">
        {narratives.map((item) => (
          <li key={item.feature}>
            <span className="font-medium">{item.label}</span>: {item.summary}
          </li>
        ))}
      </ul>
    </div>
  );
}

function HeadToHeadCard({ summary, homeTeam }) {
  const { scope, total_games, home_wins, away_wins, average_margin, recent_games, note, home_team, away_team, recent_heading } = summary;
  const leader = home_wins === away_wins ? "Tied" : home_wins > away_wins ? `${home_team} lead` : `${away_team} lead`;
  return (
    <div className="rounded-2xl border bg-white px-4 py-3">
      <h5 className="text-sm font-semibold text-gray-700">
        {recent_heading || (scope === "season" ? `Head-to-head (${summary.home_season})` : "Head-to-head (historical)")}
      </h5>
      <p className="text-sm text-gray-600 mt-1">
        {leader} {home_wins}-{away_wins} · Average margin {formatNumber(average_margin, 1)} pts
      </p>
      <p className="text-xs text-gray-500 mt-1">{note}</p>
      {recent_games?.length ? (
        <ul className="mt-2 space-y-1 text-sm text-gray-600">
          {recent_games.map((g, idx) => {
            const marginForDisplay = homeTeam === home_team ? g.margin_for_home : -g.margin_for_home;
            return (
              <li key={`${g.date}-${idx}`}>
                <span className="font-medium">{g.date}</span>: {g.home_team} {formatNumber(g.home_score, 0)} – {g.away_team} {formatNumber(g.away_score, 0)} ({formatMargin(marginForDisplay, null)})
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-gray-500 mt-2">No meetings in this context.</p>
      )}
    </div>
  );
}
