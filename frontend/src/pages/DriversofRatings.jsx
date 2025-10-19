import { useEffect, useState } from "react";
import DashboardSwitcher from "../components/DashboardSwitcher";
import FloatingCard from "../components/FloatingCard";
import DriversHeatmap from "../components/DriversHeatmap";
import DriversSeasonalChart from "../components/DriversSeasonalChart";
import { getDriversOfRatings, getDriversOfRatingsSeasonal } from "../lib/api";

export default function DriversofRatings() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [seasonalRows, setSeasonalRows] = useState([]);
  const [seasonalLoading, setSeasonalLoading] = useState(true);
  const [seasonalError, setSeasonalError] = useState(null);

  useEffect(() => {
    let isActive = true;
    setLoading(true);
    setSeasonalLoading(true);
    (async () => {
      try {
        const [topResult, seasonalResult] = await Promise.allSettled([
          getDriversOfRatings(),
          getDriversOfRatingsSeasonal(),
        ]);

        if (!isActive) return;

        if (topResult.status === "fulfilled") {
          const data = Array.isArray(topResult.value) ? topResult.value : [];
          setRows(data);
          setError(null);
        } else {
          setRows([]);
          const msg =
            topResult.reason?.message || "Unable to load drivers data.";
          setError(msg);
        }

        if (seasonalResult.status === "fulfilled") {
          const seasonalData = Array.isArray(seasonalResult.value)
            ? seasonalResult.value
            : [];
          setSeasonalRows(seasonalData);
          setSeasonalError(null);
        } else {
          setSeasonalRows([]);
          const msg =
            seasonalResult.reason?.message ||
            "Unable to load seasonal drivers data.";
          setSeasonalError(msg);
        }
      } catch {
        if (!isActive) return;
        setRows([]);
        setError("Unable to load drivers data.");
        setSeasonalRows([]);
        setSeasonalError("Unable to load seasonal drivers data.");
      } finally {
        if (isActive) {
          setLoading(false);
          setSeasonalLoading(false);
        }
      }
    })();
    return () => {
      isActive = false;
    };
  }, []);

  return (
    <div className="flex w-full flex-col gap-12 px-8 text-slate-900">
      <DashboardSwitcher
        title="The forces behind team ratings and wins"
        description="Explore how efficiency metrics correlate with historical ratings to prioritise what matters most."
      />

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <FloatingCard
          tone="light"
          className="lg:col-span-8"
          title="Top correlation drivers"
          titleSize="text-lg"
          body="Correlation between team metrics and historical ratings. Darker tiles signal a tighter relationship with model strength."
          bodySize="text-sm"
          childrenClassName="mt-6"
        >
          {loading ? (
            <div className="flex h-64 items-center justify-center text-sm text-slate-500">
              Loading drivers...
            </div>
          ) : error ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-rose-600">
              <span className="font-semibold">Unable to display the heatmap.</span>
              <span className="text-xs text-rose-500">{error}</span>
            </div>
          ) : (
            <DriversHeatmap rows={rows} />
          )}
        </FloatingCard>

        <FloatingCard
          tone="light"
          className="lg:col-span-4"
          title="How to interpret the tiles"
          titleSize="text-lg"
          body=""
          bodySize="text-sm"
          childrenClassName="mt-4 space-y-3 text-sm text-slate-600"
        >
          <ul className="space-y-3">
            <li className="rounded-2xl bg-white px-4 py-3 shadow-[0_16px_42px_-28px rgba(15,23,42,0.22)]">
              <p className="text-sm font-semibold text-slate-900">Metric</p>
              <p className="text-xs text-slate-500">
                The Y-axis lists advanced and four-factor metrics sourced from the ratings dataset.
              </p>
            </li>
            <li className="rounded-2xl bg-white px-4 py-3 shadow-[0_16px_42px_-28px rgba(15,23,42,0.22)]">
              <p className="text-sm font-semibold text-slate-900">Color intensity</p>
              <p className="text-xs text-slate-500">
                Darker shades indicate a stronger positive correlation with historical team ratings.
              </p>
            </li>
            <li className="rounded-2xl bg-white px-4 py-3 shadow-[0_16px_42px_-28px rgba(15,23,42,0.22)]">
              <p className="text-sm font-semibold text-slate-900">Numeric label</p>
              <p className="text-xs text-slate-500">
                The correlation coefficient rounded to two decimals, helpful for quick comparisons.
              </p>
            </li>
          </ul>
        </FloatingCard>
      </section>

      <FloatingCard
        tone="light"
        title="Correlation trends over time"
        titleSize="text-lg"
        body="Season-by-season correlations show where certain metrics gained or lost influence on overall ratings."
        bodySize="text-sm"
        childrenClassName="mt-6"
      >
        {seasonalLoading ? (
          <div className="flex h-64 items-center justify-center text-sm text-slate-500">
            Loading seasonal drivers...
          </div>
        ) : seasonalError ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-rose-600">
            <span className="font-semibold">
              Unable to display the seasonal trends.
            </span>
            <span className="text-xs text-rose-500">{seasonalError}</span>
          </div>
        ) : (
          <DriversSeasonalChart rows={seasonalRows} />
        )}
      </FloatingCard>

      <FloatingCard
        tone="light"
        title="Suggested next step"
        titleSize="text-lg"
        body="Pivot to player insights to inspect who is driving the swing in on/off splits."
        bodySize="text-sm"
        childrenClassName="mt-6 flex flex-col gap-3 text-xs text-slate-500 md:flex-row md:items-center md:justify-end"
      >
        <span className="rounded-full bg-white px-4 py-2 shadow-[0_12px_32px_-24px rgba(15,23,42,0.25)]">
          Track custom cohorts
        </span>
        <span className="rounded-full bg-white px-4 py-2 shadow-[0_12px_32px_-24px rgba(15,23,42,0.25)]">
          Export CSV
        </span>
      </FloatingCard>
    </div>
  );
}
