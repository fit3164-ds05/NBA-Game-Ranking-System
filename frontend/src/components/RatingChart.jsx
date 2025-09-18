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


export default function RatingChart({
  teams,
  selectedYear,
  selectedYearsByTeam,
  highlightedTeams = [],
  onToggleTeam,
  onSelectTeam,
  showTooltip = true,
  maxTooltipItems = 6,
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
        res.forEach(({ date, team, rating }) => {
          const year = Number(String(date).slice(0, 4));
          if (!pivotMap.has(year)) {
            pivotMap.set(year, { date: year });
          }
          pivotMap.get(year)[team] = rating;
        });
        let pivotData = Array.from(pivotMap.values()).sort(
          (a, b) => Number(a.date) - Number(b.date)
        );
        const years = pivotData.map((r) => Number(r.date)).filter((y) => !isNaN(y));
        if (years.length) {
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
        setBrushRange([0, Math.max(0, pivotData.length - 1)]);
      })
      .catch((err) => {
        setError(err.message || "Failed to load rating data");
        setData([]);
        setDisplayedTeams([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [teams, selectedYear, selectedYearsByTeam]);

  const uniqueTeams = React.useMemo(
    () => Array.from(new Set(displayedTeams)),
    [displayedTeams]
  );

  useEffect(() => {
    setHoveredTeams((prev) => prev.filter((team) => uniqueTeams.includes(team)));
  }, [uniqueTeams]);

  const yDomain = React.useMemo(() => {
    if (!data || data.length === 0 || !uniqueTeams || uniqueTeams.length === 0) {
      return ["auto", "auto"];
    }
    const values = [];
    for (const row of data) {
      for (const team of uniqueTeams) {
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
  }, [data, uniqueTeams]);

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
        {bold && (
          <rect x={-18} y={2} width={36} height={18} rx={4} ry={4} fill="#fff7cc" />
        )}
        <text dy={16} textAnchor="middle" fontWeight={bold ? 700 : 400} fill={bold ? "#92400e" : "#333"}>
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

    // Deduplicate by team name (keep first occurrence)
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
      if (!range || range.startIndex == null || range.endIndex == null) {
        setBrushRange([0, Math.max(0, data.length - 1)]);
        setXDomain(defaultDomain);
        return;
      }
      const { startIndex, endIndex } = range;
      const clamp = (idx) => {
        if (Number.isNaN(idx) || idx == null) return 0;
        return Math.max(0, Math.min(idx, Math.max(0, data.length - 1)));
      };
      const start = clamp(startIndex);
      const end = clamp(endIndex);
      if (data.length === 0) {
        setBrushRange([start, end]);
        return;
      }
      const left = Math.min(start, end);
      const right = Math.max(start, end);
      const leftYear = data[left]?.date;
      const rightYear = data[right]?.date;
      if (leftYear == null || rightYear == null) {
        setBrushRange([left, right]);
        return;
      }
      setBrushRange([left, right]);
      setXDomain([Number(leftYear), Number(rightYear)]);
    },
    [data, defaultDomain]
  );

  const resetZoom = React.useCallback(() => {
    setBrushRange([0, Math.max(0, data.length - 1)]);
    setXDomain(defaultDomain);
  }, [data, defaultDomain]);

  return (
    <div className="bg-white border rounded-2xl p-4 shadow-sm mb-4">
      <h2 className="text-lg font-semibold mb-4">Team Ratings Over Time</h2>
      {loading && <p>Loading rating data...</p>}
      {error && <p className="text-red-600">Error: {error}</p>}
      {!loading && !error && data.length === 0 && (
        <p>No rating data available for selected teams.</p>
      )}
      {!loading && !error && data.length > 0 && (
        <div className="relative">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart
              data={data}
              onMouseLeave={handleChartMouseLeave}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                type="number"
                domain={xDomain}
                ticks={xTicks}
                tick={<YearAwareTick />}
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

              {showTooltip && <Tooltip content={<CustomTooltip />} />}

              {uniqueTeams.map((team, idx) => {
                const isHovered = hoveredSet.has(team);
                const isUserHighlighted = highlightedSet.has(team);
                const isActive = legendTeamSet.has(team);
                const faded = legendTeams.length > 0 && !isActive;
                return (
                  <Line
                    key={team}
                    type="monotone"
                    dataKey={team}
                    stroke={getTeamColor(team)}
                    strokeWidth={isHovered ? 5 : isUserHighlighted ? 4 : 2}
                    strokeOpacity={faded ? 0.15 : 1}
                    dot={false}
                    activeDot={false}
                    onClick={() => handleSelectTeam(team)}
                    onMouseEnter={() => handleLineEnter(team)}
                    onMouseLeave={() => handleLineLeave(team)}
                    cursor="pointer"
                  />
                );
              })}
              {uniqueTeams.flatMap((team, idx) => {
                const arr = highlightDataByTeam[team];
                if (!arr || arr.length === 0) return [];
                const isHovered = hoveredSet.has(team);
                const isUserHighlighted = highlightedSet.has(team);
                const isActive = legendTeamSet.has(team);
                const faded = legendTeams.length > 0 && !isActive;
                return arr.map(({ year, data }) => (
                  <Line
                    key={`${team}__highlight__${year}`}
                    type="monotone"
                    dataKey={team}
                    data={data}
                    stroke={getTeamHighlightColor(team)}
                    strokeWidth={isHovered ? 7 : isUserHighlighted ? 6 : 5}
                    strokeOpacity={faded ? 0.08 : 1}
                    isAnimationActive={false}
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
            <ResponsiveContainer width="100%" height={90}>
              <LineChart
                data={data}
                margin={{ top: 0, right: 16, left: 16, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="2 6" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  type="number"
                  height={24}
                  domain={defaultDomain}
                  allowDuplicatedCategory={false}
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: "#6b7280" }}
                />
                <YAxis hide domain={yDomain} />
                {uniqueTeams.map((team) => (
                  <Line
                    key={`context-${team}`}
                    type="monotone"
                    dataKey={team}
                    stroke={getTeamColor(team)}
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                    strokeOpacity={0.5}
                  />
                ))}
                <Brush
                  dataKey="date"
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
          </div>
        </div>
      )}
    </div>
  );
}
