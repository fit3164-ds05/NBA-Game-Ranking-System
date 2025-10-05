import { useMemo, useState } from "react";
import DashboardSwitcher from "../components/DashboardSwitcher";
import FloatingCard from "../components/FloatingCard";
import PlayerSeasonPicker from "../components/PlayerSeasonPicker";
import ShotChartD3 from "../components/ShotChartD3";
import { computeShotSummary, formatPct } from "../lib/shotSummary";

export default function DashboardShotChart() {
  const [selection, setSelection] = useState(null); // { player, season, shots }

  const shotPayload = selection?.shots;
  const chartShots = shotPayload?.shots ?? [];
  const summary = useMemo(() => computeShotSummary(chartShots), [chartShots]);

  const summaryItems = [
    { label: "Player", value: selection?.player?.name ?? "-" },
    {
      label: "Season",
      value: selection?.season ?? shotPayload?.season ?? "-",
    },
    {
      label: "Total shots",
      value:
        shotPayload?.count ?? (Array.isArray(chartShots) ? chartShots.length : "-"),
    },
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
            {summary ? (
              <div className="mt-4 space-y-6 text-sm text-slate-600">
                <div className="space-y-2">
                  <InfoRow label="Player" value={selection?.player?.name ?? "-"} />
                  <InfoRow label="Season" value={selection?.season ?? "-"} />
                  <InfoRow
                    label="Total shots"
                    value={summary?.attempts != null ? summary.attempts : "-"}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <QuickSummaryStat
                    label="Field Goals"
                    primary={`${summary.makes}/${summary.attempts}`}
                    secondary={`${formatPct(summary.fgPct)} FG%`}
                  />
                  <QuickSummaryStat
                    label="3PT"
                    primary={`${summary.threeMakes}/${summary.threeAtt}`}
                    secondary={`${formatPct(summary.threePct)} 3P%`}
                  />
                  <QuickSummaryStat
                    label="2PT"
                    primary={`${summary.twoMakes}/${summary.twoAtt}`}
                    secondary={`${formatPct(summary.twoPct)} 2P%`}
                  />
                  <QuickSummaryStat
                    label="Avg Distance"
                    primary={summary.avgDistance !== null ? `${summary.avgDistance.toFixed(1)} ft` : "-"}
                    secondary={`${summary.misses} misses`}
                  />
                </div>

                {summary.zones.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Shot zones (top 6)
                    </h3>
                    <div className="overflow-hidden rounded border text-xs">
                      <table className="min-w-full divide-y divide-slate-200 text-left">
                        <thead className="bg-slate-50 text-slate-500">
                          <tr>
                            <th className="px-3 py-2 font-medium">Zone</th>
                            <th className="px-3 py-2 font-medium">FG</th>
                            <th className="px-3 py-2 font-medium">FG%</th>
                            <th className="px-3 py-2 font-medium">Volume</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {summary.zones.slice(0, 6).map((zone) => {
                            const pct = zone.attempts ? zone.makes / zone.attempts : null;
                            const volume = summary.attempts ? zone.attempts / summary.attempts : 0;
                            return (
                              <tr key={zone.zone}>
                                <td className="px-3 py-2">{zone.zone}</td>
                                <td className="px-3 py-2">{`${zone.makes}/${zone.attempts}`}</td>
                                <td className="px-3 py-2">{formatPct(pct)}</td>
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-2">
                                    <div className="h-2 flex-1 rounded bg-slate-200">
                                      <div
                                        className="h-2 rounded bg-sky-400"
                                        style={{ width: `${Math.max(volume * 100, 4)}%` }}
                                      />
                                    </div>
                                    <span className="tabular-nums text-slate-500">{formatPct(volume)}</span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : (
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
            )}
          </FloatingCard>

          <FloatingCard
            tone="light"
            className="lg:col-span-8 flex flex-col items-center"
            wrapChildren={false}
          >
            <div className="w-full max-w-4xl">
              {chartShots.length > 0 ? (
                <div className="rounded-[26px] bg-white/90 p-4 shadow-[0_20px_60px_-46px rgba(15,23,42,0.35)]">
                  <ShotChartD3
                    data={chartShots}
                    coordSystem="nba"
                    width={720}
                    title={`${selection?.player?.name ?? ""} ${selection?.season ?? ""}`.trim()}
                    className="rounded-[26px] bg-white"
                    options={{
                      hexagonBinVisibleThreshold: 0,
                      hexagonRadiusThreshold: 0,
                    }}
                  />
                </div>
              ) : (
                <div className="flex h-full min-h-[420px] flex-col items-center justify-center rounded-[26px] bg-white/90 text-center shadow-[0_20px_60px_-46px rgba(15,23,42,0.35)]">
                  <p className="text-sm font-medium text-slate-500">Select a player-season above to render the shot chart.</p>
                </div>
              )}
            </div>
          </FloatingCard>
        </section>

        {shotPayload && (
          <FloatingCard tone="light" wrapChildren={false}>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-slate-900">
                Raw payload
                <span className="text-xs uppercase tracking-[0.3em] text-amber-500/80 transition-transform duration-200 group-open:rotate-90">
                  ▶
                </span>
              </summary>
              <pre className="mt-4 max-h-96 overflow-auto rounded-2xl bg-white px-4 py-3 text-xs text-slate-600 shadow-[0_16px_42px_-28px rgba(15,23,42,0.22)]">
{JSON.stringify(shotPayload, null, 2)}
              </pre>
            </details>
          </FloatingCard>
        )}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-[0_16px_42px_-28px rgba(15,23,42,0.22)]">
      <span className="text-xs uppercase tracking-[0.32em] text-slate-400">{label}</span>
      <span className="text-sm font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function QuickSummaryStat({ label, primary, secondary }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-800">{primary}</div>
      <div className="text-xs text-slate-500">{secondary}</div>
    </div>
  );
}
