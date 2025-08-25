import React, { useEffect, useState } from "react";
import { getRatingsSeries } from "../lib/api";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

export default function RatingChart({ teams, selectedYear, selectedYearsByTeam }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState([]);
  const [displayedTeams, setDisplayedTeams] = useState([]);
  const [highlightDataByTeam, setHighlightDataByTeam] = useState({});

  // Build a set of highlighted years from either a global selectedYear or per-team selections
  const selectedYearsSet = React.useMemo(() => {
    const s = new Set();
    if (selectedYear) s.add(String(selectedYear));
    if (selectedYearsByTeam) {
      Object.values(selectedYearsByTeam).forEach((val) => {
        if (Array.isArray(val)) {
          val.forEach((y) => { if (y !== undefined && y !== null) s.add(String(y)); });
        } else if (val !== undefined && val !== null) {
          s.add(String(val));
        }
      });
    }
    return s;
  }, [selectedYear, selectedYearsByTeam]);

  useEffect(() => {
    console.log("[RatingChart] selectedYearsSet:", Array.from(selectedYearsSet));
  }, [selectedYearsSet]);

  const baseTeamColor = (idx) => `hsl(${(idx * 60) % 360}, 70%, 50%)`;
  const highlightTeamColor = (idx) => `hsl(${(idx * 60) % 360}, 90%, 35%)`;
  const yearsForTeam = (team) => {
    if (selectedYearsByTeam && selectedYearsByTeam[team] != null) {
      const v = selectedYearsByTeam[team];
      return Array.isArray(v) ? v.map(String) : [String(v)];
    }
    if (selectedYear != null) return [String(selectedYear)];
    return [];
  };

  const yearToTeams = React.useMemo(() => {
    const map = new Map();
    displayedTeams.forEach((team, idx) => {
      yearsForTeam(team).forEach((y) => {
        if (!map.has(y)) map.set(y, []);
        map.get(y).push({ team, idx });
      });
    });
    return map;
  }, [displayedTeams, selectedYearsByTeam, selectedYear]);

  const isHighlightedYear = (yearStr) => {
    if (!yearStr || selectedYearsSet.size === 0) return false;
    return selectedYearsSet.has(String(yearStr));
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
        console.log("[RatingChart] teams prop:", teams);
        console.log("[RatingChart] raw response from getRatingsSeries:", res);
        console.log("[RatingChart] total records:", res.length);
        if (res.length > 0) {
          console.log("[RatingChart] sample record:", res[0]);
        }
        // res.data is an array of { date, team, rating }
        // pivot it by date: { date, TeamA: rating, TeamB: rating, ... }
        const pivotMap = new Map();
        res.forEach(({ date, team, rating }) => {
          const year = String(date).slice(0, 4); // <-- Only the year
          if (!pivotMap.has(year)) {
            pivotMap.set(year, { date: year });
          }
          pivotMap.get(year)[team] = rating;
        });
        let pivotData = Array.from(pivotMap.values()).sort(
          (a, b) => Number(a.date) - Number(b.date)
        );
        // Ensure all selected years exist as X-axis categories, even if teams lack values for that year
        const existingYears = new Set(pivotData.map((r) => r.date));
        const missingYears = Array.from(selectedYearsSet).filter((y) => !existingYears.has(y));
        if (missingYears.length > 0) {
          const blanks = missingYears.map((y) => ({ date: y }));
          pivotData = pivotData.concat(blanks).sort((a, b) => Number(a.date) - Number(b.date));
        }
        setData(pivotData);
        // Build per-team highlight datasets based on each team's selected year
        const m = {};
        (teams || []).forEach((team) => {
          const years = yearsForTeam(team);
          if (years.length === 0) return;
          years.forEach((ySelRaw) => {
            const ySel = String(ySelRaw);
            const hd = pivotData.map((row) => {
              const out = { date: row.date };
              out[team] = row.date === ySel ? (row[team] ?? null) : null;
              return out;
            });
            const hasCategory = pivotData.some((r) => r.date === ySel);
            const hasValue = pivotData.some((r) => r.date === ySel && r[team] != null);
            if (hasCategory && !hasValue) {
              const idx = pivotData.findIndex((r) => r.date === ySel);
              let anchor = null;
              for (let i = idx - 1; i >= 0; i--) { if (pivotData[i][team] != null) { anchor = pivotData[i][team]; break; } }
              if (anchor === null) { for (let i = idx + 1; i < pivotData.length; i++) { if (pivotData[i][team] != null) { anchor = pivotData[i][team]; break; } } }
              if (anchor !== null) { hd[idx][team] = anchor; }
            }
            if (!m[team]) m[team] = [];
            m[team].push({ year: ySel, data: hd });
          });
        });
        setHighlightDataByTeam(m);
        setDisplayedTeams(teams);
        console.log("[RatingChart] pivotData sample:", pivotData.slice(0, 5));
        console.log("[RatingChart] highlightDataByTeam sample:", m);
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

  // Custom tick that boldens ticks that fall within the selected years
  const YearAwareTick = (props) => {
    const { x, y, payload } = props;
    const d = payload && payload.value;
    const bold = isHighlightedYear(d);
    return (
      <g transform={`translate(${x},${y})`}>
        {bold && (
          <rect x={-18} y={2} width={36} height={18} rx={4} ry={4} fill="#fff7cc" />
        )}
        <text dy={16} textAnchor="middle" fontWeight={bold ? 700 : 400} fill={bold ? "#92400e" : "#333"}>
          {d}
        </text>
      </g>
    );
  };

  return (
    <div className="bg-white border rounded-2xl p-4 shadow-sm mb-4">
      <h2 className="text-lg font-semibold mb-4">Team Ratings Over Time</h2>
      {loading && <p>Loading rating data...</p>}
      {error && <p className="text-red-600">Error: {error}</p>}
      {!loading && !error && data.length === 0 && (
        <p>No rating data available for selected teams.</p>
      )}
      {!loading && !error && data.length > 0 && (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            {false && uniqueTeams.map((team, idx) => (
              yearsForTeam(team).map((y) => {
                const group = yearToTeams.get(y) || [];
                const count = group.length;
                const conflictIdx = Math.max(0, group.findIndex(g => g.team === team));
                const px = count > 1 ? (conflictIdx - (count - 1) / 2) * 7 : 0;
                return (
                  <ReferenceLine
                    key={`ref-${team}-${y}`}
                    x={y}
                    ifOverflow="extendDomain"
                    stroke={baseTeamColor(idx)}
                    strokeDasharray="4 4"
                    strokeWidth={2}
                    label={count > 1 ? {
                      position: "top",
                      content: (props) => {
                        const { viewBox } = props || {};
                        if (!viewBox) return null;
                        const x = (viewBox.x || 0) + px;
                        const yTop = (viewBox.y || 0);
                        return (
                          <g>
                            <line x1={x} y1={yTop} x2={x} y2={yTop + 12} stroke={baseTeamColor(idx)} strokeWidth={3} />
                          </g>
                        );
                      }
                    } : undefined}
                  />
                );
              })
            ))}
            <XAxis dataKey="date" type="category" tick={<YearAwareTick />} allowDuplicatedCategory={false} />
            <YAxis
              domain={yDomain}
              tickFormatter={(val) => val.toFixed(2)}
              allowDecimals={true}
            />
            <Tooltip />
            <Legend
              content={() => (
                <ul style={{ display: "flex", gap: 16, listStyle: "none", padding: 0, margin: 0 }}>
                  {uniqueTeams.map((team, idx) => (
                    <li key={team} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <svg width="14" height="14" viewBox="0 0 14 14">
                        <line x1="1" y1="7" x2="13" y2="7" stroke={baseTeamColor(idx)} strokeWidth="3" />
                      </svg>
                      <span>{team}</span>
                    </li>
                  ))}
                </ul>
              )}
            />
            {uniqueTeams.map((team, idx) => (
              <Line
                key={team}
                type="monotone"
                dataKey={team}
                stroke={baseTeamColor(idx)}
                strokeWidth={2}
                dot={false}
              />
            ))}
            {uniqueTeams.flatMap((team, idx) => {
              const arr = highlightDataByTeam[team];
              if (!arr || arr.length === 0) return [];
              return arr.map(({ year, data }) => (
                <Line
                  key={`${team}__highlight__${year}`}
                  type="monotone"
                  dataKey={team}
                  data={data}
                  stroke={highlightTeamColor(idx)}
                  strokeWidth={5}
                  isAnimationActive={false}
                  dot={{ r: 5 }}
                  activeDot={{ r: 6 }}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  legendType="none"
                  name={undefined}
                />
              ));
            })}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
