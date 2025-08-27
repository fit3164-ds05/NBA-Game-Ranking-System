import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { getRatingsSeries } from "../lib/api";

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
    <div ref={wrapperRef} className="w-full">
      <svg ref={svgRef}></svg>
      {teams.length > 0 && (
        <div className="flex flex-wrap gap-4 mt-2">
          {teams.map((t, idx) => (
            <div key={t} className="flex items-center gap-1 text-sm">
              <span
                style={{ backgroundColor: d3.schemeTableau10[idx % 10], width: 12, height: 12 }}
              ></span>
              <span>{t}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
