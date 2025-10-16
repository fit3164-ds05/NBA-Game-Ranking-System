import { useEffect, useMemo, useRef, useState } from "react";

const COURT_WIDTH_FT = 50;
const DEFAULT_COURT_LENGTH_HALF_FT = 47;
const DEFAULT_THREE_POINT_RADIUS_FT = 23.75;
const DEFAULT_BASKET_PROTRUSION_FT = 4;
const DEFAULT_BASKET_DIAMETER_FT = 1.5;
const NBA_UNITS_PER_FOOT = 10;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function resolveGeometry(options) {
  const courtWidthFt = Number(options?.courtWidth) || COURT_WIDTH_FT;
  const courtLengthHalfFt =
    options?.courtLength != null && Number.isFinite(Number(options.courtLength))
      ? Number(options.courtLength) / 2
      : DEFAULT_COURT_LENGTH_HALF_FT;
  const threePointRadiusFt =
    options?.threePointRadius != null && Number.isFinite(Number(options.threePointRadius))
      ? Number(options.threePointRadius)
      : DEFAULT_THREE_POINT_RADIUS_FT;
  const basketProtrusionFt =
    options?.basketProtrusionLength != null &&
    Number.isFinite(Number(options.basketProtrusionLength))
      ? Number(options.basketProtrusionLength)
      : DEFAULT_BASKET_PROTRUSION_FT;
  const basketDiameterFt =
    options?.basketDiameter != null && Number.isFinite(Number(options.basketDiameter))
      ? Number(options.basketDiameter)
      : DEFAULT_BASKET_DIAMETER_FT;

  const visibleCourtLengthFt =
    threePointRadiusFt +
    basketProtrusionFt +
    (courtLengthHalfFt - (threePointRadiusFt + basketProtrusionFt)) / 2;

  const hoopCenterY = visibleCourtLengthFt - (basketProtrusionFt + basketDiameterFt / 2);

  return {
    courtWidthFt,
    visibleCourtLengthFt,
    hoopCenterY,
  };
}

const DEFAULT_GEOMETRY = resolveGeometry();

