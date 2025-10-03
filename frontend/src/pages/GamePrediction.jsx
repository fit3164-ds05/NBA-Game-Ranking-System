// frontend/src/pages/GamePrediction.jsx
// This page lets the user pick two teams and their seasons, then get a prediction
// for the outcome of the matchup. It integrates with API helpers in lib/api.js.
// Rules enforced:
// - The same team can be picked for home and away, but the seasons must differ.

import { useEffect, useMemo, useState } from "react";
import { getTeams, getSeasons, predictGame } from "../lib/api";
import RatingChart from "../components/RatingChart";

const FEATURE_LABELS = {
  rating_diff: "Rating difference",
  is_playoffs: "Playoff indicator",
  YEAR: "Season year",
  TRAD_3P_PCT: "Three-point percentage",
  TRAD_3PA: "Three-point attempts",
  TRAD_DREB: "Defensive rebounds",
  TRAD_OREB: "Offensive rebounds",
  TRAD_FG_PCT: "Field-goal percentage",
  TRAD_FG: "Field goals",
  ADV_DEFRTG: "Defensive rating",
  ADV_OFFRTG: "Offensive rating",
  ADV_PACE: "Pace",
  FF_OPP_EFG_PCT: "Opponent effective FG%",
  FF_OPP_FTA_RATE: "Opponent free-throw rate",
  FF_OPP_OREB_PCT: "Opponent offensive rebound %",
  FF_OPP_TOV_PCT: "Opponent turnover %",
  FF_EFG_PCT: "Effective FG%",
  FF_TOV_PCT: "Turnover %",
  rest_days: "Rest days",
};

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

  const [loading, setLoading] = useState(false); // Prediction request in progress
  const [loadingTeams, setLoadingTeams] = useState(true); // Initial team list loading
  const [error, setError] = useState(""); // Error message for UI
  const [result, setResult] = useState(null); // Prediction result from API
  const [activeModel, setActiveModel] = useState("xgboost");

  // Derived: whether the same team is picked
  const sameTeam = homeTeam && awayTeam && homeTeam === awayTeam;

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
      <header className="mb-4">
        <h1 className="text-2xl md:text-3xl font-semibold">Predict a game outcome</h1>
        <p className="text-gray-600 mt-2">
          Choose teams and seasons. You can pick the same team on both sides as long as the seasons differ.
        </p>
      </header>

      {/* Loading state for team list */}
      {loadingTeams && (
        <div className="rounded-2xl border p-4 bg-white shadow-sm">
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

        <RatingChart
          teams={[homeTeam, awayTeam].filter(Boolean)}
          selectedYearsByTeam={selectedYearsByTeam}
          showTooltip={false}
          showZoomControls={false}
        />

        {/* Prediction result display */}
        <div className="bg-white border rounded-2xl p-4 shadow-sm">
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
        </div>
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
    if (z >= 1.5) {
      label = "High";
    } else if (z >= 0.8) {
      label = "Moderate";
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
      label = "Moderate";
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

function describeContribution(value, homeTeam, awayTeam) {
  if (typeof value !== "number" || Number.isNaN(value)) return "has neutral impact";
  const magnitude = Math.abs(value);
  const favouredTeam = value >= 0 ? homeTeam : awayTeam;
  const strength = magnitude >= 0.2 ? "strongly" : magnitude >= 0.05 ? "noticeably" : "slightly";
  return `${strength} pushes the odds toward the ${favouredTeam}`;
}

function describeDifference(feature, value, homeTeam, awayTeam) {
  if (feature === "YEAR" || feature === "Season year") {
    return `season ${formatNumber(value, 0)} context (recent years shape team form)`;
  }
  if (typeof value !== "number" || Number.isNaN(value)) return `${homeTeam} and ${awayTeam} look similar here`;
  if (Math.abs(value) < 1e-3) return `${homeTeam} and ${awayTeam} look similar here`;
  const isDiff = feature.startsWith("DIFF_");
  const magnitude = Math.abs(value);
  const digits = magnitude >= 100 ? 0 : magnitude >= 10 ? 1 : 2;
  if (isDiff) {
    const leader = value >= 0 ? homeTeam : awayTeam;
    const trailer = value >= 0 ? awayTeam : homeTeam;
    return `${leader} ahead of ${trailer} by ${formatNumber(magnitude, digits)}`;
  }
  return `Current value ${formatNumber(value, digits)} (${homeTeam} perspective)`;
}

function humaniseFeature(feature) {
  if (!feature) return "(unknown feature)";
  const isDiff = feature.startsWith("DIFF_");
  let core = isDiff ? feature.slice(5) : feature;
  let windowText = "";
  const rollMatch = core.match(/_roll(\d+)_(mean|std)$/);
  if (rollMatch) {
    const [, window, stat] = rollMatch;
    windowText = stat === "mean" ? `${window}-game average` : `${window}-game volatility`;
    core = core.replace(/_roll\d+_(mean|std)$/, "");
  }
  const baseLabel = FEATURE_LABELS[core] || toTitleCase(core.replace(/_/g, " "));
  let label = baseLabel;
  if (windowText) {
    label = `${windowText} ${baseLabel}`;
  }
  if (isDiff) {
    label = `Home vs away ${label}`;
  }
  return label;
}

function toTitleCase(text) {
  return text.replace(/\w\S*/g, (token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase());
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
  const driverFactors = Array.isArray(active?.top_factors) ? active.top_factors : [];
  const homeTeamName = result.inputs.home_team;
  const awayTeamName = result.inputs.away_team;
  const interval = active?.confidence_interval;
  const winProb = typeof active?.home_win_prob === "number" ? active.home_win_prob : null;
  const predictedMargin = typeof active?.predicted_margin === "number" ? active.predicted_margin : null;
  const predictedWinner = winProb !== null ? (winProb >= 0.5 ? homeTeamName : awayTeamName) : null;
  const winnerProb = winProb !== null && predictedWinner ? (predictedWinner === homeTeamName ? winProb : 1 - winProb) : null;

  let verdictTitle = "Prediction unavailable";
  let verdictSubtitle = "";
  if (predictedWinner && winnerProb !== null) {
    if (typeof predictedMargin === "number") {
      verdictTitle = `${predictedWinner} projected to win by ${formatNumber(Math.abs(predictedMargin), 1)} pts`;
    } else {
      verdictTitle = `${predictedWinner} win chance ${formatPercent(winnerProb)}`;
    }
    verdictSubtitle = `${predictedWinner} win probability ${formatPercent(winnerProb)} · ${confidence.label} confidence`;
    if (confidence.interval && confidence.interval.lower_68 !== undefined && confidence.interval.upper_68 !== undefined) {
      verdictSubtitle += ` · 68% ${formatPercent(confidence.interval.lower_68)}–${formatPercent(confidence.interval.upper_68)}`;
    }
  }

  const winCaptionParts = [];
  winCaptionParts.push(activeModel === "xgboost" ? "XGBoost classifier" : "Ratings logistic");
  if (interval && interval.lower_68 !== undefined && interval.upper_68 !== undefined) {
    winCaptionParts.push(`68% ${formatPercent(interval.lower_68)}–${formatPercent(interval.upper_68)}`);
  }
  const winCaption = winCaptionParts.join(" · ");

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
          <h4 className="text-base font-medium">{active.label || activeModel}</h4>
          <div className="grid gap-3 md:grid-cols-2">
            <StatBlock
              label="Classifier win probability"
              value={formatPercent(active.home_win_prob)}
              caption="XGBoost classifier"
            />
            <StatBlock
              label="Margin win probability"
              value={formatPercent(marginProb)}
              caption="Derived from margin distribution"
            />
            <StatBlock
              label="Confidence"
              value={confidence.label}
              caption={confidence.detail}
            />
            {typeof active.predicted_margin === "number" && (
              <StatBlock
                label="Predicted margin"
                value={formatMargin(active.predicted_margin, active.margin_sigma)}
                caption={typeof active.margin_sigma === "number" ? "1σ spread" : undefined}
              />
            )}
          </div>

          <InterpretationCard
            classifierProb={active.home_win_prob}
            marginProb={marginProb}
            marginValue={active.predicted_margin}
            marginSigma={active.margin_sigma}
            confidence={confidence}
            modelType={activeModel}
          />

          {driverFactors.length > 0 ? (
            <DriversCard
              factors={driverFactors}
              homeTeam={homeTeamName}
              awayTeam={awayTeamName}
              title={`Key drivers (${active.label || activeModel})`}
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

function StatBlock({ label, value, caption }) {
  return (
    <div className="rounded-xl border bg-gray-50 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-900">{value}</p>
      {caption && <p className="text-xs text-gray-500 mt-1">{caption}</p>}
    </div>
  );
}

function InterpretationCard({ classifierProb, marginProb, marginValue, marginSigma, confidence, modelType }) {
  return (
    <div className="rounded-2xl border bg-white px-4 py-3">
      <h5 className="text-sm font-semibold text-gray-700">How to interpret</h5>
      <ul className="mt-2 space-y-1 text-sm text-gray-600 list-disc list-inside">
        <li>
          {modelType === "xgb_simple"
            ? `Compact model odds ${formatPercent(classifierProb)} come from the simplified XGBoost.`
            : `Classifier odds ${formatPercent(classifierProb)} come directly from the XGBoost probability.`}
        </li>
        {typeof marginProb === "number" ? (
          <li>
            Margin model converts {formatMargin(marginValue, marginSigma)} into {formatPercent(marginProb)} chance of a home win.
          </li>
        ) : modelType === "xgb_simple" ? (
          <li>The compact model does not include a margin projection—focus on the probability and key drivers.</li>
        ) : null}
        <li>
          Confidence is {confidence.label.toLowerCase()} because {confidence.detail}.
        </li>
        {confidence.interval && (
          <li>
            Calibrated 68% interval: {formatPercent(confidence.interval.lower_68)}–{formatPercent(confidence.interval.upper_68)} (based on {confidence.interval.count ?? 0} validation games).
          </li>
        )}
      </ul>
    </div>
  );
}

function DriversCard({ factors, homeTeam, awayTeam, title }) {
  return (
    <div className="rounded-2xl border bg-white px-4 py-3">
      <h5 className="text-sm font-semibold text-gray-700">{title}</h5>
      <ul className="mt-2 space-y-1 text-sm text-gray-600 list-disc list-inside">
        {factors.map((f) => (
          <li key={f.feature}>
            <span className="font-medium">{humaniseFeature(f.feature)}</span>: {describeContribution(f.contribution, homeTeam, awayTeam)}; {describeDifference(f.feature, f.value, homeTeam, awayTeam)}.
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
