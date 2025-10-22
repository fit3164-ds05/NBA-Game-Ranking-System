import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { metricSlug } from "../utils/metricSlug";
import { colorForIndex } from "../utils/driverColors";

function seasonSort(a, b) {
  const parseYear = (season) => {
    if (!season) return 0;
    const match = String(season).match(/^\d{4}/);
    return match ? Number(match[0]) : 0;
  };
  return parseYear(a) - parseYear(b);
}

function buildChartData(rows, metricColorMap) {
  const seasons = Array.from(
    new Set(rows.map((row) => row?.season).filter(Boolean))
  ).sort(seasonSort);

  const metrics = [];
  const metricMeta = new Map();

  rows.forEach((row) => {
    if (!row?.name) return;
    if (!metricMeta.has(row.name)) {
      const slug = metricSlug(row.name);
      const existingColor = metricColorMap?.get(slug);
      const color = existingColor || colorForIndex(metricMeta.size);
      metricMeta.set(row.name, {
        key: slug,
        color,
        description: row.description,
      });
      metrics.push(row.name);
    }
  });

  const data = seasons.map((season) => {
    const entry = { season };
    rows
      .filter((row) => row.season === season)
      .forEach((row) => {
        const meta = metricMeta.get(row.name);
        if (meta) {
          entry[meta.key] = Number(row.correlation);
        }
      });
    return entry;
  });

  return { data, metrics, metricMeta };
}

function DriversLineTooltip({ active, payload, label, metricLookup, focusMetricKey }) {
  if (!active || !payload || payload.length === 0) return null;
  const filtered = focusMetricKey
    ? payload.filter((item) => item.dataKey === focusMetricKey)
    : payload;
  return (
    <div className="rounded-lg bg-white px-4 py-3 text-sm shadow-lg">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
        {label}
      </div>
      <ul className="mt-2 space-y-1 text-xs text-slate-600">
        {filtered.map((item) => {
          const name = metricLookup.get(item.dataKey)?.name ?? item.name;
          return (
            <li key={item.dataKey} className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="font-medium text-slate-800">{name}</span>
              <span>{(item.value ?? 0).toFixed(3)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function DriversSeasonalChart({ rows = [], focusMetricKey = null, onMetricClick, metricColorMap }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
        No seasonal correlation data available.
      </div>
    );
  }

  const { data, metrics, metricMeta } = buildChartData(rows, metricColorMap);

  if (data.length === 0 || metrics.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
        Unable to derive seasonal chart data.
      </div>
    );
  }

  const legendPayload = metrics.map((name) => {
    const meta = metricMeta.get(name);
    const key = meta?.key;
    const isFocused = !focusMetricKey || focusMetricKey === key;
    return {
      value: name,
      type: "line",
      color: meta?.color ?? "#0f172a",
      inactive: !isFocused,
    };
  });

  const metricLookup = new Map(
    metrics.map((name) => {
      const meta = metricMeta.get(name);
      return [
        meta?.key ?? name,
        {
          name,
          color: meta?.color ?? "#0f172a",
          description: meta?.description,
        },
      ];
    })
  );

  const handleLineClick = (meta) => {
    if (!onMetricClick || !meta?.key) return;
    onMetricClick(meta.key === focusMetricKey ? null : meta.key);
  };

  return (
    <div className="h-[420px] w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 16, right: 32, bottom: 24, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#cbd5f5" />
          <XAxis
            dataKey="season"
            tick={{ fontSize: 12, fill: "#475569" }}
            tickMargin={12}
            angle={-35}
            textAnchor="end"
            height={70}
          />
          <YAxis
            tick={{ fontSize: 12, fill: "#475569" }}
            domain={["auto", "auto"]}
            tickFormatter={(value) => value.toFixed(2)}
          />
          <Tooltip
            content={
              <DriversLineTooltip
                metricLookup={metricLookup}
                focusMetricKey={focusMetricKey}
              />
            }
          />
          <Legend
            wrapperStyle={{ paddingTop: 16 }}
            payload={legendPayload}
            iconType="circle"
            formatter={(value, entry) => (
              <span style={{ opacity: entry?.inactive ? 0.4 : 1 }}>{value}</span>
            )}
          />
          {metrics.map((name) => {
            const meta = metricMeta.get(name);
            if (!meta) return null;
            const isFocused = !focusMetricKey || focusMetricKey === meta.key;
            return (
              <Line
                key={meta.key}
                type="monotone"
                dataKey={meta.key}
                stroke={meta.color}
                strokeWidth={isFocused ? 2.8 : 1.5}
                strokeOpacity={isFocused ? 1 : 0.2}
                dot={isFocused ? { r: 3 } : { r: 0 }}
                activeDot={isFocused ? { r: 5 } : false}
                name={name}
                connectNulls
                onClick={() => handleLineClick(meta)}
                cursor={onMetricClick ? "pointer" : "default"}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
