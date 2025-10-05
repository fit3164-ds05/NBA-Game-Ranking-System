import { useEffect, useMemo, useRef, useState } from "react";

const COURT_WIDTH_FT = 50;
const VISIBLE_HALF_COURT_FT = 47; // plugin uses ~47 ft of the 94 ft court

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function nbaToChartUnits(rawX, rawY) {
  const x = Number(rawX);
  const y = Number(rawY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const chartX = clamp(((x + 250) / 500) * COURT_WIDTH_FT, 0, COURT_WIDTH_FT);
  const chartY = clamp((y / 470) * VISIBLE_HALF_COURT_FT, 0, VISIBLE_HALF_COURT_FT);
  return { x: chartX, y: chartY };
}

function normalizeShots(rows, coordSystem) {
  return (rows ?? [])
    .map((shot) => {
      let rawX = shot.x ?? shot.loc_x ?? shot.LOC_X;
      let rawY = shot.y ?? shot.loc_y ?? shot.LOC_Y;
      const attemptsRaw = Number(shot.attempts);
      const madeRaw = shot.made ?? shot.SHOT_MADE_FLAG ?? shot.shot_made_flag;

      if (rawX === undefined || rawY === undefined) return null;

      let x = Number(rawX);
      let y = Number(rawY);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

      if (coordSystem === "nba") {
        const converted = nbaToChartUnits(x, y);
        if (!converted) return null;
        x = converted.x;
        y = converted.y;
      }

      x = clamp(x, 0, COURT_WIDTH_FT);
      y = clamp(y, 0, VISIBLE_HALF_COURT_FT);

      return {
        x,
        y,
        made: Number(madeRaw) === 1 ? 1 : 0,
        attempts: Number.isFinite(attemptsRaw) && attemptsRaw > 0 ? attemptsRaw : 1,
        raw: shot,
      };
    })
    .filter(Boolean);
}

export default function ShotChartD3({
  data = [],
  coordSystem = "legacy",
  width = 640,
  height,
  title,
  options,
  className,
  emptyMessage = "No shot data available.",
  missingScriptsMessage = "Shot chart scripts failed to load.",
}) {
  const containerRef = useRef(null);
  const [status, setStatus] = useState({ type: "idle", message: null });

  const chartOptions = useMemo(() => {
    const base = { ...(options ?? {}) };
    base.width = width;
    if (height) base.height = height;
    if (title) base.title = title;
    return base;
  }, [options, width, height, title]);

  const shots = useMemo(
    () => normalizeShots(data, coordSystem),
    [data, coordSystem],
  );

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return undefined;

    const d3 = window?.d3;

    if (!d3?.select) {
      setStatus({ type: "error", message: missingScriptsMessage });
      host.innerHTML = "";
      return undefined;
    }

    if (typeof d3.select(document.createElement("svg")).chart !== "function") {
      setStatus({ type: "error", message: missingScriptsMessage });
      host.innerHTML = "";
      return undefined;
    }

    if (!shots.length) {
      setStatus({ type: "empty", message: emptyMessage });
      host.innerHTML = "";
      return undefined;
    }

    host.innerHTML = "";

    try {
      const svg = d3.select(host).append("svg");
      const chart = svg.chart("BasketballShotChart", chartOptions);
      chart.draw(shots);
      setStatus({ type: "ready", message: null });
    } catch (err) {
      console.error("Failed to initialize BasketballShotChart", err);
      host.innerHTML = "";
      setStatus({ type: "error", message: missingScriptsMessage });
    }

    return () => {
      host.innerHTML = "";
    };
  }, [shots, chartOptions, missingScriptsMessage, emptyMessage]);

  const renderOverlay = status.type !== "ready";

  const containerStyle = {
    position: "relative",
    minHeight: "420px",
  };

  return (
    <div className={className} style={containerStyle}>
      <div ref={containerRef} />
      {renderOverlay && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.5rem",
            textAlign: "center",
            color: status.type === "error" ? "#ef4444" : "#64748b",
            fontSize: "0.875rem",
          }}
        >
          {status.message}
        </div>
      )}
    </div>
  );
}
