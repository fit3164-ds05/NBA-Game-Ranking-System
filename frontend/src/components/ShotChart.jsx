import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { shotchart } from "d3-shotchart";

/**
 * shots = [
 *   { x: 25, y: 5, made: true, player: "Stephen Curry" },
 *   { x: -10, y: 15, made: false, player: "Stephen Curry" },
 *   ...
 * ]
 * Coordinates in feet, hoop at (0,0), +x right, +y away from hoop (NBA half court).
 */

export default function ShotChart({ shots = [], width = 520, height = 480 }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // wipe previous render
    d3.select(containerRef.current).selectAll("*").remove();

    // initialize chart
    const chart = shotchart()
      .width(width)
      .height(height)
      // simple symbol/colour mapping
      .shotRender((d) =>
        d3
          .symbol()
          .type(d.made ? d3.symbolCircle : d3.symbolCross)
          .size(55)()
      )
      .shotColor((d) => (d.made ? "#10b981" : "#ef4444"))   // teal = made, red = miss
      .courtColor("#f9fafb")
      .courtLineColor("#374151")
      .courtLineWidth(2);

    // render
    d3.select(containerRef.current).datum(shots).call(chart);
  }, [shots, width, height]);

  return (
    <div
      ref={containerRef}
      className="w-full overflow-x-auto"
      style={{ minHeight: height }}
    />
  );
}