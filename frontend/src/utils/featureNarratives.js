// frontend/src/utils/featureNarratives.js
// Shared helpers for turning model feature contributions into plain-English
// explanations that can be reused across pages.

const FEATURE_LABELS = {
  rating_diff: "Rating difference",
  is_playoffs: "Playoff indicator",
  YEAR: "Season year",
  rest_days: "Rest days",
  TRAD_3P_PCT: "Three-point percentage",
  TRAD_3PA: "Three-point attempts",
  TRAD_AST: "Assists",
  TRAD_BLK: "Blocks",
  TRAD_DREB: "Defensive rebounds",
  TRAD_FG: "Field goals",
  TRAD_FGA: "Field-goal attempts",
  TRAD_FG_PCT: "Field-goal percentage",
  TRAD_FGM: "Field goals made",
  TRAD_FTA: "Free-throw attempts",
  TRAD_FTM: "Free throws made",
  TRAD_OREB: "Offensive rebounds",
  TRAD_PF: "Personal fouls",
  TRAD_PTS: "Points scored",
  TRAD_REB: "Total rebounds",
  TRAD_STL: "Steals",
  TRAD_TOV: "Turnovers",
  ADV_DEFRTG: "Defensive rating",
  ADV_NETRTG: "Net rating",
  ADV_OFFRTG: "Offensive rating",
  ADV_PACE: "Pace",
  ADV_TS_PCT: "True shooting percentage",
  ADV_AST_PCT: "Assist percentage",
  FF_EFG_PCT: "Effective FG%",
  FF_FTA_RATE: "Free-throw rate",
  FF_OREB_PCT: "Offensive rebound %",
  FF_TOV_PCT: "Turnover %",
  FF_OPP_EFG_PCT: "Opponent effective FG%",
  FF_OPP_FTA_RATE: "Opponent free-throw rate",
  FF_OPP_OREB_PCT: "Opponent offensive rebound %",
  FF_OPP_TOV_PCT: "Opponent turnover %",
};

const FEATURE_DESCRIPTORS = {
  ADV_DEFRTG: "defensive rating (points allowed per 100 possessions)",
  ADV_OFFRTG: "offensive rating (points scored per 100 possessions)",
  ADV_NETRTG: "net rating (points per 100 possession differential)",
  ADV_PACE: "pace (possessions per game)",
  ADV_TS_PCT: "true shooting percentage",
  ADV_AST_PCT: "assist percentage",
  FF_EFG_PCT: "effective field-goal percentage",
  FF_TOV_PCT: "turnover percentage",
  FF_FTA_RATE: "free-throw rate",
  FF_OREB_PCT: "offensive rebound percentage",
  FF_OPP_EFG_PCT: "opponent effective field-goal percentage",
  FF_OPP_TOV_PCT: "opponent turnover percentage",
  FF_OPP_FTA_RATE: "opponent free-throw rate",
  FF_OPP_OREB_PCT: "opponent offensive rebound percentage",
  TRAD_FGM: "field goals made",
  TRAD_FGA: "field-goal attempts",
  TRAD_FG_PCT: "field-goal percentage",
  TRAD_3P_PCT: "three-point percentage",
  TRAD_3PA: "three-point attempts",
  TRAD_REB: "total rebounds",
  TRAD_DREB: "defensive rebounds",
  TRAD_OREB: "offensive rebounds",
  TRAD_PTS: "points scored",
  TRAD_AST: "assists",
  TRAD_STL: "steals",
  TRAD_BLK: "blocks",
  TRAD_TOV: "turnovers",
  TRAD_FTA: "free-throw attempts",
  TRAD_FTM: "free throws made",
  TRAD_PF: "personal fouls",
};

const DIFF_LIKE_FEATURES = new Set(["rating_diff"]);

