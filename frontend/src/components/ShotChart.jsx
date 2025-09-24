// src/components/ShotChart.jsx
import { useMemo } from "react";

/**
 * Expects props.shots in the format you posted:
 * {
 *   count, measure, playerId, season,
 *   shots: [{ x, y, made, shot_type, ... }, ...]
 * }
 *
 * Coordinates are NBA-style (x ~ [-250,250], y ~ [0,~470]). If your backend
 * provides a smaller range (e.g. ~[-120,120] x [0,240]), the scaling below
 * still works because we map to the standard domain.
 */
export default function ShotChart({
  data,                 // the whole payload (with .shots array)
  measure = "FGA",      // FGA | FGM | FG3A | FG3M | PTS
  width = 500,
  height = 470,
  showLegend = true,
}) {
  const margin = 10;
  const courtW = width - margin * 2;
  const courtH = height - margin * 2;

  // Standard NBA half-court logical domain
  const X_MIN = -250, X_MAX = 250;
  const Y_MIN = 0,    Y_MAX = 470;

  const sx = (x) => margin + ((x - X_MIN) / (X_MAX - X_MIN)) * courtW;
  const sy = (y) => margin + courtH - ((y - Y_MIN) / (Y_MAX - Y_MIN)) * courtH; // invert Y

  const points = useMemo(() => {
    if (!data?.shots) return [];

    const isThree = (s) => (s.shot_type || "").toLowerCase().includes("3pt");
    const eligible = data.shots.filter((s) => {
      switch (measure) {
        case "FGA":  return true;                         // all attempts
        case "FGM":  return s.made === 1;                 // makes only
        case "FG3A": return isThree(s);                   // 3PA
        case "FG3M": return isThree(s) && s.made === 1;   // 3PM
        case "PTS":  return s.made === 1;                 // plot makes; size by 2/3
        default:     return true;
      }
    });

    return eligible.map((s) => {
      const three = isThree(s);
      const points = three ? 3 : 2;
      return {
        ...s,
        cx: sx(s.x),
        cy: sy(s.y),
        r:
          measure === "PTS"
            ? 3 + (points === 3 ? 2.5 : 1.5) // size 3PT > 2PT
            : s.made === 1
              ? 3.5
              : 2.5,
        fill:
          s.made === 1
            ? "rgb(34 197 94)" // green-500
            : "rgb(239 68 68)", // red-500
        opacity: measure === "FGM" || measure === "FG3M" ? 0.9 : 0.65,
      };
    });
  }, [data, measure]);

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="mb-3 text-sm text-gray-600">
        {data?.playerName ? `${data.playerName} - ` : ""}
        {data?.season ?? ""} {measure} ({points.length}
        {measure === "FGA" || measure === "FG3A" ? " attempts" : " shots"})
      </div>

      <svg width={width} height={height} className="w-full h-auto">
        {/* Court: outer (half-court) */}
        <CourtHalfSVG sx={sx} sy={sy} />

        {/* Shots */}
        <g>
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.cx}
              cy={p.cy}
              r={p.r}
              fill={p.fill}
              opacity={p.opacity}
            >
              <title>
                {`${p.shot_type} - ${p.made ? "MAKE" : "MISS"} . ${p.shot_distance} ft . P${p.period} ${p.minutes_remaining}:${String(p.seconds_remaining).padStart(2,"0")}`}
              </title>
            </circle>
          ))}
        </g>
      </svg>

      {showLegend && (
        <div className="mt-3 flex items-center gap-4 text-sm">
          <LegendSwatch color="rgb(34 197 94)" label="Make" />
          <LegendSwatch color="rgb(239 68 68)" label="Miss" />
          {measure === "PTS" && <span className="text-gray-500">. Dot size proportional to points (3&gt;2)</span>}
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
        style={{ width: 10, height: 10, backgroundColor: color }}
      />
      <span className="text-gray-700">{label}</span>
    </span>
  );
}

/** Minimal but clean half-court drawing (NBA dimensions approximated) */
function CourtHalfSVG({ sx, sy }) {
  // Fixed radii/widths in logical units
  const hoopR = 7.5;
  const backboardY = 40;
  const paintW = 160, paintH = 190;
  const ftCircleR = 60;
  const arcR = 237.5;
  const cornerThreeX = 220;
  const cornerThreeY = 140;

  // Helper to make an arc path (centered on hoop at (0,0), from left to right)
  const arcPath = () => {
    const r = arcR;
    const start = { x: -cornerThreeX, y: cornerThreeY };
    const end   = { x: cornerThreeX,  y: cornerThreeY };
    const largeArcFlag = 0, sweepFlag = 1;
    return [
      `M ${sx(start.x)} ${sy(start.y)}`,
      `A ${r} ${r} 0 ${largeArcFlag} ${sweepFlag} ${sx(end.x)} ${sy(end.y)}`
    ].join(" ");
  };

  return (
    <g>
      {/* Baseline / outer half-court (top border not drawn for clean look) */}
      <rect
        x={sx(-250)} y={sy(0)}
        width={sx(250) - sx(-250)}
        height={sy(470) - sy(0)}
        fill="none"
        stroke="#94a3b8"
        strokeWidth={1}
      />

      {/* Hoop */}
      <circle cx={sx(0)} cy={sy(0)} r={7.5} fill="none" stroke="#94a3b8" strokeWidth={1.5} />

      {/* Backboard */}
      <line
        x1={sx(-30)} y1={sy(backboardY)}
        x2={sx(30)}  y2={sy(backboardY)}
        stroke="#94a3b8" strokeWidth={2}
      />

      {/* Paint / Lane */}
      <rect
        x={sx(-paintW/2)} y={sy(paintH)}
        width={sx(paintW/2) - sx(-paintW/2)}
        height={sy(0) - sy(paintH)}
        fill="none" stroke="#94a3b8" strokeWidth={1}
      />

      {/* Free-throw circle (top half solid) */}
      <path
        d={describeCircleArc(sx, sy, 0, paintH, ftCircleR, Math.PI, 0)}
        fill="none" stroke="#94a3b8" strokeWidth={1}
      />
      {/* Free-throw circle (bottom half dashed) */}
      <path
        d={describeCircleArc(sx, sy, 0, paintH, ftCircleR, 0, Math.PI)}
        fill="none" stroke="#94a3b8" strokeWidth={1} strokeDasharray="4 4"
      />

      {/* Corner threes */}
      <line x1={sx(-cornerThreeX)} y1={sy(0)} x2={sx(-cornerThreeX)} y2={sy(cornerThreeY)} stroke="#94a3b8" />
      <line x1={sx(cornerThreeX)}  y1={sy(0)} x2={sx(cornerThreeX)}  y2={sy(cornerThreeY)}  stroke="#94a3b8" />

      {/* 3PT arc */}
      <path d={arcPath()} fill="none" stroke="#94a3b8" />
    </g>
  );
}

function describeCircleArc(sx, sy, cx, cy, r, startAngle, endAngle) {
  // Convert polar to logical cartesian then scale to SVG
  const p = (ang) => ({
    x: cx + r * Math.cos(ang),
    y: cy + r * Math.sin(ang),
  });
  const s = p(startAngle), e = p(endAngle);
  const largeArc = Math.abs(endAngle - startAngle) > Math.PI ? 1 : 0;
  const sweep = endAngle > startAngle ? 1 : 0;
  return [
    `M ${sx(s.x)} ${sy(s.y)}`,
    `A ${r} ${r} 0 ${largeArc} ${sweep} ${sx(e.x)} ${sy(e.y)}`
  ].join(" ");
}
