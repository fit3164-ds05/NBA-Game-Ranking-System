import { useEffect, useState } from "react";
import RatingChart from "../components/RatingChart";
import { getTeams } from "../lib/api";

/**
 * HistoricalRanking page
 * Allows users to toggle NBA teams and view their Elo ratings over time.
 * - All teams are selected by default once loaded.
 * - Users can select/unselect individual teams or use Select All / Unselect All.
 * - Below the controls, a RatingChart visualises the ratings for selected teams.
 */
export default function HistoricalRanking() {
  const [teams, setTeams] = useState([]); // All teams from API
  const [selected, setSelected] = useState([]); // Currently selected teams
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
        // Select all teams initially
        setSelected(list);
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
    setSelected((prev) =>
      prev.includes(team) ? prev.filter((t) => t !== team) : [...prev, team]
    );
  }

  function selectAll() {
    setSelected(teams);
  }

  function unselectAll() {
    setSelected([]);
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Historical Ratings</h2>

      {/* Team toggle buttons */}
      <div className="flex flex-wrap gap-2">
        {teams.map((team) => {
          const active = selected.includes(team);
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
            onClick={selectAll}
          >
            Select All
          </button>
          <button
            className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
            onClick={unselectAll}
          >
            Unselect All
          </button>
        </div>
      )}

      {/* Rating chart */}
      <div>
        {loadingTeams && <p>Loading teams...</p>}
        {error && <p className="text-red-600">Error: {error}</p>}
        {!loadingTeams && !error && (
          <RatingChart teams={selected} />
        )}
      </div>
    </div>
  );
}

