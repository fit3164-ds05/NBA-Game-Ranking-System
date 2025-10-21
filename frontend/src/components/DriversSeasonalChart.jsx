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

const COLORS = [
  "#de324c",
  "#f4895f",
  "#95cf92",
  "#369acc",
  "#9656a2",
  "#e97aff"
];

function seasonSort(a, b) {
  const parseYear = (season) => {
    if (!season) return 0;
    const match = String(season).match(/^\d{4}/);
    return match ? Number(match[0]) : 0;
  };
  return parseYear(a) - parseYear(b);
}

function buildChartData(rows) {
  const seasons = Array.from(
    new Set(rows.map((row) => row?.season).filter(Boolean))
  ).sort(seasonSort);

  const metrics = [];
  const metricMeta = new Map();

  rows.forEach((row) => {
    if (!row?.name) return;
    if (!metricMeta.has(row.name)) {
      const slug = row.name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
      metricMeta.set(row.name, {
        key: slug,
        color: COLORS[metricMeta.size % COLORS.length],
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

function DriversLineTooltip({ active, payload, label, metricLookup }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg bg-white px-4 py-3 text-sm shadow-lg">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
        {label}
      </div>
      <ul className="mt-2 space-y-1 text-xs text-slate-600">
        {payload.map((item) => {
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

export default function DriversSeasonalChart({ rows = [] }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
        No seasonal correlation data available.
      </div>
    );
  }

  const { data, metrics, metricMeta } = buildChartData(rows);

  if (data.length === 0 || metrics.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
        Unable to derive seasonal chart data.
      </div>
    );
  }

  const legendPayload = metrics.map((name) => {
    const meta = metricMeta.get(name);
    return {
      value: name,
      type: "line",
      color: meta?.color ?? "#0f172a",
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
              <DriversLineTooltip metricLookup={metricLookup} />
            }
          />
          <Legend
            wrapperStyle={{ paddingTop: 16 }}
            payload={legendPayload}
            iconType="circle"
          />
          {metrics.map((name) => {
            const meta = metricMeta.get(name);
            if (!meta) return null;
            return (
              <Line
                key={meta.key}
                type="monotone"
                dataKey={meta.key}
                stroke={meta.color}
                strokeWidth={2.5}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                name={name}
                connectNulls
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
