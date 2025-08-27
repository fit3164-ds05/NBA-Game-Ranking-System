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
  ReferenceArea,
} from "recharts";


export default function RatingChart({ teams, selectedYear, selectedYearsByTeam, highlightedTeams = [], onToggleTeam }) {

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState([]);
  const [displayedTeams, setDisplayedTeams] = useState([]);
  const [highlightDataByTeam, setHighlightDataByTeam] = useState({});
  const [refAreaLeft, setRefAreaLeft] = useState(null);
  const [refAreaRight, setRefAreaRight] = useState(null);
  const [xDomain, setXDomain] = useState(["auto", "auto"]);

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

  const baseTeamColor = (idx) => `hsl(${(idx * 60) % 360}, 70%, 50%)`;
  const highlightTeamColor = (idx) => `hsl(${(idx * 60) % 360}, 90%, 35%)`;
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
        const existingYears = new Set(pivotData.map((r) => r.date));
        const missingYears = Array.from(selectedYearsSet).filter((y) => !existingYears.has(y));
        if (missingYears.length > 0) {
          const blanks = missingYears.map((y) => ({ date: y }));
          pivotData = pivotData.concat(blanks).sort((a, b) => Number(a.date) - Number(b.date));
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

  const CustomTooltip = ({ active, label, payload }) => {
    if (!active || !payload || payload.length === 0) return null;
    let filtered = payload.filter(
      (p) => !p?.payload?.__isHighlight && p.value != null
    );
    if (highlightedTeams.length > 0) {
      filtered = filtered.filter((p) => highlightedTeams.includes(p.name));
    }
    const map = new Map();
    for (const p of filtered) {
      if (!map.has(p.name)) {
        map.set(p.name, p);
      }
    }
    if (map.size === 0) return null;
    return (
      <div
        style={{
          backgroundColor: "white",
          border: "1px solid #ccc",
          padding: 8,
          borderRadius: 4,
        }}
      >
        <div style={{ fontWeight: "bold", marginBottom: 4 }}>{label}</div>
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {Array.from(map.values()).map((p) => (
            <li key={p.name} style={{ marginBottom: 2, color: p.color }}>
              <span>{p.name}: </span>
              <span>{Number(p.value).toFixed(2)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const onMouseDown = (e) => {
    if (e && e.activeLabel != null) {
      setRefAreaLeft(e.activeLabel);
      setRefAreaRight(e.activeLabel);
    }
  };

  const onMouseMove = (e) => {
    if (!refAreaLeft || e.activeLabel == null) return;
    setRefAreaRight(e.activeLabel);
  };

  const onMouseUp = () => {
    if (refAreaLeft == null || refAreaRight == null) {
      setRefAreaLeft(null);
      setRefAreaRight(null);
      return;
    }
    if (refAreaLeft === refAreaRight) {
      setRefAreaLeft(null);
      setRefAreaRight(null);
      return;
    }
    let [left, right] = [refAreaLeft, refAreaRight];
    if (left > right) [left, right] = [right, left];
    setXDomain([left, right]);
    setRefAreaLeft(null);
    setRefAreaRight(null);
  };

  const zoomOut = () => {
    setXDomain(["auto", "auto"]);
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
          <LineChart
            data={data}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onDoubleClick={zoomOut}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <ReferenceArea
              x1={refAreaLeft}
              x2={refAreaRight}
              ifOverflow="extendDomain"
              strokeOpacity={0.3}
              fillOpacity={0.1}
            />
            <XAxis
              dataKey="date"
              type="number"
              domain={xDomain}
              tick={<YearAwareTick />}
              allowDuplicatedCategory={false}
              allowDataOverflow
            />
            <YAxis
              domain={yDomain}
              tickFormatter={(val) => val.toFixed(2)}
              allowDecimals={true}
              allowDataOverflow
            />

            <Tooltip content={<CustomTooltip />} />

            {uniqueTeams.map((team, idx) => {
              const highlighted = highlightedTeams.includes(team);
              const faded = highlightedTeams.length > 0 && !highlighted;
              return (
                <Line
                  key={team}
                  type="monotone"
                  dataKey={team}
                  stroke={baseTeamColor(idx)}
                  strokeWidth={highlighted ? 4 : 2}
                  strokeOpacity={faded ? 0.1 : 1}
                  dot={false}
                  onClick={() => onToggleTeam && onToggleTeam(team)}
                  cursor="pointer"
                />
              );
            })}
            {uniqueTeams.flatMap((team, idx) => {
              const arr = highlightDataByTeam[team];
              if (!arr || arr.length === 0) return [];
              const highlighted = highlightedTeams.includes(team);
              const faded = highlightedTeams.length > 0 && !highlighted;
              return arr.map(({ year, data }) => (
                <Line
                  key={`${team}__highlight__${year}`}
                  type="monotone"
                  dataKey={team}
                  data={data}
                  stroke={highlightTeamColor(idx)}
                  strokeWidth={highlighted ? 6 : 5}
                  strokeOpacity={faded ? 0.05 : 1}
                  isAnimationActive={false}
                  dot={{ r: 5 }}
                  activeDot={false}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  legendType="none"
                  name={undefined}
                  onClick={() => onToggleTeam && onToggleTeam(team)}
                  cursor="pointer"
                />
              ));
            })}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
