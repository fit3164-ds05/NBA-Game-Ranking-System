import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LabelList,
  Label,
  Cell,
} from "recharts";
import { metricSlug } from "../utils/metricSlug";
import { colorForIndex } from "../utils/driverColors";

function wrapLabel(label, limit = 16, maxLines = 2) {
  const words = String(label ?? "").split(/\s+/);
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

  return lines.slice(0, maxLines);
}

function DriversTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="max-w-xs rounded-lg bg-white px-4 py-3 text-sm shadow-lg">
      <div className="font-semibold text-slate-900">{row.name}</div>
      {row.metric ? (
        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
          {String(row.metric).replace(/_/g, " ")}
        </div>
      ) : null}
      {row.description ? (
        <div className="mt-1 text-xs text-slate-500">{row.description}</div>
      ) : null}
      <div className="mt-2 text-sm font-medium text-slate-700">
        Correlation: {row.correlation.toFixed(2)}
      </div>
      {!row.available ? (
        <div className="mt-2 text-xs text-amber-600">
          Seasonal trends do not include this metric.
        </div>
      ) : null}
    </div>
  );
}

function MetricTick({ x, y, payload }) {
  const lines = wrapLabel(payload?.value, 16, 2);
  if (!lines.length) return null;
  return (
    <g transform={`translate(${x},${y})`}>
      {lines.map((line, idx) => (
        <text
          key={`${payload.value}-${idx}`}
          x={0}
          y={12 + idx * 12}
          textAnchor="middle"
          fill="#475569"
          fontSize={11}
        >
          {line}
        </text>
      ))}
    </g>
  );
}

function withAlpha(hex, alpha) {
  if (!hex || typeof hex !== "string") {
    return `rgba(37,99,235,${alpha})`;
  }
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) {
    return `rgba(37,99,235,${alpha})`;
  }
  const bigint = parseInt(normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function DriversColumnChart({
  rows = [],
  selectedMetricKey,
  onSelectMetric,
  allowedMetricKeys,
  metricColorMap,
}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
        No drivers data available.
      </div>
    );
  }

  const allowSet = allowedMetricKeys && allowedMetricKeys.size ? allowedMetricKeys : null;

  const decorated = rows.map((row, index) => {
    const metricKey = metricSlug(row.name || row.metric);
    const available = !allowSet || (metricKey && allowSet.has(metricKey));
    const palette = metricColorMap?.get(metricKey) ?? colorForIndex(index);
    return {
      ...row,
      metricKey,
      available,
      palette,
    };
  });

  const sorted = [...decorated].sort((a, b) => Number(b.correlation) - Number(a.correlation));
  const correlations = sorted.map((d) => Number(d.correlation) || 0);
  const min = Math.min(...correlations);
  const max = Math.max(...correlations);
  const spread = Math.max(0.05, max - min || 0.05);
  const padding = spread * 0.1;
  const domainMin = Math.min(0, min - padding);
  const domainMax = max + padding;

  const chartData = sorted.map((row) => ({
    id: row.metric || row.name,
    name: row.name,
    metric: row.metric,
    metricKey: row.metricKey,
    correlation: Number(row.correlation) || 0,
    description: row.description,
    available: row.available,
    palette: row.palette,
  }));

  const handleSelect = (entry) => {
    if (!onSelectMetric) return;
    if (!entry?.metricKey || !entry?.available) {
      onSelectMetric(null);
      return;
    }
    onSelectMetric(entry.metricKey === selectedMetricKey ? null : entry.metricKey);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="h-[320px] w-full">
        <ResponsiveContainer>
          <BarChart
            data={chartData}
            margin={{ top: 16, right: 16, bottom: 56, left: 48 }}
            barCategoryGap={20}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="name"
              interval={0}
              tickLine={false}
              height={60}
              tick={<MetricTick />}
            >
              <Label
                value="Metrics"
                position="insideBottom"
                offset={-52}
                fill="#475569"
                fontSize={11}
              />
            </XAxis>
            <YAxis
              domain={[domainMin, domainMax]}
              tick={{ fontSize: 11, fill: "#475569" }}
              width={56}
              tickFormatter={(value) => (Number.isFinite(value) ? value.toFixed(2) : value)}
              tickMargin={8}
            >
              <Label
                content={({ viewBox }) => {
                  if (!viewBox) return null;
                  const { x, y, height } = viewBox;
                  const cx = (x ?? 0) - 38;
                  const cy = (y ?? 0) + (height ?? 0) / 2;
                  return (
                    <text
                      x={cx}
                      y={cy}
                      transform={`rotate(-90 ${cx} ${cy})`}
                      textAnchor="middle"
                      fill="#475569"
                      fontSize={11}
                    >
                      Correlation
                    </text>
                  );
                }}
              />
            </YAxis>
            <Tooltip content={<DriversTooltip />} cursor={{ fill: "rgba(37,99,235,0.08)" }} />
            <Bar
              dataKey="correlation"
              radius={[8, 8, 0, 0]}
              cursor={onSelectMetric ? "pointer" : "default"}
              onClick={(data, index) => handleSelect(chartData[index])}
            >
              {chartData.map((row, index) => {
                const isSelected = selectedMetricKey === row.metricKey;
                const dimmed = selectedMetricKey && !isSelected;
                const fillBase = row.available ? row.palette : "#cbd5f5";
                const fill = isSelected
                  ? fillBase
                  : dimmed
                    ? withAlpha(fillBase, 0.25)
                    : withAlpha(fillBase, 0.75);
                return (
                  <Cell
                    key={row.id || index}
                    fill={fill}
                    stroke={isSelected ? withAlpha(fillBase, 1) : undefined}
                    strokeWidth={isSelected ? 1 : 0}
                    onClick={() => handleSelect(row)}
                    style={{ cursor: row.available && onSelectMetric ? "pointer" : "default", opacity: row.available ? 1 : 0.6 }}
                  />
                );
              })}
              <LabelList
                dataKey="correlation"
                position="top"
                formatter={(value) => (Number.isFinite(value) ? value.toFixed(2) : "")}
                fill="#1e293b"
                fontSize={11}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