function nbaToChartUnits(rawX, rawY, geometry = DEFAULT_GEOMETRY) {
  const x = Number(rawX);
  const y = Number(rawY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const { courtWidthFt, visibleCourtLengthFt, hoopCenterY } = geometry;

  const xFeet = x / NBA_UNITS_PER_FOOT;
  const yFeetFromHoop = Math.abs(y) / NBA_UNITS_PER_FOOT;
  const baselineOffset = visibleCourtLengthFt - hoopCenterY;

  const chartX = clamp(courtWidthFt / 2 + xFeet, 0, courtWidthFt);
  const chartY = clamp(baselineOffset + yFeetFromHoop, 0, visibleCourtLengthFt);
  return { x: chartX, y: chartY };
}

function normalizeShots(rows, coordSystem, geometryOptions) {
  const geometry = resolveGeometry(geometryOptions);
  const { courtWidthFt, visibleCourtLengthFt } = geometry;

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
        const converted = nbaToChartUnits(x, y, geometry);
        if (!converted) return null;
        x = converted.x;
        y = converted.y;
      }

      x = clamp(x, 0, courtWidthFt);
      y = clamp(y, 0, visibleCourtLengthFt);

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
  options,
  className,
  emptyMessage = "No shot data available.",
  missingScriptsMessage = "Shot chart scripts failed to load.",
}) {
  const containerRef = useRef(null);
  const [status, setStatus] = useState({ type: "idle", message: null });

  const chartOptions = useMemo(() => {
    const base = { legendBaselineOffset: 0.5, ...(options ?? {}) };
    base.width = width;
    if (height) base.height = height;
    return base;
  }, [options, width, height]);

  const shots = useMemo(
    () => normalizeShots(data, coordSystem, chartOptions),
    [data, coordSystem, chartOptions],
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

    let hideTimer = null;

    try {
      const svg = d3.select(host).append("svg");
      svg
        .style("display", "block")
        .style("margin", "0 auto")
        .style("overflow", "visible");
      const chart = svg.chart("BasketballShotChart", chartOptions);
      chart.draw(shots);

      // Tooltip container
      const tip = document.createElement("div");
      tip.className = "shotchart-tooltip";
      Object.assign(tip.style, {
        position: "absolute",
        pointerEvents: "none",
        background: "rgba(15,23,42,0.94)",
        color: "#f8fafc",
        padding: "10px 12px",
        borderRadius: "10px",
        fontSize: "12px",
        lineHeight: 1.3,
        boxShadow: "0 12px 30px -20px rgba(15,23,42,0.65)",
        opacity: "0",
        transition: "opacity .12s ease, transform .12s ease",
        transform: "translate3d(0,-4px,0)",
        maxWidth: "240px",
        zIndex: 10,
      });
      host.style.position = "relative";
      host.appendChild(tip);

      const pointsFromDatum = (datum) => {
        if (Array.isArray(datum)) return datum;
        if (Array.isArray(datum?.points)) return datum.points;
        return [];
      };

      const computeStats = (datum) => {
        const points = pointsFromDatum(datum);

        const attempts = Number.isFinite(datum?.attempts)
          ? datum.attempts
          : points.reduce(
              (sum, shot) => sum + (Number.isFinite(shot?.attempts) ? shot.attempts : 1),
              0,
            );

        const made = Number.isFinite(datum?.made)
          ? datum.made
          : points.reduce((sum, shot) => sum + (shot?.made ? 1 : 0), 0);

        const success = attempts > 0 ? `${((made / attempts) * 100).toFixed(1)}%` : "-";

        const typeSet = new Set();
        points.forEach((shot) => {
          const type = shot?.raw?.action_type ?? shot?.raw?.ACTION_TYPE;
          if (type) typeSet.add(type);
        });

        const types = typeSet.size ? Array.from(typeSet).join(" • ") : "-";

        const distances = points
          .map((shot) => Number(shot?.raw?.shot_distance ?? shot?.raw?.SHOT_DISTANCE))
          .filter((value) => Number.isFinite(value));
        const averageDistance = distances.length
          ? `${(distances.reduce((sum, value) => sum + value, 0) / distances.length).toFixed(1)} ft`
          : "-";

        return {
          attempts: attempts ?? "-",
          made: made ?? "-",
          success,
          types,
          averageDistance,
        };
      };

      const moveTip = (event) => {
        if (!event) return;
        const point = event.touches?.[0] ?? event.changedTouches?.[0] ?? event;
        if (!point) return;
        const rect = host.getBoundingClientRect();
        const x = point.clientX - rect.left + 16;
        const y = point.clientY - rect.top + 16;
        tip.style.left = `${x}px`;
        tip.style.top = `${y}px`;
      };

      const showTip = (event, datum) => {
        if (hideTimer) {
          clearTimeout(hideTimer);
          hideTimer = null;
        }
        const stats = computeStats(datum);
        const rows = [
          { label: "Shots taken in this area", value: stats.attempts },
          { label: "Shots made in this area", value: stats.made },
          { label: "% success in this area", value: stats.success },
          { label: "Shot types in this area", value: stats.types },
          { label: "Average distance from this area", value: stats.averageDistance },
        ];

        tip.innerHTML = rows
          .map(
            (row) =>
              `<div><span style="color:#94a3b8;">${row.label}:</span> <span style="color:#f8fafc;">${row.value}</span></div>`,
          )
          .join("");

        tip.style.opacity = "1";
        tip.style.transform = "translate3d(0,0,0)";
        moveTip(event);
      };

      const hideTip = ({ immediate = false } = {}) => {
        if (hideTimer) {
          clearTimeout(hideTimer);
          hideTimer = null;
        }
        const applyHide = () => {
          tip.style.opacity = "0";
          tip.style.transform = "translate3d(0,-6px,0)";
        };
        if (immediate) {
          applyHide();
        } else {
          hideTimer = window.setTimeout(applyHide, 160);
        }
      };

      const attachTooltipHandlers = () => {
        const hexagons = svg.selectAll(".shot-chart-hexagon");
        if (!hexagons.size()) return false;

        const showFromEvent = (datum) => {
          const evt = d3.event;
          if (!evt) return;
          showTip(evt, datum);
        };

        const moveFromEvent = () => {
          const evt = d3.event;
          if (!evt) return;
          moveTip(evt);
        };

        const hideWithDelay = () => hideTip();
        const hideImmediate = () => hideTip({ immediate: true });

        hexagons
          .on("mouseover.shotchart-tooltip", function (datum) {
            showFromEvent(datum);
          })
          .on("mousemove.shotchart-tooltip", moveFromEvent)
          .on("mouseout.shotchart-tooltip", hideWithDelay)
          .on("touchstart.shotchart-tooltip", function (datum) {
            const evt = d3.event;
            if (evt?.preventDefault) evt.preventDefault();
            showFromEvent(datum);
          })
          .on("touchmove.shotchart-tooltip", moveFromEvent)
          .on("touchend.shotchart-tooltip", hideImmediate)
          .on("touchcancel.shotchart-tooltip", hideImmediate);

        return true;
      };

      if (!attachTooltipHandlers()) {
        window.requestAnimationFrame(attachTooltipHandlers);
      }

      svg.on("mouseleave.shotchart-tooltip", () => hideTip({ immediate: true }));

      setStatus({ type: "ready", message: null });
    } catch (err) {
      console.error("Failed to initialize BasketballShotChart", err);
      host.innerHTML = "";
      setStatus({ type: "error", message: missingScriptsMessage });
    }

    return () => {
      if (hideTimer) clearTimeout(hideTimer);
      host.innerHTML = "";
    };
  }, [shots, chartOptions, missingScriptsMessage, emptyMessage]);

  const renderOverlay = status.type !== "ready";

  const containerStyle = {
    position: "relative",
    minHeight: "420px",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "64px 0 24px",
    boxSizing: "border-box",
  };

  const hostStyle = {
    position: "relative",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    width: "100%",
    overflow: "visible",
  };

  return (
    <div className={className} style={containerStyle}>
      <div ref={containerRef} style={hostStyle} />
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
