// src/pages/DashboardHome.jsx
import { useState } from "react";
import PlayerSeasonPicker from "../components/PlayerSeasonPicker";

export default function DashboardHome() {
  const [selection, setSelection] = useState(null); // { player, season, shots }
  const [measure, setMeasure] = useState("FGA");    // FGA | FGM | FG3A | FG3M | PTS

  return (
    <div className="min-h-screen w-full p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-semibold">Player Shot Data</h1>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Measure</label>
            <select
              className="border rounded-lg p-2 bg-white"
              value={measure}
              onChange={(e) => setMeasure(e.target.value)}
            >
              <option value="FGA">FGA (Attempts)</option>
              <option value="FGM">FGM (Makes)</option>
              <option value="FG3A">FG3A (3PA)</option>
              <option value="FG3M">FG3M (3PM)</option>
              <option value="PTS">PTS</option>
            </select>
          </div>
        </header>

        {/* Player - Season - Shots pipeline */}
        <PlayerSeasonPicker
          defaultSeason="2024-25"
          autoFetchShots={true}
          measure={measure}
          onComplete={setSelection}
        />

        {/* Summary card */}
        <section className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            <div>
              <span className="font-medium">Player:</span>{" "}
              {selection?.player?.name ?? "-"}
            </div>
            <div>
              <span className="font-medium">Season:</span>{" "}
              {selection?.season ?? "-"}
            </div>
            <div>
              <span className="font-medium">Total shots:</span>{" "}
              {selection?.shots?.count ?? "-"}
            </div>
          </div>
        </section>

        {/* Raw payload (no visualization yet) */}
        {selection?.shots && (
          <details className="rounded-lg border bg-gray-50 p-4">
            <summary className="cursor-pointer select-none font-medium">
              Show raw payload
            </summary>
            <pre className="mt-3 max-h-96 overflow-auto text-xs">
{JSON.stringify(selection.shots, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
