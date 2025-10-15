import { useEffect, useState } from "react";
import RatingChart from "../components/RatingChart";
import { getTeams } from "../lib/api";
import { getTeamColor, getTeamHighlightColor } from "../lib/teamColors";

function pickTextColor(background) {
  if (!background) return "#1f2937";
  if (background.startsWith("hsl")) {
    const match = background.match(/hsl\(([-\d.]+),\s*([-\d.]+)%?,\s*([-\d.]+)%?\)/i);
    if (match) {
      const lightness = Number(match[3]);
      return lightness >= 60 ? "#1f2937" : "#ffffff";
    }
    return "#1f2937";
  }
  if (background.startsWith("#")) {
    const hex = background.slice(1);
    const num = parseInt(hex.length === 3 ? hex.replace(/(.)/g, "$1$1") : hex, 16);
    if (Number.isNaN(num)) return "#1f2937";
    const r = (num >> 16) & 0xff;
    const g = (num >> 8) & 0xff;
    const b = num & 0xff;
    const luminance = 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
    return luminance > 0.64 ? "#1f2937" : "#ffffff";
  }
  return "#1f2937";
}

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
        const { teams: list } = await getTeams();
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
      <p className="text-sm text-gray-600">
        This tool calculates the historical ratings for each NBA team using the Elo rating system.
      </p>
      <h3 className="text-lg font-semibold text-gray-800">Filter teams</h3>
      <p className="text-sm text-gray-600">
        Select one or more teams to highlight their historical ratings below. Use the filter buttons or click directly on the chart lines to toggle teams.
      </p>

      {/* Team highlight buttons */}
      <div className="flex flex-wrap gap-2">
        {teams.map((team) => {
          const active = highlighted.includes(team);
          const teamColor = active ? getTeamColor(team) : null;
          const borderColor = active ? getTeamHighlightColor(team) : null;
          const textColor = active ? pickTextColor(teamColor) : undefined;
          return (
            <button
              key={team}
              onClick={() => toggleTeam(team)}
              className={`px-3 py-1 rounded border text-sm transition-colors duration-150 ${
                active
                  ? "shadow-sm"
                  : "bg-white text-gray-800 border-gray-300 hover:bg-gray-100"
              }`}
              style={
                active
                  ? {
                      backgroundColor: teamColor,
                      borderColor,
                      color: textColor,
                    }
                  : undefined
              }
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
          <RatingChart
            teams={teams}
            highlightedTeams={highlighted}
            onToggleTeam={toggleTeam}
            onSelectTeam={toggleTeam}
            showSeasonDetail
          />
        )}
      </div>
    </div>
  );
}
