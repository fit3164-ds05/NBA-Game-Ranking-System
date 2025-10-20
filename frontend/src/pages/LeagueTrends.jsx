import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

import DashboardSwitcher from "../components/DashboardSwitcher";
import FloatingCard from "../components/FloatingCard";
import { getLeagueFGComposition, getLeagueScoringZones } from "../lib/api";

const FGA_COLORS = {
  pct_2pt: "#4c1d95",
  pct_3pt: "#7dd3fc",
};

const ZONE_COLORS = {
  pct_pitp: "#3730a3",
  pct_midrange: "#7c3aed",
  pct_three: "#38bdf8",
  pct_ft: "#cbd5f5",
};

export default function LeagueTrends() {
  const [fgaData, setFgaData] = useState([]);
  const [fgaLoading, setFgaLoading] = useState(true);
  const [fgaError, setFgaError] = useState(null);

  const [zoneData, setZoneData] = useState([]);
  const [zoneLoading, setZoneLoading] = useState(true);
  const [zoneError, setZoneError] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setFgaLoading(true);
      setZoneLoading(true);
      try {
        const [fgaResult, zoneResult] = await Promise.allSettled([
          getLeagueFGComposition(),
          getLeagueScoringZones(),
        ]);
        if (!active) return;

        if (fgaResult.status === "fulfilled") {
          const rows = Array.isArray(fgaResult.value) ? fgaResult.value : [];
          setFgaData(
            rows.map((row) => ({
              season: row.season,
              pct_2pt: Number(row.pct_2pt) / 100,
              pct_3pt: Number(row.pct_3pt) / 100,
              pct_2pt_raw: Number(row.pct_2pt),
              pct_3pt_raw: Number(row.pct_3pt),
            }))
          );
          setFgaError(null);
        } else {
          setFgaData([]);
          setFgaError(fgaResult.reason?.message || "Unable to load field goal composition.");
        }

        if (zoneResult.status === "fulfilled") {
          const rows = Array.isArray(zoneResult.value) ? zoneResult.value : [];
          setZoneData(
            rows.map((row) => ({
              season: row.season,
              pct_pitp: Number(row.pct_pitp) / 100,
              pct_midrange: Number(row.pct_midrange) / 100,
              pct_three: Number(row.pct_three) / 100,
              pct_ft: Number(row.pct_ft) / 100,
              pct_pitp_raw: Number(row.pct_pitp),
              pct_midrange_raw: Number(row.pct_midrange),
              pct_three_raw: Number(row.pct_three),
              pct_ft_raw: Number(row.pct_ft),
            }))
          );
          setZoneError(null);
        } else {
          setZoneData([]);
          setZoneError(zoneResult.reason?.message || "Unable to load scoring zone composition.");
        }
      } catch (err) {
        if (!active) return;
        const message = err?.message || "Unable to load league trends.";
        setFgaData([]);
        setZoneData([]);
        setFgaError(message);
        setZoneError(message);
      } finally {
        if (active) {
          setFgaLoading(false);
          setZoneLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex w-full flex-col gap-12 px-8 text-slate-900">
      <DashboardSwitcher
        title="League Trends"
        description="Track how league-wide shot selection and scoring profiles evolve over time."
      />

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <FloatingCard
          tone="light"
          className="lg:col-span-7"
          title="Field Goal Attempt Composition"
          titleSize="text-lg"
          body="Share of 2PT and 3PT attempts by season (team_metrics_seasonal.csv)."
          bodySize="text-sm"
          childrenClassName="mt-6 h-[360px]"
        >
          {fgaLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Loading field goal trends…
            </div>
          ) : fgaError ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-rose-600">
              <span className="font-semibold">Unable to display the chart.</span>
              <span className="text-xs text-rose-500">{fgaError}</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fgaData} stackOffset="expand">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.08)" />
                <XAxis
                  dataKey="season"
                  angle={-40}
                  textAnchor="end"
                  height={70}
                  interval={0}
                  tick={{ fontSize: 12, fill: "#475569" }}
                />
                <YAxis
                  domain={[0, 1]}
                  tickFormatter={(value) => `${Math.round(value * 100)}%`}
                  tick={{ fontSize: 12, fill: "#475569" }}
                />
                <Tooltip
                  formatter={(value, name, { payload }) => {
                    const label = name === "pct_2pt" ? "2-pointers attempted" : "3-pointers attempted";
                    const rawKey = name === "pct_2pt" ? "pct_2pt_raw" : "pct_3pt_raw";
                    const raw = payload?.[rawKey];
                    const percent = typeof raw === "number" ? raw : Number(value) * 100;
                    return [`${percent.toFixed(1)}%`, label];
                  }}
                />
                <Legend
                  verticalAlign="top"
                  height={36}
                  formatter={(value) =>
                    value === "pct_2pt" ? "2-pointers attempted" : "3-pointers attempted"
                  }
                />
                <Bar dataKey="pct_2pt" stackId="fga" fill={FGA_COLORS.pct_2pt} />
                <Bar dataKey="pct_3pt" stackId="fga" fill={FGA_COLORS.pct_3pt} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </FloatingCard>

        <FloatingCard
          tone="light"
          className="lg:col-span-5"
          title="Scoring Zone Contributions"
          titleSize="text-lg"
          body="League share of total points coming from the paint, mid-range, threes, and free throws."
          bodySize="text-sm"
          childrenClassName="mt-6 h-[360px]"
        >
          {zoneLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Loading scoring zones…
            </div>
          ) : zoneError ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-rose-600">
              <span className="font-semibold">Unable to display the scoring breakdown.</span>
              <span className="text-xs text-rose-500">{zoneError}</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={zoneData} stackOffset="expand">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.08)" />
                <XAxis
                  dataKey="season"
                  angle={-40}
                  textAnchor="end"
                  height={70}
                  interval={0}
                  tick={{ fontSize: 12, fill: "#475569" }}
                />
                <YAxis
                  domain={[0, 1]}
                  tickFormatter={(value) => `${Math.round(value * 100)}%`}
                  tick={{ fontSize: 12, fill: "#475569" }}
                />
                <Tooltip
                  formatter={(value, name, { payload }) => {
                    const labels = {
                      pct_pitp: "2-pointers (in the paint)",
                      pct_midrange: "2-pointers (mid-range)",
                      pct_three: "3-pointers",
                      pct_ft: "Free throws",
                    };
                    const rawKey = {
                      pct_pitp: "pct_pitp_raw",
                      pct_midrange: "pct_midrange_raw",
                      pct_three: "pct_three_raw",
                      pct_ft: "pct_ft_raw",
                    }[name] || "";
                    const raw = rawKey ? payload?.[rawKey] : undefined;
                    const percent = typeof raw === "number" ? raw : Number(value) * 100;
                    return [`${percent.toFixed(1)}%`, labels[name] ?? name];
                  }}
                />
                <Legend
                  verticalAlign="top"
                  height={48}
                  formatter={(value) => {
                    const labels = {
                      pct_pitp: "2-pointers (in the paint)",
                      pct_midrange: "2-pointers (mid-range)",
                      pct_three: "3-pointers",
                      pct_ft: "Free throws",
                    };
                    return labels[value] ?? value;
                  }}
                />
                <Bar dataKey="pct_pitp" stackId="zones" fill={ZONE_COLORS.pct_pitp} />
                <Bar dataKey="pct_midrange" stackId="zones" fill={ZONE_COLORS.pct_midrange} />
                <Bar dataKey="pct_three" stackId="zones" fill={ZONE_COLORS.pct_three} />
                <Bar dataKey="pct_ft" stackId="zones" fill={ZONE_COLORS.pct_ft} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </FloatingCard>
      </section>

      <FloatingCard
        tone="light"
        title="Reading the shift"
        titleSize="text-lg"
        body="A stacked share perspective highlights when perimeter volume began overtaking traditional mid-range play."
        bodySize="text-sm"
        childrenClassName="mt-5 space-y-3 text-sm text-slate-600"
      >
        <ul className="space-y-3">
          <li className="rounded-2xl bg-white px-4 py-3 shadow-[0_16px_42px_-28px rgba(15,23,42,0.22)]">
            <p className="text-sm font-semibold text-slate-900">Early 2000s plateau</p>
            <p className="text-xs text-slate-500">
              Three-point share hovered under 25% until pace-space lineups emerged after 2007.
            </p>
          </li>
          <li className="rounded-2xl bg-white px-4 py-3 shadow-[0_16px_42px_-28px rgba(15,23,42,0.22)]">
            <p className="text-sm font-semibold text-slate-900">2015 surge</p>
            <p className="text-xs text-slate-500">
              The Warriors and Rockets era pushed 3PT attempts above a third of all shots.
            </p>
          </li>
          <li className="rounded-2xl bg-white px-4 py-3 shadow-[0_16px_42px_-28px rgba(15,23,42,0.22)]">
            <p className="text-sm font-semibold text-slate-900">Modern equilibrium</p>
            <p className="text-xs text-slate-500">
              Recent seasons sit near a 60/40 split, showing how rim pressure still anchors offenses.
            </p>
          </li>
        </ul>
      </FloatingCard>

      <FloatingCard
        tone="light"
        title="Next up"
        titleSize="text-lg"
        body="Activate the shot chart module in the sidebar to illustrate how individual teams evolve inside this league context."
        bodySize="text-sm"
        childrenClassName="mt-6 flex flex-col gap-3 text-xs text-slate-500 md:flex-row md:items-center md:justify-end"
      >
        <span className="rounded-full bg-white px-4 py-2 shadow-[0_12px_32px_-24px rgba(15,23,42,0.25)]">
          Sync with shotchart
        </span>
        <span className="rounded-full bg-white px-4 py-2 shadow-[0_12px_32px_-24px rgba(15,23,42,0.25)]">
          Share scene
        </span>
      </FloatingCard>
    </div>
  );
}
