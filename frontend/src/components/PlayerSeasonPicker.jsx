import { useEffect, useState } from "react";
import PlayerDropdown from "./PlayerDropdown";           // case-sensitive import for deployment
import YearDropdown from "./YearDropdown";
import { getPlayerSeasons, getPlayerShots } from "../lib/api";

export default function PlayerSeasonPicker({
  defaultSeason = "2024-25",
  autoFetchShots = true,
  onComplete,         // (payload: { player, season, shots? }) => void
}) {
  const [player, setPlayer] = useState(null);
  const [years, setYears] = useState([]);
  const [year, setYear] = useState("");
  const [loadingYears, setLoadingYears] = useState(false);
  const [shots, setShots] = useState(null);
  const [loadingShots, setLoadingShots] = useState(false);
  const [error, setError] = useState("");

  // When player changes - fetch seasons
  useEffect(() => {
    let cancelled = false;
    async function run() {
      setError("");
      setShots(null);
      setYears([]);
      setYear("");
      if (!player?.playerId) return;

      setLoadingYears(true);
      try {
        const list = await getPlayerSeasons(player.playerId, { onlyWithGames: true });
        if (cancelled) return;
        setYears(list);
        if (list.length) setYear(list[0]); // preselect latest
      } catch (e) {
        if (!cancelled) setError("Failed to load seasons.");
      } finally {
        if (!cancelled) setLoadingYears(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [player]);

  // When both player + season exist - optionally fetch shots
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!autoFetchShots || !player?.playerId || !year) {
        setShots(null);
        return;
      }
      setLoadingShots(true);
      setError("");
      try {
        const payload = await getPlayerShots(player.playerId, year, { teamId: 0 });
        if (cancelled) return;
        setShots(payload);
        onComplete?.({ player, season: year, shots: payload });
      } catch (e) {
        if (!cancelled) setError("Failed to load shot chart.");
      } finally {
        if (!cancelled) setLoadingShots(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [player, year, autoFetchShots, onComplete]);

  // If you don't want auto fetch, still notify parent when both chosen
  useEffect(() => {
    if (!autoFetchShots && player && year) {
      onComplete?.({ player, season: year });
    }
  }, [autoFetchShots, player, year, onComplete]);

  return (
    <div className="flex flex-col gap-3">
      <PlayerDropdown
        season={defaultSeason}
        onSelect={setPlayer}
        placeholder="Search player..."
      />

      <YearDropdown
        years={years}
        value={year}
        onChange={setYear}
        loading={loadingYears}
        disabled={!player}
        label={player ? `Season for ${player.name}` : "Season"}
      />

      {error && <div className="text-sm text-red-600">{error}</div>}
      {/* {loadingShots && <div className="text-sm text-gray-500">Loading shot chart...</div>} */}

      {/* If you want to render shots right here, you can pass `shots` down */}
      {shots?.shots && <div className="text-sm text-gray-500">{shots.count} shots loaded.</div>}
    </div>
  );
}
