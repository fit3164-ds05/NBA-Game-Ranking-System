import { useState } from "react";
import DashboardSwitcher from "../components/DashboardSwitcher";
import FloatingCard from "../components/FloatingCard";
import PlayerSeasonPicker from "../components/PlayerSeasonPicker";
import ShotChart from "../components/ShotChart";

export default function DashboardShotChart() {
  const [selection, setSelection] = useState(null); // { player, season, shots }

  const summaryItems = [
    { label: "Player", value: selection?.player?.name ?? "-" },
    { label: "Season", value: selection?.season ?? "-" },
    { label: "Total shots", value: selection?.shots?.count ?? "-" },
  ];

  return (
    <div className="flex w-full flex-col gap-12 px-8 text-slate-900">
      <DashboardSwitcher
        title="Shot charts tuned for quick reads"
        description="Select a player and season, then glide through the spatial story behind their scoring."
      />

        <FloatingCard
          tone="light"
          title="Player shot data"
          titleSize="text-lg"
          body="Pick your player-season pairing to load every field goal attempt, then hover dots for 2PT or 3PT context."
          bodySize="text-sm"
          wrapChildren={false}
        >
          <div className="mt-8 rounded-[26px] bg-white/90 p-6 shadow-[0_20px_60px_-46px rgba(15,23,42,0.35)]">
            <PlayerSeasonPicker
              defaultSeason="2024-25"
              autoFetchShots={true}
              onComplete={(sel) => {
                setSelection(sel ?? null);
              }}
            />
          </div>
        </FloatingCard>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <FloatingCard
            tone="light"
            className="lg:col-span-4"
            title="Quick summary"
            titleSize="text-lg"
            wrapChildren={false}
          >
            <ul className="mt-4 space-y-3 text-sm text-slate-600">
              {summaryItems.map((item) => (
                <li
                  key={item.label}
                  className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-[0_16px_42px_-28px rgba(15,23,42,0.22)]"
                >
                  <span className="text-xs uppercase tracking-[0.32em] text-slate-400">{item.label}</span>
                  <span className="text-sm font-semibold text-slate-900">{item.value}</span>
                </li>
              ))}
            </ul>
          </FloatingCard>

          <FloatingCard
            tone="light"
            className="lg:col-span-8 flex flex-col items-center"
            wrapChildren={false}
          >
            <div className="w-full max-w-4xl">
              {selection?.shots?.shots?.length > 0 ? (
                <ShotChart
                  payload={selection.shots}
                  playerName={selection.player?.name}
                  seasonLabel={selection.season}
                />
              ) : (
                <div className="flex h-full min-h-[420px] flex-col items-center justify-center rounded-[26px] bg-white/90 text-center shadow-[0_20px_60px_-46px rgba(15,23,42,0.35)]">
                  <p className="text-sm font-medium text-slate-500">Select a player-season above to render the shot chart.</p>
                </div>
              )}
            </div>
          </FloatingCard>
        </section>

        {selection?.shots && (
          <FloatingCard tone="light" wrapChildren={false}>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-slate-900">
                Raw payload
                <span className="text-xs uppercase tracking-[0.3em] text-amber-500/80 transition-transform duration-200 group-open:rotate-90">
                  ▶
                </span>
              </summary>
              <pre className="mt-4 max-h-96 overflow-auto rounded-2xl bg-white px-4 py-3 text-xs text-slate-600 shadow-[0_16px_42px_-28px rgba(15,23,42,0.22)]">
{JSON.stringify(selection.shots, null, 2)}
              </pre>
            </details>
          </FloatingCard>
        )}
    </div>
  );
}
