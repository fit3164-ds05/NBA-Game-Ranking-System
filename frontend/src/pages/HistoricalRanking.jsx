import { useEffect, useState } from "react";
import RatingChart from "../components/RatingChart";
import { getTeams } from "../lib/api";

/**
 * HistoricalRanking page
 * Renders all NBA teams and allows users to highlight any subset.
 * - All teams are always shown in the chart.
 * - Clicking a team button toggles whether that team is highlighted.
 * - Users can quickly highlight or clear all teams with the bulk actions.
 * - Below the controls, a RatingChart visualises the ratings with highlighted teams emphasized.
 */
export default function HistoricalRanking() {
  const [teams, setTeams] = useState([]); // All teams from API
  const [highlighted, setHighlighted] = useState([]); // Highlighted teams
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [error, setError] = useState("");

  // Load teams on mount
  useEffect(() => {
    let active = true;
    async function run() {
      try {
        const list = await getTeams();
        if (!active) return;
        setTeams(list);
      } catch (e) {
        if (active) setError(e.message || "Failed to load teams");
      } finally {
        if (active) setLoadingTeams(false);
      }
    }
    run();
    return () => {
      active = false;
    };
  }, []);

  function toggleTeam(team) {
    setHighlighted((prev) =>
      prev.includes(team) ? prev.filter((t) => t !== team) : [...prev, team]
    );
  }

  function highlightAll() {
    setHighlighted(teams);
  }

  function clearHighlights() {
    setHighlighted([]);
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Historical Ratings</h2>

      {/* Team highlight buttons */}
      <div className="flex flex-wrap gap-2">
        {teams.map((team) => {
          const active = highlighted.includes(team);
          return (
            <button
              key={team}
              onClick={() => toggleTeam(team)}
              className={`px-3 py-1 rounded border text-sm transition-colors duration-150 ${
                active
                  ? "bg-amber-600 text-white border-amber-600"
                  : "bg-white text-gray-800 border-gray-300 hover:bg-gray-100"
              }`}
            >
              {team}
            </button>
          );
        })}
      </div>

      {/* Bulk actions */}
      {teams.length > 0 && (
        <div className="space-x-2">
          <button
            className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
            onClick={highlightAll}
          >
            Highlight All
          </button>
          <button
            className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
            onClick={clearHighlights}
          >
            Clear Highlights
          </button>
        </div>
      )}

      {/* Rating chart */}
      <div>
        {loadingTeams && <p>Loading teams...</p>}
        {error && <p className="text-red-600">Error: {error}</p>}
        {!loadingTeams && !error && (
          <RatingChart teams={teams} highlightedTeams={highlighted} onToggleTeam={toggleTeam} />
        )}
      </div>
    </div>
  );
}

