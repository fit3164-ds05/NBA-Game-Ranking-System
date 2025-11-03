import { useEffect, useState } from "react";
import { getTeams } from "../lib/api";
import { getTeamColor, getTeamHighlightColor } from "../lib/teamColors";
import RatingChart from "../components/RatingChart";
import FloatingCard from "../components/FloatingCard";
import {
  computeCurrentSeasonEnd,
  formatTeamLabel,
  stripParenthetical,
} from "../utils/teamLabels";

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

export default function HistoricalRanking() {
  const [teams, setTeams] = useState([]); // All teams from API
  const [highlighted, setHighlighted] = useState([]); // Highlighted teams
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [error, setError] = useState("");
  const [teamDisplayNames, setTeamDisplayNames] = useState({});

  // Load teams on mount
  useEffect(() => {
    let active = true;
    async function run() {
      try {
        const { teams: list, seasonBounds } = await getTeams();
        if (!active) return;
        setTeams(list);
        const seasonEnd = computeCurrentSeasonEnd(seasonBounds);
        const mapped = {};
        (list || []).forEach((team) => {
          const base = stripParenthetical(team) || team;
          const bound =
            seasonBounds?.[team] ??
            seasonBounds?.[base] ??
            seasonBounds?.[team.replace(/\s+\(.+\)$/, "").trim()];
          mapped[team] = formatTeamLabel(team, bound, seasonEnd);
        });
        setTeamDisplayNames(mapped);
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
    <div className="flex w-full flex-col gap-6 text-slate-900">
      {/* Page header */}
      <FloatingCard tone="light" padding="p-6" wrapChildren={false}
        title = "Historical Ratings"
        body = "Select one or more teams to highlight their historical ratings below. Use the filter buttons or click directly on the chart lines to toggle teams.">
      </FloatingCard>

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
              {teamDisplayNames[team] || team}
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

      {/* Ratings explanation */}
      <FloatingCard
        tone="light"
        className="lg:col-span-4"
        title="Explanation of Historical Ratings"
        titleSize="text-lg"
        body=""
        bodySize="text-sm"
        childrenClassName="mt-4 space-y-3 text-sm text-slate-600"
      >
        <p className="text-slate-500">
          Our historical rating system uses Glicko-2 to track team strength over time.
          Each team carries three values: a rating (skill), a rating deviation RD
          (uncertainty), and a volatility term that governs how quickly the rating can move.
        </p>

        <p className="text-slate-500">
          After each game we update the winner and loser via the library's update rule,
          and we record the new rating as the team's snapshot for that date. Higher RD
          implies greater uncertainty; as teams play more games RD shrinks and updates become
          steadier. Volatility allows larger moves for genuinely inconsistent teams.
        </p>

        <p className="text-slate-500">
          This setup does not add home-court, margin-of-victory, or season reset effects; it's a
          straight Glicko-2 process with ratings centered around 1500. That keeps it comparable to
          ELO while providing calibrated uncertainty and more responsive updates when warranted.
        </p>

      </FloatingCard>
    </div>
  );
}
