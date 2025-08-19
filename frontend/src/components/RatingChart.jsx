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
} from "recharts";

export default function RatingChart({ teams }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState([]);
  const [displayedTeams, setDisplayedTeams] = useState([]);

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
          if (!pivotMap.has(date)) {
            pivotMap.set(date, { date });
          }
          pivotMap.get(date)[team] = rating;
        });
        const pivotData = Array.from(pivotMap.values()).sort(
          (a, b) => new Date(a.date) - new Date(b.date)
        );
        setData(pivotData);
        setDisplayedTeams(teams);
        console.log("[RatingChart] pivotData sample:", pivotData.slice(0, 5));
        console.log("[RatingChart] displayedTeams:", displayedTeams);
      })
      .catch((err) => {
        setError(err.message || "Failed to load rating data");
        setData([]);
        setDisplayedTeams([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [teams]);

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
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            {displayedTeams.map((team, idx) => (
              <Line
                key={team}
                type="monotone"
                dataKey={team}
                stroke={`hsl(${(idx * 60) % 360}, 70%, 50%)`}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
