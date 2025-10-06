import React, { useEffect, useState } from "react";
import { getRatingsSeries } from "../lib/api";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Brush,
} from "recharts";
import { getTeamColor, getTeamHighlightColor } from "../lib/teamColors";

const LINE_ANIMATION_DURATION = 450;
const LINE_ANIMATION_EASING = "ease-in-out";
const MAX_ALL_SEASON_DETAIL_POINTS = 720;
const MAX_ALL_SEASON_TEAMS = 30;
const MAX_SEASON_TICKS = 48;

function buildHighlightSeries(pivotData, teamList, yearsForTeam) {
  if (!Array.isArray(pivotData) || pivotData.length === 0) {
    return {};
  }
  const result = {};
  const teams = Array.isArray(teamList) ? teamList : [];
  teams.forEach((team) => {
    if (!team) return;
    const years = yearsForTeam(team);
    if (!Array.isArray(years) || years.length === 0) return;
    years.forEach((rawYear) => {
      const year = Number(rawYear);
      if (!Number.isFinite(year)) return;
      const series = pivotData.map((row) => {
        const seasonYear = row?.date;
        const isMatch = seasonYear === year;
        return {
          date: seasonYear,
          __isHighlight: isMatch,
          [team]: isMatch ? (row?.[team] ?? null) : null,
        };
      });
      const targetIndex = pivotData.findIndex((row) => row?.date === year);
      if (targetIndex >= 0 && series[targetIndex]?.[team] == null) {
        let anchor = null;
        for (let i = targetIndex - 1; i >= 0; i -= 1) {
          const val = pivotData[i]?.[team];
          if (val != null) {
            anchor = val;
            break;
          }
        }
        if (anchor == null) {
          for (let i = targetIndex + 1; i < pivotData.length; i += 1) {
            const val = pivotData[i]?.[team];
            if (val != null) {
              anchor = val;
              break;
            }
          }
        }
        if (anchor != null) {
          series[targetIndex][team] = anchor;
        }
      }
      if (!result[team]) result[team] = [];
      result[team].push({ year, data: series });
    });
  });
  return result;
}