function toTitleCase(text) {
  return text.replace(/\w\S*/g, (token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase());
}

function defaultFormatNumber(value, digits = 1) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

export function getFeatureMeta(feature) {
  if (!feature) {
    return {
      key: "",
      baseLabel: "(unknown feature)",
      label: "(unknown feature)",
      descriptor: "",
      isDiff: false,
      windowSize: null,
      stat: null,
    };
  }

  let raw = feature;
  let isDiff = false;
  if (raw.startsWith("DIFF_")) {
    isDiff = true;
    raw = raw.slice(5);
  }

  let core = raw;
  let windowSize = null;
  let stat = null;
  const rollMatch = core.match(/_roll(\d+)_(mean|std)$/);
  if (rollMatch) {
    windowSize = Number(rollMatch[1]);
    stat = rollMatch[2] === "mean" ? "average" : "volatility";
    core = core.replace(/_roll\d+_(mean|std)$/, "");
  }

  if (DIFF_LIKE_FEATURES.has(core)) {
    isDiff = true;
  }

  const baseLabel = FEATURE_LABELS[core] || toTitleCase(core.replace(/_/g, " "));
  const descriptor = FEATURE_DESCRIPTORS[core] || baseLabel.toLowerCase();

  let label = baseLabel;
  if (windowSize) {
    const prefix = stat === "volatility" ? `Last ${windowSize} games volatility` : `Last ${windowSize} games average`;
    label = `${prefix} ${baseLabel.toLowerCase()}`;
  }

  if (isDiff) {
    label = `Home vs away ${label}`;
  }

  return {
    key: core,
    baseLabel,
    label,
    descriptor,
    isDiff,
    windowSize,
    stat,
  };
}

function buildMetricDescriptor(meta) {
  if (!meta) return "";
  const base = meta.descriptor || meta.baseLabel.toLowerCase();
  if (meta.windowSize) {
    if (meta.stat === "volatility") {
      return `last ${meta.windowSize} games volatility in ${base}`;
    }
    return `last ${meta.windowSize} games average ${base}`;
  }
  if (meta.isDiff) {
    return base;
  }
  return base;
}

export function getFeatureLabel(feature) {
  return getFeatureMeta(feature).label;
}

export function buildFactorNarrative(factor, {
  homeTeam,
  awayTeam,
  formatNumber = defaultFormatNumber,
} = {}) {
  const meta = getFeatureMeta(factor?.feature);
  const contribution = typeof factor?.contribution === "number" ? factor.contribution : 0;
  const value = factor?.value;
  const favouredTeam = contribution >= 0 ? homeTeam : awayTeam;
  const fallbackTeam = favouredTeam || homeTeam || awayTeam || "the highlighted side";
  const opposingTeam = favouredTeam === homeTeam ? awayTeam : favouredTeam === awayTeam ? homeTeam : undefined;
  const magnitude = Math.abs(contribution);
  const impact = magnitude >= 0.2 ? "a strong lift" : magnitude >= 0.05 ? "a noticeable lift" : "a small nudge";

  if (meta.isDiff) {
    if (typeof value === "number" && Number.isFinite(value) && Math.abs(value) >= 1e-3) {
      const valueForFavoured = favouredTeam === homeTeam ? value : -value;
      const absValue = Math.abs(valueForFavoured);
      const digits = absValue >= 100 ? 0 : absValue >= 10 ? 1 : 2;
      const formattedAmount = formatNumber(absValue, digits);
      const descriptor = buildMetricDescriptor(meta);
      if (valueForFavoured >= 0) {
        return {
          feature: factor?.feature ?? meta.key,
          label: meta.label,
          summary: `${favouredTeam ?? fallbackTeam} hold a ${descriptor} edge of ${formattedAmount}, giving them ${impact} in the projections.`,
          favouredTeam: favouredTeam ?? fallbackTeam,
          opposingTeam,
          impact,
          meta,
        };
      }
      return {
        feature: factor?.feature ?? meta.key,
        label: meta.label,
        summary: `${favouredTeam ?? fallbackTeam} trail by ${formattedAmount} in ${descriptor}, yet it still translates into ${impact} for their chances.`,
        favouredTeam: favouredTeam ?? fallbackTeam,
        opposingTeam,
        impact,
        meta,
      };
    }
    const descriptor = buildMetricDescriptor(meta);
    return {
      feature: factor?.feature ?? meta.key,
      label: meta.label,
      summary: `${favouredTeam ?? fallbackTeam} benefit from ${descriptor}, providing ${impact} in the projections.`,
      favouredTeam: favouredTeam ?? fallbackTeam,
      opposingTeam,
      impact,
      meta,
    };
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const absValue = Math.abs(value);
    const digits = absValue >= 100 ? 0 : absValue >= 10 ? 1 : 2;
    const formattedAmount = formatNumber(value, digits);
    const perspective = favouredTeam === homeTeam ? "home" : favouredTeam === awayTeam ? "away" : "team";
    return {
      feature: factor?.feature ?? meta.key,
      label: meta.label,
      summary: `The model sees ${meta.label.toLowerCase()} at ${formattedAmount} from the ${perspective} side, giving ${favouredTeam ?? fallbackTeam} ${impact}.`,
      favouredTeam: favouredTeam ?? fallbackTeam,
      opposingTeam,
      impact,
      meta,
    };
  }

  return {
    feature: factor?.feature ?? meta.key,
    label: meta.label,
    summary: `${meta.label} gives ${favouredTeam ?? fallbackTeam} ${impact} in the projections.`,
    favouredTeam: favouredTeam ?? fallbackTeam,
    opposingTeam,
    impact,
    meta,
  };
}

export { FEATURE_LABELS };
