import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
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
  Brush,
} from "recharts";


export default function RatingChart({ teams = [], model }) {
  const wrapperRef = useRef(null);
  const svgRef = useRef(null);
  const [data, setData] = useState([]);
  const [dims, setDims] = useState({ width: 0, height: 0 });

  // handle resize
  useEffect(() => {
    function handleResize() {
      if (wrapperRef.current) {
        setDims({ width: wrapperRef.current.clientWidth, height: 400 });
      }
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // fetch data when teams or model change
  useEffect(() => {
    if (!teams || teams.length === 0) {
      setData([]);
      return;
    }
    getRatingsSeries({ teams, model })
      .then((res) => {
        const map = new Map();
        res.forEach(({ date, team, rating }) => {
          const entry = map.get(date) || { date };
          entry[team] = rating;
          map.set(date, entry);
        });
        const arr = Array.from(map.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
        setData(arr);
      })
      .catch((e) => console.error("failed to fetch ratings", e));
  }, [teams, model]);

  // draw chart
  useEffect(() => {
    if (!data.length || !dims.width || teams.length === 0) return;

    const margin = { top: 10, right: 30, bottom: 30, left: 60 };
    const width = dims.width - margin.left - margin.right;
    const height = dims.height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    const g = svg
      .attr("width", dims.width)
      .attr("height", dims.height)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const parseDate = d3.timeParse("%Y-%m-%d");
    const allDates = data.map((d) => parseDate(d.date));

    const x = d3.scaleTime().domain(d3.extent(allDates)).range([0, width]);

    const y = d3
      .scaleLinear()
      .domain([
        d3.min(teams, (t) => d3.min(data, (d) => (d[t] != null ? d[t] : Infinity))),
        d3.max(teams, (t) => d3.max(data, (d) => (d[t] != null ? d[t] : -Infinity))),
      ])
      .nice()
      .range([height, 0]);

    const color = d3.scaleOrdinal(d3.schemeTableau10).domain(teams);

    const xAxis = g
      .append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x));

    g.append("g").attr("class", "y-axis").call(d3.axisLeft(y));

    g
      .append("defs")
      .append("clipPath")
      .attr("id", "clip")
      .append("rect")
      .attr("width", width)
      .attr("height", height);

    const lineGen = d3
      .line()
      .x((d) => x(parseDate(d.date)))
      .y((d) => y(d.value));

    const lineGroup = g.append("g").attr("clip-path", "url(#clip)");

    teams.forEach((team) => {
      const series = data
        .map((row) => ({ date: row.date, value: row[team] }))
        .filter((d) => d.value != null);
      lineGroup
        .append("path")
        .datum(series)
        .attr("fill", "none")
        .attr("stroke", color(team))
        .attr("stroke-width", 1.5)
        .attr("class", "line")
        .attr("d", lineGen);
    });

    const brush = d3.brushX().extent([
      [0, 0],
      [width, height],
    ]);

    const brushGroup = g.append("g").attr("class", "brush").call(brush.on("end", updateChart));

    function updateChart(event) {
      const extent = event.selection;
      if (!extent) return;
      const [x0, x1] = extent.map(x.invert);
      x.domain([x0, x1]);
      lineGroup.selectAll(".line").attr("d", (d) => lineGen(d));
      xAxis.call(d3.axisBottom(x));
      brushGroup.call(brush.move, null);
    }

    svg.on("dblclick", () => {
      x.domain(d3.extent(allDates));
      lineGroup.selectAll(".line").attr("d", (d) => lineGen(d));
      xAxis.call(d3.axisBottom(x));
    });
  }, [data, teams, dims]);

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
            <Tooltip content={<CustomTooltip />} />
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
                  activeDot={false}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  legendType="none"
                  name={undefined}
                />
              ));
            })}
            <Brush dataKey="date" height={20} stroke="#8884d8" />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
