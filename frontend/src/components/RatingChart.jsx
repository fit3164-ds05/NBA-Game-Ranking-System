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
      setDisplayedTeams([]);
      return;
    }
    setLoading(true);
    setError(null);
    getRatingsSeries({ teams })
      .then((res) => {
        const pivotMap = new Map();
        const detailMap = showSeasonDetail ? new Map() : null;
        res.forEach(({ date, team, rating }) => {
          if (!date || !team) return;
          const dateStr = String(date);
          const parsed = new Date(`${dateStr}T00:00:00Z`);
          if (Number.isNaN(parsed.getTime())) return;

          const month = parsed.getUTCMonth();
          const day = parsed.getUTCDate();
          const year = parsed.getUTCFullYear();

          const seasonStartYear = month >= 9 ? year : year - 1;
          const seasonStartTs = Date.UTC(seasonStartYear, 9, 15);
          const seasonEndTs = Date.UTC(seasonStartYear + 1, 6, 15, 23, 59, 59);
          const currentTs = Date.UTC(year, month, day);

          if (currentTs < seasonStartTs || currentTs > seasonEndTs) return;

          const seasonKey = seasonStartYear;

          if (!pivotMap.has(seasonKey)) {
            pivotMap.set(seasonKey, { date: seasonKey });
          }
          pivotMap.get(seasonKey)[team] = rating;

          if (showSeasonDetail && detailMap) {
            const seasonLabel = formatSeasonShort(seasonStartYear);
            if (!detailMap.has(seasonKey)) {
              detailMap.set(seasonKey, {
                label: seasonLabel,
                rows: new Map(),
              });
            }
            const seasonEntry = detailMap.get(seasonKey);
            const dayKey = dateStr;
            let detailRow = seasonEntry.rows.get(dayKey);
            if (!detailRow) {
              detailRow = {
                date: dateStr,
                timestamp: currentTs,
                values: {},
              };
              seasonEntry.rows.set(dayKey, detailRow);
            }
            detailRow.values[team] = rating;
          }

        });

        if (showSeasonDetail && detailMap) {
          const detailObj = {};
          const allRowsAggregate = [];
          detailMap.forEach(({ label, rows }, seasonKey) => {
            const sortedRows = Array.from(rows.values())
              .sort((a, b) => a.timestamp - b.timestamp)
              .map((row, idx) => ({
                seasonKey: String(seasonKey),
                date: row.date,
                timestamp: row.timestamp,
                dayIndex: idx + 1,
                values: row.values,
              }));
            if (sortedRows.length > 0) {
              detailObj[seasonKey] = {
                label,
                rows: sortedRows,
              };
              sortedRows.forEach((row) => {
                allRowsAggregate.push({ ...row });
              });
            }
          });

          if (allRowsAggregate.length > 0) {
            const combinedRows = allRowsAggregate
              .sort((a, b) => a.timestamp - b.timestamp)
              .map((row, idx) => ({
                ...row,
                dayIndex: idx + 1,
              }));
            detailObj.ALL = {
              label: "All seasons",
              rows: combinedRows,
            };
          }

          setDetailDataByYear(detailObj);
          const numericSeasons = Object.entries(detailObj)
            .filter(([seasonKey]) => seasonKey !== "ALL")
            .map(([seasonKey, info]) => ({
              value: String(seasonKey),
              label: info.label,
              sortKey: Number(seasonKey),
            }))
            .sort((a, b) => (Number.isFinite(b.sortKey) ? b.sortKey : 0) - (Number.isFinite(a.sortKey) ? a.sortKey : 0))
            .map(({ value, label }) => ({ value, label }));

          if (detailObj.ALL) {
            numericSeasons.unshift({ value: "ALL", label: detailObj.ALL.label });
          }

          setSeasonOptions(numericSeasons);
        } else {
          setDetailDataByYear({});
          setSeasonOptions([]);
        }

        let pivotData = Array.from(pivotMap.values()).sort(
          (a, b) => Number(a.date) - Number(b.date)
        );
        const years = pivotData.map((r) => Number(r.date)).filter((y) => !isNaN(y));
        if (!shouldUseDetailPrimary && years.length) {
          const minYear = Math.min(...years);
          const maxYear = Math.max(...years);
          setXDomain([minYear, maxYear]);
          setDefaultDomain([minYear, maxYear]);
        }
        const existingYears = new Set(pivotData.map((r) => r.date));
        const missingYears = Array.from(selectedYearsSet).filter((y) => !existingYears.has(y));
        if (missingYears.length > 0) {
          const blanks = missingYears.map((y) => ({ date: y }));
          pivotData = pivotData.concat(blanks).sort((a, b) => Number(a.date) - Number(b.date));
        }
        // Post-process to break flat segments (no change over time).
        // For each team series, if a value equals the previous non-null value,
        // set it to null so Recharts does not draw a horizontal line.
        if (teams && teams.length > 0 && pivotData.length > 0) {
          const processed = pivotData.map((row) => ({ ...row }));
          const EPS = 1e-9;
          teams.forEach((team) => {
            let prev = null;
            for (let i = 0; i < processed.length; i++) {
              const v = processed[i][team];
              if (v == null || Number.isNaN(v)) continue;
              if (prev != null && Math.abs(v - prev) <= EPS) {
                // same as previous -> null out to break the flat line segment
                processed[i][team] = null;
              } else {
                prev = v;
              }
            }
          });
          pivotData = processed;
        }

        setData(pivotData);
        const m = {};
        (teams || []).forEach((team) => {
          const years = yearsForTeam(team);
          if (years.length === 0) return;
          years.forEach((ySelRaw) => {
            const ySel = Number(ySelRaw);
            const hd = pivotData.map((row) => {
              const out = { date: row.date };
              out.__isHighlight = row.date === ySel;
              out[team] = row.date === ySel ? (row[team] ?? null) : null;
              return out;
            });
            const hasCategory = pivotData.some((r) => r.date === ySel);
            const hasValue = pivotData.some((r) => r.date === ySel && r[team] != null);
            if (hasCategory && !hasValue) {
              const idx = pivotData.findIndex((r) => r.date === ySel);
              let anchor = null;
              for (let i = idx - 1; i >= 0; i--) {
                if (pivotData[i][team] != null) { anchor = pivotData[i][team]; break; }
              }
              if (anchor === null) {
                for (let i = idx + 1; i < pivotData.length; i++) {
                  if (pivotData[i][team] != null) { anchor = pivotData[i][team]; break; }
                }
              }
              if (anchor !== null) { hd[idx][team] = anchor; }
            }
            if (!m[team]) m[team] = [];
            m[team].push({ year: ySel, data: hd });
          });
        });
        setHighlightDataByTeam(m);
        setDisplayedTeams(teams);
        if (!shouldUseDetailPrimary) {
          setBrushRange([0, Math.max(0, pivotData.length - 1)]);
        }
      })
      .catch((err) => {
        setError(err.message || "Failed to load rating data");
        setData([]);
        setDisplayedTeams([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [teams, selectedYear, selectedYearsByTeam, shouldUseDetailPrimary]);

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

  useEffect(() => {
    if (!shouldUseDetailPrimary) return;
    if (!chartData || chartData.length === 0) return;
    const timestamps = chartData
      .map((row) => Number(row.timestamp))
      .filter((v) => Number.isFinite(v));
    if (timestamps.length === 0) return;
    const minTs = Math.min(...timestamps);
    const maxTs = Math.max(...timestamps);
    setXDomain([minTs, maxTs]);
    setDefaultDomain([minTs, maxTs]);
    setBrushRange([0, Math.max(0, chartData.length - 1)]);
  }, [shouldUseDetailPrimary, chartData]);

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

  const formatDetailTick = React.useCallback((value) => {
    if (value == null) return "";
    const num = Number(value);
    if (!Number.isFinite(num)) return "";
    const date = new Date(num);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }, []);

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
    },
    [data, chartData, defaultDomain, shouldUseDetailPrimary]
  );

  const resetZoom = React.useCallback(() => {
    const dataset = shouldUseDetailPrimary ? chartData : data;
    setBrushRange([0, Math.max(0, dataset.length - 1)]);
    setXDomain(defaultDomain);
    setAnimateLines(true);
  }, [data, chartData, defaultDomain, shouldUseDetailPrimary]);

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
                  setSeasonFilter(event.target.value || "ALL");
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
                  ticks={xTicks}
                  tick={shouldUseDetailPrimary ? undefined : <YearAwareTick />}
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
