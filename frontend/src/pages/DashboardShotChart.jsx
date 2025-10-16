import { useMemo, useState } from "react";
import DashboardSwitcher from "../components/DashboardSwitcher";
import FloatingCard from "../components/FloatingCard";
import PlayerSeasonPicker from "../components/PlayerSeasonPicker";
import ShotChartD3 from "../components/ShotChartD3";
import { computeShotSummary, formatPct } from "../lib/shotSummary";

const PERIOD_COLORS = [
  "#075985",
  "#0ea5e9",
  "#22d3ee",
  "#0f766e",
  "#34d399",
  "#f97316",
  "#facc15",
  "#a855f7",
  "#f472b6",
];

export default function DashboardShotChart() {
  const [selection, setSelection] = useState(null); // { player, season, shots }

  const shotPayload = selection?.shots;
  const chartShots = shotPayload?.shots ?? [];
  const summary = useMemo(() => computeShotSummary(chartShots), [chartShots]);
  const periodBreakdown = useMemo(() => {
    if (!Array.isArray(chartShots) || chartShots.length === 0) return [];

    const totals = new Map();

    chartShots.forEach((shot) => {
      const rawPeriod = shot?.period ?? shot?.PERIOD;
      const periodNumber = Number(rawPeriod);
      const key =
        Number.isFinite(periodNumber) && periodNumber > 0 ? periodNumber : "unknown";

      const madeFlag =
        shot?.made ??
        shot?.SHOT_MADE_FLAG ??
        shot?.shot_made_flag ??
        shot?.SHOT_MADE ??
        shot?.made_flag;

      const entry = totals.get(key) ?? { attempts: 0, makes: 0 };
      entry.attempts += 1;
      if (Number(madeFlag) === 1) entry.makes += 1;
      totals.set(key, entry);
    });

    const formatLabel = (key) => {
      if (key === "unknown") return "Unknown";
      if (key <= 4) return `Q${key}`;
      const otIndex = key - 4;
      return otIndex === 1 ? "OT" : `OT${otIndex}`;
    };

    const sorted = Array.from(totals.entries()).sort((a, b) => {
      const [keyA] = a;
      const [keyB] = b;
      if (keyA === "unknown") return 1;
      if (keyB === "unknown") return -1;
      return keyA - keyB;
    });

    return sorted.map(([key, stats]) => {
      const attempts = stats.attempts;
      const makes = stats.makes;
      const fgPct = attempts > 0 ? makes / attempts : null;
      const ratio = attempts / chartShots.length;
      return {
        key,
        label: formatLabel(key),
        attempts,
        makes,
        fgPct,
        ratio,
      };
    });
  }, [chartShots]);
  const totalPeriodMakes = useMemo(
    () => periodBreakdown.reduce((sum, period) => sum + period.makes, 0),
    [periodBreakdown],
  );

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
        title="Shot charts tuned for exploration"
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
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Shot Overview
                    </h3>
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
                    // secondary={`${summary.misses} misses`}
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
                                    <span className="tabular-nums text-slate-600">{formatPct(volume)}</span>
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
            className="lg:col-span-8 flex-col items-center"
            wrapChildren={false}
          >
            <div className="w-full max-w-4xl">
              {chartShots.length > 0 ? (
                <div className="rounded-[10px] bg-white/90 px-4 pt-4 pb-4 shadow-[0_20px_60px_-46px rgba(15,23,42,0.35)]">
                  <ShotChartD3
                    data={chartShots}
                    coordSystem="nba"
                    width={720}
                    height={500}
                    className="bg-white"
                    options={{
                      legendOffsetY: 5,
                      legendViewBoxPadding: 10,
                      legendPaddingBottom: 10,
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
          <>
            {periodBreakdown.length > 0 ? (
              <FloatingCard
                tone="light"
                title="Shot distribution by period"
                titleSize="text-lg"
                wrapChildren={false}
              >
                <div className="mt-4 space-y-5 text-sm text-slate-600">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
                      <span>Quarter scoring completeness</span>
                      <span>Total makes: {totalPeriodMakes || "0"}</span>
                    </div>
                    <div className="space-y-2">
                      {periodBreakdown.map((period, index) => {
                        const color = PERIOD_COLORS[index % PERIOD_COLORS.length];
                        const scoreRatio =
                          totalPeriodMakes > 0
                            ? period.makes / totalPeriodMakes
                            : period.attempts / chartShots.length;
                        const fillPercent = Math.min(100, Math.max(0, scoreRatio * 100));
                        return (
                          <div key={period.label}>
                            <div className="flex items-center justify-between text-xs text-slate-500">
                              <span className="flex items-center gap-2">
                                <span
                                  className="inline-block h-2.5 w-2.5 rounded-full"
                                  style={{ backgroundColor: color }}
                                  aria-hidden="true"
                                />
                                {period.label}
                              </span>
                              <span className="tabular-nums text-slate-600">
                                {formatPct(scoreRatio)}
                              </span>
                            </div>
                            <div className="relative mt-1 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                              <div
                                className="absolute inset-y-0 left-0 rounded-full transition-all duration-300"
                                style={{
                                  width: `${fillPercent}%`,
                                  backgroundColor: color,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="overflow-hidden rounded border text-xs">
                    <table className="min-w-full divide-y divide-slate-200 text-left">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">Period</th>
                          <th className="px-3 py-2 font-medium">Shots</th>
                          <th className="px-3 py-2 font-medium">Makes</th>
                          <th className="px-3 py-2 font-medium">FG%</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {periodBreakdown.map((period) => (
                          <tr key={period.label}>
                            <td className="px-3 py-2">{period.label}</td>
                            <td className="px-3 py-2">{period.attempts}</td>
                            <td className="px-3 py-2">{period.makes}</td>
                            <td className="px-3 py-2">{formatPct(period.fgPct)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </FloatingCard>
            ) : null}

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
          </>
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
