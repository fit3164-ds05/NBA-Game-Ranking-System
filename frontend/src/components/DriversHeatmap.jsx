import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";

const palette = [
  "#fff5eb",
  "#fee6ce",
  "#fdd0a2",
  "#fdae6b",
  "#fd8d3c",
  "#f16913",
  "#d94801",
  "#a63603",
  "#7f2704",
];

function pickColor(value, min, max) {
  if (Number.isNaN(value) || max <= min) {
    return palette[0];
  }
  const ratio = Math.min(1, Math.max(0, (value - min) / (max - min)));
  const idx = Math.round(ratio * (palette.length - 1));
  return palette[idx];
}

function labelFill(value, min, max) {
  if (max <= min) return "#6b4f28";
  const ratio = (value - min) / (max - min);
  return ratio > 0.55 ? "#fff8f0" : "#6b2800";
}

function wrapDescription(description, limit = 48) {
  if (!description) return [];
  const words = String(description).split(/\s+/);
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > limit && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });
  if (current) {
    lines.push(current);
  }
  return lines.slice(0, 2);
}

function HeatmapTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="rounded-lg bg-white px-4 py-3 text-sm shadow-lg">
      <div className="font-semibold text-slate-900">{row.name}</div>
      <div className="text-xs text-slate-500">{row.description}</div>
      <div className="mt-2 text-sm font-medium text-slate-700">
        Correlation: {row.correlation.toFixed(2)}
      </div>
    </div>
  );
}

export default function DriversHeatmap({ rows = [] }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
        No drivers data available.
      </div>
    );
  }

  const sorted = [...rows].sort((a, b) => b.correlation - a.correlation);
  const min = Math.min(...sorted.map((d) => d.correlation));
  const max = Math.max(...sorted.map((d) => d.correlation));
  const chartData = sorted.map((row) => ({
    id: row.metric || row.name,
    name: row.name,
    metric: row.metric,
    value: 1,
    correlation: Number(row.correlation),
    description: row.description,
  }));

  return (
    <div className="flex flex-col gap-5">
      <div className="h-[360px] w-full">
        <ResponsiveContainer>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
          >
            <XAxis type="number" domain={[0, 1]} hide />
            <YAxis
              type="category"
              dataKey="name"
              width={0}
              tick={false}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<HeatmapTooltip />} cursor={{ fill: "rgba(15,23,42,0.04)" }} />
            <Bar
              dataKey="value"
              radius={[12, 12, 12, 12]}
              barSize={72}
              label={({ x, y, width, height, payload: barData }) => {
                const padding = 20;
                const corr = typeof barData?.correlation === "number" ? barData.correlation : NaN;
                if (Number.isNaN(corr)) {
                  return null;
                }
                const textColor = labelFill(corr, min, max);
                const metricLabel = String(barData.metric || "").replace(/_/g, " ");
                const nameY = y + padding + 14;
                const lines = wrapDescription(barData.description);
                const descStartY = nameY + 22;
                return (
                  <g>
                    {metricLabel ? (
                      <text
                        x={x + padding}
                        y={y + padding}
                        fontSize={11}
                        fontWeight={600}
                        fill={textColor}
                        letterSpacing="0.18em"
                      >
                        {metricLabel}
                      </text>
                    ) : null}
                    <text
                      x={x + padding}
                      y={nameY}
                      fontSize={16}
                      fontWeight={600}
                      fill={textColor}
                    >
                      {barData.name}
                    </text>
                    {lines.map((line, idx) => (
                      <text
                        key={`${barData.id}-desc-${idx}`}
                        x={x + padding}
                        y={descStartY + idx * 16}
                        fontSize={12}
                        fill={textColor}
                      >
                        {line}
                      </text>
                    ))}
                    <text
                      x={x + width - padding}
                      y={y + height - padding + 6}
                      textAnchor="end"
                      fontSize={16}
                      fontWeight={600}
                      fill={textColor}
                    >
                      {corr.toFixed(2)}
                    </text>
                  </g>
                );
              }}
            >
              {chartData.map((row) => (
                <Cell key={row.id} fill={pickColor(row.correlation, min, max)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-sm font-semibold text-slate-700">Correlation scale</div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>{min.toFixed(2)}</span>
          <div
            className="h-2 flex-1 rounded-full"
            style={{
              background: `linear-gradient(90deg, ${palette[0]}, ${palette[palette.length - 1]})`,
            }}
          />
          <span>{max.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
