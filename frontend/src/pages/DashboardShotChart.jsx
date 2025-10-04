import { useState } from "react";
import DashboardSwitcher from "../components/DashboardSwitcher";
import FloatingCard from "../components/FloatingCard";
import PlayerSeasonPicker from "../components/PlayerSeasonPicker";
import ShotChart from "../components/ShotChart";

export default function DashboardShotChart() {
  const [selection, setSelection] = useState(null); // { player, season, shots }
  const [measure, setMeasure] = useState("FGA"); // FGA | FGM | FG3A | FG3M | PTS

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
          body="Pick your player-season pairing and choose the metric that sets the tone for the chart below."
          bodySize="text-sm"
          wrapChildren={false}
        >
          <div className="mt-6 flex justify-start md:justify-end">
            <label className="flex items-center gap-3 rounded-full bg-white px-4 py-2 text-xs font-medium text-slate-600 shadow-[0_12px_32px_-24px rgba(15,23,42,0.25)]">
              <span className="uppercase tracking-[0.3em] text-amber-500/80">Measure</span>
              <select
                className="appearance-none bg-transparent text-sm font-semibold text-slate-900 focus:outline-none"
                value={measure}
                onChange={(e) => setMeasure(e.target.value)}
              >
                <option value="FGA">FGA (Attempts)</option>
                <option value="FGM">FGM (Makes)</option>
                <option value="FG3A">FG3A (3PA)</option>
                <option value="FG3M">FG3M (3PM)</option>
                <option value="PTS">PTS</option>
              </select>
            </label>
          </div>

          <div className="mt-8 rounded-[26px] bg-white/90 p-6 shadow-[0_20px_60px_-46px rgba(15,23,42,0.35)]">
            <PlayerSeasonPicker
              defaultSeason="2024-25"
              autoFetchShots={true}
              measure={measure}
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

          <FloatingCard tone="light" className="lg:col-span-8" wrapChildren={false}>
            {selection?.shots?.shots?.length > 0 ? (
              <ShotChart
                payload={selection.shots}
                measure={measure}
                playerName={selection.player?.name}
                seasonLabel={selection.season}
              />
            ) : (
              <div className="flex h-full min-h-[380px] flex-col items-center justify-center rounded-[26px] bg-white/90 text-center shadow-[0_20px_60px_-46px rgba(15,23,42,0.35)]">
                <p className="text-sm font-medium text-slate-500">Select a player-season above to render the shot chart.</p>
              </div>
            )}
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
