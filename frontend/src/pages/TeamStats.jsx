import React, { useEffect, useState } from "react";
import { getTeams } from "../lib/api";
import RatingChart from "../components/RatingChart";

// A dashboard for exploring team statistics over time.
// Users can toggle teams to display on the rating chart.
// Includes simple tab navigation with a placeholder for future features.
export default function TeamStats() {
  const [allTeams, setAllTeams] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("teams");

  useEffect(() => {
    getTeams()
      .then((t) => setAllTeams(t))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const toggleTeam = (team) => {
    setSelected((prev) =>
      prev.includes(team) ? prev.filter((t) => t !== team) : [...prev, team]
    );
  };

  const baseTab = "px-4 py-2 rounded";
  const activeTab = "bg-gray-300";
  const inactiveTab = "bg-amber-600 text-white hover:bg-amber-500";

  return (
    <div className="max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-center">Team & Player Stats</h1>

      {/* Subpage navigation */}
      <div className="flex justify-center space-x-4 mb-6">
        <button
          className={`${baseTab} ${tab === "teams" ? activeTab : inactiveTab}`}
          onClick={() => setTab("teams")}
        >
          Team Stats
        </button>
        <button
          className={`${baseTab} ${tab === "team-player" ? activeTab : inactiveTab}`}
          onClick={() => setTab("team-player")}
        >
          Team vs Player Stats
        </button>
      </div>

      {tab === "teams" && (
        <>
          {loading && <p>Loading teams...</p>}
          {error && <p className="text-red-600">Error: {error}</p>}
          {!loading && !error && (
            <div className="flex flex-wrap gap-2 mb-6 justify-center">
              {allTeams.map((team) => (
                <button
                  key={team}
                  onClick={() => toggleTeam(team)}
                  className={`px-3 py-1 border rounded shadow-sm text-sm transition-colors duration-200 ${
                    selected.includes(team)
                      ? "bg-amber-600 text-white"
                      : "bg-white hover:bg-gray-100"
                  }`}
                >
                  {team}
                </button>
              ))}
            </div>
          )}

          <RatingChart teams={selected} />

          <div className="bg-white border rounded-2xl p-4 shadow-sm mt-6">
            <h2 className="text-lg font-semibold mb-4">More Visualisations</h2>
            <p>
              Select teams above to compare their rating trends. Additional team
              statistics will appear here in future updates.
            </p>
          </div>
        </>
      )}

      {tab === "team-player" && (
        <div className="bg-white border rounded-2xl p-8 shadow-sm text-center">
          Team vs Player statistics coming soon.
        </div>
      )}
    </div>
  );
}