export default function RatingChart({
  teams,
  selectedYear,
  selectedYearsByTeam,
  highlightedTeams = [],
  onToggleTeam,
  onSelectTeam,
  showTooltip = true,
  maxTooltipItems = 6,
  showZoomControls = true,
  showSeasonDetail = false,
  primaryDetailAll = false,
  showMutedTeams = true,
}) {

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState([]);
  const [displayedTeams, setDisplayedTeams] = useState([]);
  const [highlightDataByTeam, setHighlightDataByTeam] = useState({});
  const [seriesAggregates, setSeriesAggregates] = useState(null);
  const [hoveredTeams, setHoveredTeams] = useState([]);
  // Initialise the x-axis domain; will expand to full data range once loaded
  const [xDomain, setXDomain] = useState([0, 0]);
  const [defaultDomain, setDefaultDomain] = useState([0, 0]);
  const [brushRange, setBrushRange] = useState([0, 0]);
  const [seasonOptions, setSeasonOptions] = useState([]);
  const [selectedSeasonDetail, setSelectedSeasonDetail] = useState(null);
  const [detailDataByYear, setDetailDataByYear] = useState({});
  const [animateLines, setAnimateLines] = useState(false);
  const [seasonFilter, setSeasonFilter] = useState("ALL");
  const [seasonSelectionRange, setSeasonSelectionRange] = useState(null);

  const applySeasonRange = React.useCallback((range) => {
    if (!Array.isArray(range) || range.length !== 2) {
      setSeasonSelectionRange((prev) => (prev !== null ? null : prev));
      return;
    }
    const left = Number(range[0]);
    const right = Number(range[1]);
    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      setSeasonSelectionRange((prev) => (prev !== null ? null : prev));
      return;
    }
    const normalLeft = Math.min(left, right);
    const normalRight = Math.max(left, right);
    setSeasonSelectionRange((prev) => {
      if (
        prev &&
        Number.isFinite(prev[0]) &&
        Number.isFinite(prev[1]) &&
        prev[0] === normalLeft &&
        prev[1] === normalRight
      ) {
        return prev;
      }
      return [normalLeft, normalRight];
    });
  }, []);

  const clearSeasonRange = React.useCallback(() => {
    setSeasonSelectionRange((prev) => (prev !== null ? null : prev));
  }, []);

  const shouldUseDetailPrimary = primaryDetailAll && showSeasonDetail;
  const showSeasonFilter = shouldUseDetailPrimary && seasonOptions.length > 1;

  useEffect(() => {
    if (!showSeasonFilter) {
      if (seasonFilter !== "ALL") setSeasonFilter("ALL");
      return;
    }
    const hasOption = seasonOptions.some((opt) => String(opt.value) === String(seasonFilter));
    if (!hasOption) {
      setSeasonFilter("ALL");
    }
  }, [showSeasonFilter, seasonOptions, seasonFilter]);

  useEffect(() => {
    if (!showSeasonDetail) return;
    if (selectedSeasonDetail != null) return;
    if (!seasonOptions || seasonOptions.length === 0) return;
    const preferred = shouldUseDetailPrimary
      ? seasonOptions.find((option) => option.value === "ALL") || seasonOptions[0]
      : seasonOptions.find((option) => option.value !== "ALL") || seasonOptions[0];
    if (preferred && preferred.value != null) {
      setSelectedSeasonDetail(preferred.value);
    }
  }, [showSeasonDetail, seasonOptions, selectedSeasonDetail, shouldUseDetailPrimary]);

  useEffect(() => {
    if (!showSeasonDetail) return;
    if (selectedSeasonDetail == null) return;
    if (!seasonOptions || seasonOptions.length === 0) {
      setSelectedSeasonDetail(null);
      return;
    }
    const hasCurrent = seasonOptions.some(({ value }) => value === selectedSeasonDetail);
    if (!hasCurrent) {
      const fallback = shouldUseDetailPrimary
        ? seasonOptions.find((option) => option.value === "ALL") || seasonOptions[0] || null
        : seasonOptions.find((option) => option.value !== "ALL") || seasonOptions[0] || null;
      setSelectedSeasonDetail(fallback ? fallback.value : null);
    }
  }, [showSeasonDetail, seasonOptions, selectedSeasonDetail, shouldUseDetailPrimary]);

  useEffect(() => {
    if (!animateLines) return;
    const timer = setTimeout(() => setAnimateLines(false), LINE_ANIMATION_DURATION);
    return () => clearTimeout(timer);
  }, [animateLines]);

  const highlightedSet = React.useMemo(
    () => new Set(highlightedTeams || []),
    [highlightedTeams]
  );

  const hoveredSet = React.useMemo(() => new Set(hoveredTeams), [hoveredTeams]);

  const legendTeams = React.useMemo(() => {
    const ordered = [];
    const seen = new Set();
    hoveredTeams.forEach((team) => {
      if (!team || seen.has(team)) return;
      seen.add(team);
      ordered.push(team);
    });
    (highlightedTeams || []).forEach((team) => {
      if (!team || seen.has(team)) return;
      seen.add(team);
      ordered.push(team);
    });
    return ordered;
  }, [hoveredTeams, highlightedTeams]);

  const legendTeamSet = React.useMemo(() => new Set(legendTeams), [legendTeams]);

  // Build a set of highlighted years from either a global selectedYear or per-team selections
  const selectedYearsSet = React.useMemo(() => {
    const s = new Set();
    if (selectedYear != null) s.add(Number(selectedYear));
    if (selectedYearsByTeam) {
      Object.values(selectedYearsByTeam).forEach((val) => {
        if (Array.isArray(val)) {
          val.forEach((y) => {
            if (y !== undefined && y !== null) s.add(Number(y));
          });
        } else if (val !== undefined && val !== null) {
          s.add(Number(val));
        }
      });
    }
    return s;
  }, [selectedYear, selectedYearsByTeam]);

  // Season label helpers
  const formatSeasonShort = (year) => {
    if (year == null || isNaN(year)) return "";
    const y = Number(Math.round(year)) % 100;
    const next = (y + 1) % 100;
    const yy = String(y).padStart(2, "0");
    const nn = String(next).padStart(2, "0");
    return `${yy}/${nn}`;
  };
  const yearsForTeam = (team) => {
    if (selectedYearsByTeam && selectedYearsByTeam[team] != null) {
      const v = selectedYearsByTeam[team];
      return Array.isArray(v) ? v.map(Number) : [Number(v)];
    }
    if (selectedYear != null) return [Number(selectedYear)];
    return [];
  };

  const isHighlightedYear = (yearNum) => {
    if (yearNum == null || selectedYearsSet.size === 0) return false;
    return selectedYearsSet.has(Number(yearNum));
  };

  useEffect(() => {
    setDisplayedTeams(teams || []);
  }, [teams]);


  useEffect(() => {
    if (!teams || teams.length === 0) {
      setData([]);
      setDetailDataByYear({});
      setSeasonOptions([]);
      setDisplayedTeams([]);
      setHighlightDataByTeam({});
      setSeriesAggregates(null);
      clearSeasonRange();
      setDefaultDomain([0, 0]);
      setXDomain([0, 0]);
      setBrushRange([0, 0]);
      setLoading(false);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    setSeriesAggregates(null);
    setHighlightDataByTeam({});

    getRatingsSeries({ teams })
      .then((payload) => {
        if (!active) return;
        const aggregates =
          payload?.aggregates && typeof payload.aggregates === "object"
            ? payload.aggregates
            : null;
        if (!aggregates) {
          setError("Ratings series aggregates unavailable");
          setData([]);
          setDetailDataByYear({});
          setSeasonOptions([]);
          setDisplayedTeams(teams);
          setSeriesAggregates(null);
          clearSeasonRange();
          setDefaultDomain([0, 0]);
          setXDomain([0, 0]);
          setBrushRange([0, 0]);
          setLoading(false);
          return;
        }

        const detailMap =
          aggregates.seasonDetail && typeof aggregates.seasonDetail === "object"
            ? aggregates.seasonDetail
            : {};
        const options = Array.isArray(aggregates.seasonOptions) ? aggregates.seasonOptions : [];
        const aggregatedTeams =
          Array.isArray(aggregates.teams) && aggregates.teams.length ? aggregates.teams : teams;

        let pivotData = Array.isArray(aggregates.seasonPivot)
          ? [...aggregates.seasonPivot]
          : [];
        if (pivotData.length > 0) {
          const seenYears = new Set(pivotData.map((entry) => entry?.date));
          const missingYears = Array.from(selectedYearsSet).filter((year) => !seenYears.has(year));
          if (missingYears.length > 0) {
            const blanks = missingYears.map((year) => ({ date: year }));
            pivotData = pivotData.concat(blanks);
            pivotData.sort((a, b) => Number(a?.date) - Number(b?.date));
          }
          if (aggregatedTeams && aggregatedTeams.length > 0) {
            const processed = pivotData.map((entry) => ({ ...entry }));
            const EPS = 1e-9;
            aggregatedTeams.forEach((teamName) => {
              let prev = null;
              processed.forEach((entry) => {
                const value = entry[teamName];
                if (value == null || Number.isNaN(value)) return;
                if (prev != null && Math.abs(value - prev) <= EPS) {
                  entry[teamName] = null;
                } else {
                  prev = value;
                }
              });
            });
            pivotData = processed;
          }
        }

        setData(pivotData);
        setDetailDataByYear(detailMap);
        setSeasonOptions(options);
        setDisplayedTeams(aggregatedTeams);
        setSeriesAggregates({
          seasonRange: aggregates.seasonRange ?? null,
          detailRange: aggregates.detailRange ?? null,
        });
        const activeFilter = seasonFilter;
        const option = options.find((opt) => String(opt.value) === String(activeFilter));
        if (option && Array.isArray(option.range)) {
          applySeasonRange(option.range);
        } else if (Array.isArray(aggregates.detailRange)) {
          applySeasonRange(aggregates.detailRange);
        } else {
          clearSeasonRange();
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || "Failed to load rating data");
        setData([]);
        setDetailDataByYear({});
        setSeasonOptions([]);
        setDisplayedTeams([]);
        setHighlightDataByTeam({});
        setSeriesAggregates(null);
        clearSeasonRange();
        setDefaultDomain([0, 0]);
        setXDomain([0, 0]);
        setBrushRange([0, 0]);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [teams, seasonFilter, applySeasonRange, clearSeasonRange]);

  useEffect(() => {
    if (!Array.isArray(data) || data.length === 0) {
      setHighlightDataByTeam({});
      return;
    }
    const baseTeams = displayedTeams && displayedTeams.length > 0 ? displayedTeams : teams || [];
    const map = buildHighlightSeries(data, baseTeams, yearsForTeam);
    setHighlightDataByTeam(map);
  }, [data, displayedTeams, teams, selectedYear, selectedYearsByTeam]);

  useEffect(() => {
    if (shouldUseDetailPrimary) {
      return;
    }
    if (!Array.isArray(data) || data.length === 0) {
      setXDomain([0, 0]);
      setDefaultDomain([0, 0]);
      setBrushRange([0, 0]);
      return;
    }
    const range = seriesAggregates?.seasonRange;
    if (
      range &&
      Number.isFinite(range.min) &&
      Number.isFinite(range.max)
    ) {
      const minYear = Number(range.min);
      const maxYear = Number(range.max);
      setXDomain([minYear, maxYear]);
      setDefaultDomain([minYear, maxYear]);
    } else {
      const years = data
        .map((row) => Number(row?.date))
        .filter((year) => Number.isFinite(year));
      if (years.length > 0) {
        const minYear = Math.min(...years);
        const maxYear = Math.max(...years);
        setXDomain([minYear, maxYear]);
        setDefaultDomain([minYear, maxYear]);
      } else {
        setXDomain([0, 0]);
        setDefaultDomain([0, 0]);
      }
    }
    setBrushRange([0, Math.max(0, data.length - 1)]);
  }, [shouldUseDetailPrimary, data, seriesAggregates]);

  const uniqueTeams = React.useMemo(
    () => Array.from(new Set(displayedTeams)),
    [displayedTeams]
  );

  const visibleTeams = React.useMemo(() => {
    if (!showMutedTeams && highlightedTeams?.length) {
      const highlightSet = new Set(highlightedTeams);
      return uniqueTeams.filter((team) => highlightSet.has(team));
    }
    return uniqueTeams;
  }, [showMutedTeams, highlightedTeams, uniqueTeams]);

  const isAllSeasonDetail = showSeasonDetail && selectedSeasonDetail === "ALL";

  const detailSeasonInfo = React.useMemo(() => {
    if (!showSeasonDetail) return null;
    if (selectedSeasonDetail == null) return null;
    return detailDataByYear?.[selectedSeasonDetail] ?? null;
  }, [showSeasonDetail, selectedSeasonDetail, detailDataByYear]);

  const detailSeasonLabel = detailSeasonInfo?.label ?? "";

  const detailRows = React.useMemo(() => {
    if (!showSeasonDetail || !detailSeasonInfo?.rows) return [];
    const rows = detailSeasonInfo.rows;
    if (!isAllSeasonDetail || rows.length <= MAX_ALL_SEASON_DETAIL_POINTS) {
      return rows;
    }
    const stride = Math.max(1, Math.ceil(rows.length / MAX_ALL_SEASON_DETAIL_POINTS));
    return rows.filter((_, idx) => idx % stride === 0 || idx === rows.length - 1);
  }, [showSeasonDetail, detailSeasonInfo, isAllSeasonDetail]);

  const detailTeamCandidates = React.useMemo(() => {
    if (!showSeasonDetail) return [];
    const highlightSubset = (highlightedTeams || []).filter((team) => uniqueTeams.includes(team));
    const baseList = !showMutedTeams && highlightSubset.length > 0 ? highlightSubset : visibleTeams;
    if (!isAllSeasonDetail) return baseList;
    return baseList.slice(0, MAX_ALL_SEASON_TEAMS);
  }, [showSeasonDetail, isAllSeasonDetail, showMutedTeams, highlightedTeams, uniqueTeams, visibleTeams]);

  const detailTeams = React.useMemo(() => {
    if (!showSeasonDetail || !detailRows.length || !detailTeamCandidates.length) return [];
    if (shouldUseDetailPrimary) return detailTeamCandidates;
    const rows = detailRows;
    const EPS = 1e-6;
    return detailTeamCandidates.filter((team) => {
      let prev = null;
      for (const row of rows) {
        const val = row.values?.[team];
        if (val == null || Number.isNaN(val)) continue;
        if (prev == null) {
          prev = val;
        } else if (Math.abs(val - prev) > EPS) {
          return true;
        }
      }

      return false;
    });
  }, [showSeasonDetail, detailRows, detailTeamCandidates, shouldUseDetailPrimary]);

  const detailData = React.useMemo(() => {
    if (!showSeasonDetail || detailRows.length === 0) return [];
    const rows = detailRows;
    if (!detailTeams || detailTeams.length === 0) {
      return [];
    }
    const EPS = 1e-6;
    const lastActive = new Map();
    const prevMap = new Map();

    rows.forEach((row, idx) => {
      detailTeams.forEach((team) => {
        const val = row.values?.[team];
        if (val == null || Number.isNaN(val)) return;
        const prev = prevMap.get(team);
        if (prev == null) {
          prevMap.set(team, val);
          lastActive.set(team, idx);
        } else if (Math.abs(val - prev) > EPS) {
          prevMap.set(team, val);
          lastActive.set(team, idx);
        }
      });
    });

    return rows.map((row, idx) => {
      const out = {
        seasonKey: row.seasonKey,
        date: row.date,
        timestamp: row.timestamp,
        dayIndex: row.dayIndex,
      };
      detailTeams.forEach((team) => {
        const cutoff = lastActive.get(team);
        if (cutoff == null || idx > cutoff) {
          out[team] = null;
          return;
        }
        out[team] = row.values?.[team] ?? null;
      });
      return out;
    });
  }, [showSeasonDetail, detailRows, detailTeams]);

  const detailXDomain = React.useMemo(() => {
    if (!showSeasonDetail || !detailData || detailData.length === 0) return ["auto", "auto"];
    const values = detailData
      .map((row) => Number(row.timestamp))
      .filter((v) => Number.isFinite(v));
    if (values.length === 0) return ["auto", "auto"];
    return [Math.min(...values), Math.max(...values)];
  }, [showSeasonDetail, detailData]);

  const detailYDomain = React.useMemo(() => {
    if (!showSeasonDetail || !detailData || detailData.length === 0 || !detailTeams || detailTeams.length === 0) {
      return ["auto", "auto"];
    }
    const values = [];
    for (const row of detailData) {
      for (const team of detailTeams) {
        const v = row[team];
        if (typeof v === "number" && Number.isFinite(v)) values.push(v);
      }
    }
    if (values.length === 0) return ["auto", "auto"];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min;
    const pad = span > 0 ? span * 0.08 : Math.max(10, Math.abs(max) * 0.08);
    return [min - pad, max + pad];
  }, [showSeasonDetail, detailData, detailTeams]);

  const primaryTeams = shouldUseDetailPrimary ? detailTeams : visibleTeams;
  const primaryData = shouldUseDetailPrimary ? detailData : data;

  const filteredPrimaryData = React.useMemo(() => {
    if (!shouldUseDetailPrimary) return primaryData;
    if (!seasonFilter || seasonFilter === "ALL") return primaryData;
    const seasonEntry = detailDataByYear?.[seasonFilter];
    if (seasonEntry?.rows) {
      return seasonEntry.rows;
    }
    return [];
  }, [primaryData, shouldUseDetailPrimary, seasonFilter, detailDataByYear]);

  const chartData = shouldUseDetailPrimary ? filteredPrimaryData : primaryData;

  const seasonOptionMap = React.useMemo(() => {
    const map = new Map();
    seasonOptions.forEach((opt) => {
      map.set(String(opt.value), opt);
    });
    return map;
  }, [seasonOptions]);

  const detailSeasonTickInfo = React.useMemo(() => {
    if (!shouldUseDetailPrimary) {
      return { ticks: undefined, labels: new Map() };
    }
    if (seasonFilter && seasonFilter !== "ALL") {
      return { ticks: undefined, labels: new Map() };
    }
    if (!detailDataByYear || typeof detailDataByYear !== "object") {
      return { ticks: undefined, labels: new Map() };
    }

    const seasonEntries = Object.entries(detailDataByYear)
      .filter(([key]) => key !== "ALL")
      .map(([key, value]) => ({
        season: Number(key),
        rows: Array.isArray(value?.rows) ? value.rows : [],
      }))
      .filter(({ season }) => Number.isFinite(season))
      .sort((a, b) => a.season - b.season);

    if (seasonEntries.length === 0) {
      return { ticks: undefined, labels: new Map() };
    }

    const uniqueSeasons = seasonEntries.map((entry) => entry.season);
    const desiredTickCount = Math.min(MAX_SEASON_TICKS, uniqueSeasons.length);
    const stride = Math.max(1, Math.ceil(uniqueSeasons.length / desiredTickCount));

    const labels = new Map();
    const ticks = [];
    const entryMap = new Map(seasonEntries.map((entry) => [entry.season, entry.rows]));

    const seasonTimestamp = (season, rows) => {
      if (rows && rows.length) {
        const firstTs = Number(rows[0]?.timestamp);
        if (Number.isFinite(firstTs)) {
          return firstTs;
        }
      }
      return Date.UTC(season, 9, 15);
    };

    for (let index = 0; index < uniqueSeasons.length; index += stride) {
      const season = uniqueSeasons[index];
      const rows = entryMap.get(season);
      const ts = seasonTimestamp(season, rows);
      if (!Number.isFinite(ts)) continue;
      if (!labels.has(ts)) {
        ticks.push(ts);
        labels.set(ts, formatSeasonShort(season));
      }
    }

    const lastSeason = uniqueSeasons[uniqueSeasons.length - 1];
    const lastRows = entryMap.get(lastSeason);
    const lastTs = seasonTimestamp(lastSeason, lastRows);
    if (Number.isFinite(lastTs) && !labels.has(lastTs)) {
      ticks.push(lastTs);
      labels.set(lastTs, formatSeasonShort(lastSeason));
    }

    return { ticks, labels };
  }, [shouldUseDetailPrimary, seasonFilter, detailDataByYear]);

  useEffect(() => {
    if (!shouldUseDetailPrimary) return;
    if (!chartData || chartData.length === 0) {
      setXDomain([0, 0]);
      setDefaultDomain([0, 0]);
      setBrushRange([0, 0]);
      return;
    }
    const timestamps = chartData
      .map((row) => Number(row.timestamp))
      .filter((v) => Number.isFinite(v));
    if (timestamps.length === 0) {
      setXDomain([0, 0]);
      setDefaultDomain([0, 0]);
      setBrushRange([0, Math.max(0, chartData.length - 1)]);
      return;
    }
    const minTs = Math.min(...timestamps);
    const maxTs = Math.max(...timestamps);
    setDefaultDomain([minTs, maxTs]);

    let left = minTs;
    let right = maxTs;
    if (seasonSelectionRange) {
      const [selLeft, selRight] = seasonSelectionRange;
      if (Number.isFinite(selLeft) && Number.isFinite(selRight)) {
        left = Math.max(minTs, Math.min(maxTs, Math.min(selLeft, selRight)));
        right = Math.max(left, Math.min(maxTs, Math.max(selLeft, selRight)));
      }
    }

    setXDomain([left, right]);

    const indexed = chartData
      .map((row, idx) => ({ idx, ts: Number(row.timestamp) }))
      .filter((item) => Number.isFinite(item.ts));
    if (indexed.length === 0) {
      setBrushRange([0, Math.max(0, chartData.length - 1)]);
      return;
    }
    let startIdx = indexed.find((item) => item.ts >= left)?.idx;
    if (startIdx == null) startIdx = indexed[indexed.length - 1].idx;
    let endIdx = [...indexed].reverse().find((item) => item.ts <= right)?.idx;
    if (endIdx == null) endIdx = indexed[0].idx;
    if (endIdx < startIdx) {
      const swap = startIdx;
      startIdx = endIdx;
      endIdx = swap;
    }
    setBrushRange([startIdx, endIdx]);
  }, [shouldUseDetailPrimary, chartData, seasonSelectionRange]);

  const allowedHoverSet = React.useMemo(() => new Set(primaryTeams || []), [primaryTeams]);

  useEffect(() => {
    setHoveredTeams((prev) => prev.filter((team) => allowedHoverSet.has(team)));
  }, [allowedHoverSet]);

  const yDomain = React.useMemo(() => {
    if (!chartData || chartData.length === 0 || !primaryTeams || primaryTeams.length === 0) {
      return ["auto", "auto"];
    }
    const values = [];
    for (const row of chartData) {
      for (const team of primaryTeams) {
        const v = row[team];
        if (typeof v === "number" && Number.isFinite(v)) values.push(v);
      }
    }
    if (values.length === 0) return ["auto", "auto"];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min;
    const pad = span > 0 ? span * 0.08 : Math.max(10, Math.abs(max) * 0.08);
    return [min - pad, max + pad];
  }, [chartData, primaryTeams]);

  // Generate ticks on the y-axis at whole multiples of 100
  const yTicks = React.useMemo(() => {
    if (!Array.isArray(yDomain) || yDomain.some((v) => typeof v !== "number")) {
      return undefined;
    }
    const [min, max] = yDomain;
    const start = Math.floor(min / 100) * 100;
    const end = Math.ceil(max / 100) * 100;
    const ticks = [];
    for (let t = start; t <= end; t += 100) {
      ticks.push(t);
    }
    return ticks;
  }, [yDomain]);

  // x-axis ticks: whole-year integers only
  const xTicks = React.useMemo(() => {
    if (shouldUseDetailPrimary) return undefined;
    const [min, max] = xDomain || [];
    if (min == null || max == null) return undefined;
    const start = Math.ceil(Number(min));
    const end = Math.floor(Number(max));
    if (!Number.isFinite(start) || !Number.isFinite(end)) return undefined;
    const t = [];
    for (let y = start; y <= end; y += 1) t.push(y);
    return t;
  }, [xDomain]);

  // Custom tick that boldens ticks that fall within the selected years
  const YearAwareTick = (props) => {
    const { x, y, payload } = props;
    const d = payload && Math.round(payload.value);
    const bold = isHighlightedYear(d);
    return (
      <g transform={`translate(${x},${y})`}>
        <text
          transform="rotate(30)"
          textAnchor="start"
          dx={4}
          dy={6}
          fontWeight={bold ? 700 : 400}
          fill={bold ? "#92400e" : "#333"}
        >
          {formatSeasonShort(d)}
        </text>
      </g>
    );
  };

  const CustomTooltip = ({ active, label, payload }) => {
    if (!active || !payload || payload.length === 0 || legendTeams.length === 0) return null;
    let filtered = payload.filter((p) => !p?.payload?.__isHighlight && p.value != null);

    const hasLegendEntries = legendTeams.length > 0;
    const allHighlighted = hasLegendEntries && legendTeams.length === uniqueTeams.length;

    // If a subset is highlighted, show only those. If none or all are highlighted,
    // limit entries to top-N by value to avoid clutter.
    if (hasLegendEntries && !allHighlighted) {
      filtered = filtered.filter((p) => legendTeamSet.has(p.name));
    } else if (maxTooltipItems && maxTooltipItems > 0) {
      filtered = [...filtered]
        .sort((a, b) => Number(b.value) - Number(a.value))
        .slice(0, maxTooltipItems);
    }

    const map = new Map();
    for (const p of filtered) {
      if (!map.has(p.name)) map.set(p.name, p);
    }
    if (map.size === 0) return null;
    const seasonLabel = formatSeasonShort(label);
    return (
      <div
        style={{
          backgroundColor: "white",
          border: "1px solid #ccc",
          padding: 8,
          borderRadius: 4,
        }}
      >
        <div style={{ fontWeight: "bold", marginBottom: 4 }}>Season {seasonLabel}</div>
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {Array.from(map.values()).map((p) => (
            <li key={p.name} style={{ marginBottom: 2, color: p.color }}>
              <span>{p.name}: </span>
              <span>{Number(p.value).toFixed(0)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const detailTickLabels = detailSeasonTickInfo.labels;

  const formatDetailTick = React.useCallback((value) => {
    if (value == null) return "";
    const num = Number(value);
    if (!Number.isFinite(num)) return "";
    if (detailTickLabels?.has(num)) {
      return detailTickLabels.get(num) || "";
    }
    const date = new Date(num);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }, [detailTickLabels]);

  const DetailSeasonTick = (props) => {
    const { x, y, payload } = props;
    const value = payload ? Number(payload.value) : NaN;
    const label = formatDetailTick(value);
    if (!label) return null;
    return (
      <g transform={`translate(${x},${y})`}>
        <text
          transform="rotate(15)"
          textAnchor="start"
          dx={4}
          dy={6}
          fontSize={10}
          fill="#333"
        >
          {label}
        </text>
      </g>
    );
  };

  const SeasonDetailTooltip = ({ active, label, payload }) => {
    if (!showSeasonDetail || !active || !payload || payload.length === 0) return null;
    let filtered = payload.filter((p) => p.value != null);

    const hasLegendEntries = legendTeams.length > 0;
    const allHighlighted = hasLegendEntries && legendTeams.length === uniqueTeams.length;

    if (hasLegendEntries && !allHighlighted) {
      filtered = filtered.filter((p) => legendTeamSet.has(p.name));
    } else if (maxTooltipItems && maxTooltipItems > 0) {
      filtered = [...filtered]
        .sort((a, b) => Number(b.value) - Number(a.value))
        .slice(0, maxTooltipItems);
    }

    const map = new Map();
    for (const p of filtered) {
      if (!map.has(p.name)) map.set(p.name, p);
    }
    if (map.size === 0) return null;

    const num = Number(label);
    const date = Number.isFinite(num) ? new Date(num) : null;
    const labelText = date && !Number.isNaN(date.getTime())
      ? `${detailSeasonLabel} · ${date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
      : String(label);

    return (
      <div
        style={{
          backgroundColor: "white",
          border: "1px solid #ccc",
          padding: 8,
          borderRadius: 4,
        }}
      >
        <div style={{ fontWeight: "bold", marginBottom: 4 }}>{labelText}</div>
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {Array.from(map.values()).map((p) => (
            <li key={p.name} style={{ marginBottom: 2, color: p.color }}>
              <span>{p.name}: </span>
              <span>{Number(p.value).toFixed(0)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const handleLineEnter = React.useCallback((team) => {
    if (!team) return;
    setHoveredTeams((prev) => {
      if (prev.includes(team)) return prev;
      return [...prev, team];
    });
  }, []);

  const handleLineLeave = React.useCallback((team) => {
    if (!team) return;
    setHoveredTeams((prev) => {
      if (!prev.includes(team)) return prev;
      return prev.filter((t) => t !== team);
    });
  }, []);

  const handleChartMouseLeave = React.useCallback(() => {
    setHoveredTeams([]);
  }, []);

  const handleSelectTeam = React.useCallback(
    (team) => {
      if (!team) return;
      if (onSelectTeam) {
        onSelectTeam(team);
      } else if (onToggleTeam) {
        onToggleTeam(team);
      }
    },
    [onSelectTeam, onToggleTeam]
  );

  const handleBrushChange = React.useCallback(
    (range) => {
      const dataset = shouldUseDetailPrimary ? chartData : data;
      if (!range || range.startIndex == null || range.endIndex == null) {
        setBrushRange([0, Math.max(0, dataset.length - 1)]);
        setXDomain(defaultDomain);
        return;
      }
      const { startIndex, endIndex } = range;
      const clamp = (idx) => {
        if (Number.isNaN(idx) || idx == null) return 0;
        return Math.max(0, Math.min(idx, Math.max(0, dataset.length - 1)));
      };
      const start = clamp(startIndex);
      const end = clamp(endIndex);
      if (dataset.length === 0) {
        setBrushRange([start, end]);
        return;
      }
      const left = Math.min(start, end);
      const right = Math.max(start, end);
      const leftValue = shouldUseDetailPrimary ? dataset[left]?.timestamp : dataset[left]?.date;
      const rightValue = shouldUseDetailPrimary ? dataset[right]?.timestamp : dataset[right]?.date;
      if (leftValue == null || rightValue == null) {
        setBrushRange([left, right]);
        return;
      }
      setBrushRange([left, right]);
      setXDomain([Number(leftValue), Number(rightValue)]);
      setAnimateLines(true);
      if (shouldUseDetailPrimary) {
        applySeasonRange([Number(leftValue), Number(rightValue)]);
      }
    },
    [data, chartData, defaultDomain, shouldUseDetailPrimary, applySeasonRange]
  );

  const resetZoom = React.useCallback(() => {
    const dataset = shouldUseDetailPrimary ? chartData : data;
    setBrushRange([0, Math.max(0, dataset.length - 1)]);
    setXDomain(defaultDomain);
    setAnimateLines(true);
    if (shouldUseDetailPrimary) {
      clearSeasonRange();
    }
  }, [data, chartData, defaultDomain, shouldUseDetailPrimary, clearSeasonRange]);

  const zoomRange = React.useMemo(() => {
    if (!showZoomControls) return null;
    const [left, right] = xDomain || [];
    if (left == null || right == null) return null;
    if (shouldUseDetailPrimary) {
      const leftLabel = formatDetailTick(left);
      const rightLabel = formatDetailTick(right);
      if (!leftLabel && !rightLabel) return null;
      return { leftLabel, rightLabel };
    }
    const leftLabel = formatSeasonShort(left);
    const rightLabel = formatSeasonShort(right);
    if (!leftLabel && !rightLabel) return null;
    return { leftLabel, rightLabel };
  }, [showZoomControls, xDomain, shouldUseDetailPrimary, formatDetailTick]);

  return (
    <div className="space-y-6">
      <div className="bg-white border rounded-2xl p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
          <h2 className="text-lg font-semibold">Team Ratings Over Time</h2>
          {showSeasonFilter && (
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <span className="font-medium">Season window</span>
              <select
                className="border rounded-md px-2 py-1 text-sm text-gray-800"
                value={String(seasonFilter)}
                onChange={(event) => {
                  const nextValue = event.target.value || "ALL";
                  setSeasonFilter(nextValue);
                  const option = seasonOptionMap.get(String(nextValue));
                  if (option && Array.isArray(option.range)) {
                    applySeasonRange(option.range);
                  } else if (nextValue === "ALL" && Array.isArray(seriesAggregates?.detailRange)) {
                    applySeasonRange(seriesAggregates.detailRange);
                  } else {
                    clearSeasonRange();
                  }
                  setAnimateLines(true);
                }}
              >
                {seasonOptions.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {loading && <p>Loading rating data...</p>}
        {error && <p className="text-red-600">Error: {error}</p>}
        {!loading && !error && data.length === 0 && (
          <p>No rating data available for selected teams.</p>
        )}
        {!loading && !error && chartData && chartData.length > 0 && (
          <div className="relative">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={chartData}
                onMouseLeave={handleChartMouseLeave}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey={shouldUseDetailPrimary ? "timestamp" : "date"}
                  type="number"
                  domain={xDomain}
                  ticks={shouldUseDetailPrimary ? detailSeasonTickInfo.ticks : xTicks}
                  tick={shouldUseDetailPrimary ? <DetailSeasonTick /> : <YearAwareTick />}
                  tickFormatter={shouldUseDetailPrimary ? formatDetailTick : undefined}
                  allowDuplicatedCategory={false}
                  allowDataOverflow
                  allowDecimals={false}
                />
                <YAxis
                  domain={yDomain}
                  ticks={yTicks}
                  tickFormatter={(val) => Number(val).toFixed(0)}
                  allowDecimals={false}
                  allowDataOverflow
                />

                {showTooltip && (
                  shouldUseDetailPrimary ? (
                    <Tooltip content={<SeasonDetailTooltip />} />
                  ) : (
                    <Tooltip content={<CustomTooltip />} />
                  )
                )}

                {primaryTeams.map((team) => {
                  const isHovered = hoveredSet.has(team);
                  const isUserHighlighted = highlightedSet.has(team);
                  const isActive = legendTeamSet.has(team);
                  const faded = legendTeams.length > 0 && !isActive;
                  const baseOpacity = isUserHighlighted ? 0.85 : 0.6;
                  return (
                    <Line
                      key={team}
                      type="linear"
                      dataKey={team}
                      stroke={getTeamColor(team)}
                      strokeWidth={isHovered ? 5 : isUserHighlighted ? 4 : 2}
                      strokeOpacity={faded ? 0.15 : baseOpacity}
                      isAnimationActive={animateLines}
                      animationDuration={LINE_ANIMATION_DURATION}
                      animationEasing={LINE_ANIMATION_EASING}
                      dot={false}
                      activeDot={false}
                      onClick={() => handleSelectTeam(team)}
                      onMouseEnter={() => handleLineEnter(team)}
                      onMouseLeave={() => handleLineLeave(team)}
                      cursor="pointer"
                    />
                  );
                })}
                {!shouldUseDetailPrimary && visibleTeams.flatMap((team) => {
                  const arr = highlightDataByTeam[team];
                  if (!arr || arr.length === 0) return [];
                  const isHovered = hoveredSet.has(team);
                  const isUserHighlighted = highlightedSet.has(team);
                  const isActive = legendTeamSet.has(team);
                  const faded = legendTeams.length > 0 && !isActive;
                  const baseOpacity = isUserHighlighted ? 0.8 : 0.55;
                  return arr.map(({ year, data }) => (
                    <Line
                      key={`${team}__highlight__${year}`}
                      type="linear"
                      dataKey={team}
                      data={data}
                      stroke={getTeamHighlightColor(team)}
                      strokeWidth={isHovered ? 7 : isUserHighlighted ? 6 : 5}
                      strokeOpacity={faded ? 0.08 : baseOpacity}
                      isAnimationActive={animateLines}
                      animationDuration={LINE_ANIMATION_DURATION}
                      animationEasing={LINE_ANIMATION_EASING}
                      dot={{ r: isHovered ? 6 : 5 }}
                      activeDot={false}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      legendType="none"
                      name={undefined}
                      onClick={() => handleSelectTeam(team)}
                      onMouseEnter={() => handleLineEnter(team)}
                      onMouseLeave={() => handleLineLeave(team)}
                      cursor="pointer"
                    />
                  ));
                })}
              </LineChart>
            </ResponsiveContainer>
            {showZoomControls && chartData.length > 1 && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-600">Timeline focus</span>
                  <button
                    type="button"
                    className="text-sm text-blue-600 hover:text-blue-500"
                    onClick={resetZoom}
                  >
                    Reset view
                  </button>
                </div>
                <div className="relative">
                  <ResponsiveContainer width="100%" height={60}>
                    <LineChart
                      data={chartData}
                      margin={{ top: 0, right: 16, left: 16, bottom: 0 }}
                    >
                      <XAxis
                        dataKey={shouldUseDetailPrimary ? "timestamp" : "date"}
                        type="number"
                        height={24}
                        domain={defaultDomain}
                        allowDuplicatedCategory={false}
                        allowDecimals={false}
                        tick={false}
                        axisLine={false}
                      />
                      <YAxis hide domain={yDomain} />
                      <Brush
                        dataKey={shouldUseDetailPrimary ? "timestamp" : "date"}
                        startIndex={brushRange[0]}
                        endIndex={brushRange[1]}
                        height={20}
                        travellerWidth={10}
                        stroke="#2563eb"
                        fill="rgba(37, 99, 235, 0.08)"
                        onChange={handleBrushChange}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  {zoomRange && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-4 text-[10px] font-medium text-gray-600">
                      <span>{zoomRange.leftLabel}</span>
                      <span>{zoomRange.rightLabel}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        {!loading && !error && chartData && chartData.length === 0 && (
          <p>No rating data available for the selected season.</p>
        )}
      </div>

      {showSeasonDetail && !shouldUseDetailPrimary && (
        <div className="bg-white border rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Season Detail View</h3>
            <div className="flex items-center gap-2">
              <label htmlFor="season-detail-select" className="text-sm font-medium text-gray-600">
                Season view
              </label>
              <select
                id="season-detail-select"
                className="border rounded-md px-2 py-1 text-sm"
                value={selectedSeasonDetail != null ? String(selectedSeasonDetail) : ""}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setSelectedSeasonDetail(nextValue === "" ? null : nextValue);
                  setAnimateLines(true);
                }}
                disabled={seasonOptions.length === 0}
              >
                {seasonOptions.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {loading ? (
            <p>Loading rating data...</p>
          ) : error ? (
            <p className="text-red-600">Error: {error}</p>
          ) : detailData.length === 0 ? (
            <p>No detailed rating data available for the selected season.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart
                data={detailData}
                onMouseLeave={handleChartMouseLeave}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  domain={detailXDomain}
                  tickFormatter={formatDetailTick}
                  allowDataOverflow
                  allowDecimals={false}
                />
                <YAxis
                  domain={detailYDomain}
                  tickFormatter={(val) => Number(val).toFixed(0)}
                  allowDecimals={false}
                  allowDataOverflow
                />

                {showTooltip && <Tooltip content={<SeasonDetailTooltip />} />}

                {detailTeams.map((team) => {
                  const isHovered = hoveredSet.has(team);
                  const isUserHighlighted = highlightedSet.has(team);
                  const isActive = legendTeamSet.has(team);
                  const faded = legendTeams.length > 0 && !isActive;
                  const baseOpacity = isUserHighlighted ? 0.85 : 0.55;
                  return (
                    <Line
                      key={`detail-${team}`}
                      type="linear"
                      dataKey={team}
                      stroke={getTeamColor(team)}
                      strokeWidth={isHovered ? 4 : isUserHighlighted ? 3 : 2}
                      strokeOpacity={faded ? 0.15 : baseOpacity}
                      isAnimationActive={animateLines}
                      animationDuration={LINE_ANIMATION_DURATION}
                      animationEasing={LINE_ANIMATION_EASING}
                      dot={false}
                      activeDot={false}
                      onClick={() => handleSelectTeam(team)}
                      onMouseEnter={() => handleLineEnter(team)}
                      onMouseLeave={() => handleLineLeave(team)}
                      cursor="pointer"
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

    </div>
  );

}
