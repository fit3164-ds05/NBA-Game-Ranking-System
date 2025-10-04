// src/components/ShotChart.jsx
import { useMemo } from "react";

/**
 * Renders a half-court overlay with shot dots computed from the nba_api payload.
 * Expects `payload` matching backend/services/shotchart.get_player_shotchart.
 */
export default function ShotChart({
  payload,
  measure = "FGA",
  width = 540,
  height = 500,
  showLegend = true,
  playerName,
  seasonLabel,
}) {
  const margin = 12;
  const courtW = width - margin * 2;
  const courtH = height - margin * 2;

  // NBA half-court logical domain in inches
  const X_MIN = -250;
  const X_MAX = 250;
  const Y_MIN = 0;
  const Y_MAX = 470;

  const { sx, sy } = useMemo(() => {
    const sxLocal = (x) => margin + ((x - X_MIN) / (X_MAX - X_MIN)) * courtW;
    const syLocal = (y) => margin + courtH - ((y - Y_MIN) / (Y_MAX - Y_MIN)) * courtH;
    return { sx: sxLocal, sy: syLocal };
  }, [margin, courtH, courtW]);

  const shots = payload?.shots ?? [];

  const points = useMemo(() => {
    if (!shots.length) return [];
    const isThree = (s) => (s.shot_type || "").toLowerCase().includes("3pt");

    const eligible = shots.filter((s) => {
      switch (measure) {
        case "FGA":
          return true;
        case "FGM":
          return s.made === 1;
        case "FG3A":
          return isThree(s);
        case "FG3M":
          return isThree(s) && s.made === 1;
        case "PTS":
          return s.made === 1;
        default:
          return true;
      }
    });

    return eligible.map((s) => {
      const three = isThree(s);
      const value = three ? 3 : 2;
      return {
        ...s,
        cx: sx(s.x),
        cy: sy(s.y),
        r:
          measure === "PTS"
            ? 3 + (value === 3 ? 3 : 2)
            : s.made === 1
              ? 3.7
              : 2.6,
        fill: s.made === 1 ? "rgb(34 197 94)" : "rgb(239 68 68)",
        opacity: measure === "FGM" || measure === "FG3M" ? 0.9 : 0.65,
        stroke: "#0f172a",
        strokeWidth: s.made === 1 ? 0.8 : 0.4,
      };
    });
  }, [shots, measure, sx, sy]);

  const summary = useMemo(() => {
    if (!shots.length) return null;

    const attemptCount = shots.length;
    let makeCount = 0;
    let threeAtt = 0;
    let threeMakes = 0;
    let distanceAccumulator = 0;

    const zoneTally = new Map();
    const periodTally = new Map();

    shots.forEach((shot) => {
      const made = shot.made === 1;
      const isThree = (shot.shot_type || "").toLowerCase().includes("3pt");

      if (made) makeCount += 1;
      if (isThree) {
        threeAtt += 1;
        if (made) threeMakes += 1;
      }

      const dist = Number(shot.shot_distance);
      if (!Number.isNaN(dist)) {
        distanceAccumulator += dist;
      }

      const zoneKey = shot.zone_basic || "Unknown";
      const zoneEntry = zoneTally.get(zoneKey) ?? { zone: zoneKey, attempts: 0, makes: 0 };
      zoneEntry.attempts += 1;
      if (made) zoneEntry.makes += 1;
      zoneTally.set(zoneKey, zoneEntry);

      const periodKey = typeof shot.period === "number" && shot.period > 0 ? shot.period : "?";
      const periodEntry = periodTally.get(periodKey) ?? { period: periodKey, attempts: 0, makes: 0 };
      periodEntry.attempts += 1;
      if (made) periodEntry.makes += 1;
      periodTally.set(periodKey, periodEntry);
    });

    const twoAtt = attemptCount - threeAtt;
    const twoMakes = makeCount - threeMakes;
    const toPct = (makes, attempts) => (attempts ? makes / attempts : null);

    return {
      attempts: attemptCount,
      makes: makeCount,
      misses: attemptCount - makeCount,
      fgPct: toPct(makeCount, attemptCount),
      threeAtt,
      threeMakes,
      threePct: toPct(threeMakes, threeAtt),
      twoAtt,
      twoMakes,
      twoPct: toPct(twoMakes, twoAtt),
      avgDistance: attemptCount ? distanceAccumulator / attemptCount : null,
      zones: Array.from(zoneTally.values()).sort((a, b) => b.attempts - a.attempts),
      periods: Array.from(periodTally.values()).sort((a, b) => {
        if (a.period === "?" && b.period === "?") return 0;
        if (a.period === "?") return 1;
        if (b.period === "?") return -1;
        return a.period - b.period;
      }),
    };
  }, [shots]);

  const effectivePlayer = playerName ?? payload?.playerName ?? (payload?.playerId ? `Player ${payload.playerId}` : undefined);
  const effectiveSeason = seasonLabel ?? payload?.season;

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="mb-3 text-sm text-gray-600">
        {effectivePlayer ? `${effectivePlayer} - ` : ""}
        {effectiveSeason ?? ""} {measure} ({points.length}
        {measure === "FGA" || measure === "FG3A" ? " attempts" : " shots"})
      </div>

      {summary && (
        <div className="mb-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryStat
              label="Field Goals"
              primary={`${summary.makes}/${summary.attempts}`}
              secondary={`${formatPct(summary.fgPct)} FG%`}
            />
            <SummaryStat
              label="3PT"
              primary={`${summary.threeMakes}/${summary.threeAtt}`}
              secondary={`${formatPct(summary.threePct)} 3P%`}
            />
            <SummaryStat
              label="2PT"
              primary={`${summary.twoMakes}/${summary.twoAtt}`}
              secondary={`${formatPct(summary.twoPct)} 2P%`}
            />
            <SummaryStat
              label="Avg Distance"
              primary={summary.avgDistance !== null ? `${summary.avgDistance.toFixed(1)} ft` : "-"}
              secondary={`${summary.misses} misses`}
            />
          </div>

          {summary.zones.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Shot Zones
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
                      const volume = zone.attempts / summary.attempts;
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

          {summary.periods.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Shots by Period
              </h3>
              <div className="space-y-2 text-xs">
                {summary.periods.map((period) => {
                  const pct = period.attempts ? period.makes / period.attempts : null;
                  const volume = period.attempts / summary.attempts;
                  const label = period.period === "?" ? "Unknown" : `Q${period.period}`;
                  return (
                    <div key={label} className="flex items-center gap-3 text-slate-700">
                      <span className="w-14 shrink-0 text-slate-500">{label}</span>
                      <div className="h-2 flex-1 rounded bg-slate-200">
                        <div
                          className="h-2 rounded bg-amber-400"
                          style={{ width: `${Math.max(volume * 100, 4)}%` }}
                        />
                      </div>
                      <span className="shrink-0 tabular-nums text-slate-600">
                        {`${period.makes}/${period.attempts}`} · {formatPct(pct)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <svg width={width} height={height} className="w-full h-auto">
        <defs>
          <linearGradient id="court-floor" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f9e4ba" />
            <stop offset="100%" stopColor="#f0d19c" />
          </linearGradient>
        </defs>

        <CourtHalfSVG sx={sx} sy={sy} />

        <g>
          {points.map((p, i) => (
            <circle
              key={`${p.game_id}-${p.game_event_id}-${i}`}
              cx={p.cx}
              cy={p.cy}
              r={p.r}
              fill={p.fill}
              opacity={p.opacity}
              stroke={p.stroke}
              strokeWidth={p.strokeWidth}
            >
              <title>
                {`${p.shot_type} - ${p.made ? "MAKE" : "MISS"} · ${p.shot_distance} ft · P${p.period} ${p.minutes_remaining}:${String(p.seconds_remaining).padStart(2, "0")}`}
              </title>
            </circle>
          ))}
        </g>
      </svg>

      {showLegend && (
        <div className="mt-3 flex items-center gap-4 text-sm">
          <LegendSwatch color="rgb(34 197 94)" label="Make" />
          <LegendSwatch color="rgb(239 68 68)" label="Miss" />
          {measure === "PTS" && <span className="text-gray-500">· Dot size proportional to points (3&gt;2)</span>}
        </div>
      )}
    </div>
  );
}

function LegendSwatch({ color, label }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="inline-block rounded-full"
        style={{ width: 12, height: 12, backgroundColor: color }}
      />
      <span className="text-gray-700">{label}</span>
    </span>
  );
}

function CourtHalfSVG({ sx, sy }) {
  const backboardY = 40;
  const paintW = 160;
  const paintH = 190;
  const ftCircleR = 60;
  const arcR = 237.5;
  const cornerThreeX = 220;
  const cornerThreeY = 140;

  const baseX = sx(-250);
  const baseY = sy(470);
  const courtWidth = sx(250) - sx(-250);
  const courtHeight = sy(0) - sy(470);

  const arcPath = () => {
    const r = arcR;
    const start = { x: -cornerThreeX, y: cornerThreeY };
    const end = { x: cornerThreeX, y: cornerThreeY };
    return [
      `M ${sx(start.x)} ${sy(start.y)}`,
      `A ${r} ${r} 0 0 1 ${sx(end.x)} ${sy(end.y)}`,
    ].join(" ");
  };

  return (
    <g>
      <rect
        x={baseX}
        y={baseY}
        width={courtWidth}
        height={courtHeight}
        fill="url(#court-floor)"
        stroke="#d4a76a"
        strokeWidth={2}
        rx={14}
      />

      <rect
        x={sx(-paintW / 2)}
        y={sy(paintH)}
        width={sx(paintW / 2) - sx(-paintW / 2)}
        height={sy(0) - sy(paintH)}
        fill="rgba(239, 68, 68, 0.08)"
        stroke="#d97706"
        strokeWidth={1.4}
      />

      <path
        d={describeCircleArc(sx, sy, 0, 0, 40, Math.PI, 0)}
        fill="rgba(249, 115, 22, 0.12)"
        stroke="#fb923c"
        strokeWidth={1.1}
      />

      <circle cx={sx(0)} cy={sy(0)} r={7.5} fill="none" stroke="#f97316" strokeWidth={1.5} />

      <line
        x1={sx(-30)}
        y1={sy(backboardY)}
        x2={sx(30)}
        y2={sy(backboardY)}
        stroke="#1f2937"
        strokeWidth={2}
      />

      <path d={describeCircleArc(sx, sy, 0, paintH, ftCircleR, Math.PI, 0)} fill="none" stroke="#1f2937" strokeWidth={1.2} />
      <path
        d={describeCircleArc(sx, sy, 0, paintH, ftCircleR, 0, Math.PI)}
        fill="none"
        stroke="#1f2937"
        strokeWidth={1.2}
        strokeDasharray="5 4"
      />

      <line x1={sx(-cornerThreeX)} y1={sy(0)} x2={sx(-cornerThreeX)} y2={sy(cornerThreeY)} stroke="#1f2937" strokeWidth={1.1} />
      <line x1={sx(cornerThreeX)} y1={sy(0)} x2={sx(cornerThreeX)} y2={sy(cornerThreeY)} stroke="#1f2937" strokeWidth={1.1} />

      <path d={arcPath()} fill="none" stroke="#1f2937" strokeWidth={1.2} />

      <line x1={sx(-80)} y1={sy(138)} x2={sx(80)} y2={sy(138)} stroke="#b45309" strokeWidth={0.9} strokeDasharray="6 6" />
      <line x1={sx(-80)} y1={sy(88)} x2={sx(80)} y2={sy(88)} stroke="#b45309" strokeWidth={0.9} strokeDasharray="6 6" />
    </g>
  );
}

function describeCircleArc(sx, sy, cx, cy, r, startAngle, endAngle) {
  const point = (angle) => ({
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  });
  const s = point(startAngle);
  const e = point(endAngle);
  const largeArc = Math.abs(endAngle - startAngle) > Math.PI ? 1 : 0;
  const sweep = endAngle > startAngle ? 1 : 0;
  return [
    `M ${sx(s.x)} ${sy(s.y)}`,
    `A ${r} ${r} 0 ${largeArc} ${sweep} ${sx(e.x)} ${sy(e.y)}`,
  ].join(" ");
}

function SummaryStat({ label, primary, secondary }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-800">{primary}</div>
      <div className="text-xs text-slate-500">{secondary}</div>
    </div>
  );
}

function formatPct(value) {
  if (value === null || value === undefined) return "-";
  return `${(value * 100).toFixed(1)}%`;
}
