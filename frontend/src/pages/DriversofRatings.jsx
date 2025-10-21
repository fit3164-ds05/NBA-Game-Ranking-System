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
        title="The forces behind team ratings"
        description="Explore how team metrics correlate with historical ratings"
      />

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <FloatingCard
          tone="light"
          className="lg:col-span-8"
          title="Top drivers"
          titleSize="text-lg"
          body="Team metrics with the greatest correlation with historical ratings"
          bodySize="text-sm"
          childrenClassName="mt-6"
        >
          {loading ? (
            <div className="flex h-64 items-center justify-center text-sm text-slate-500">
              Loading drivers...
            </div>
          ) : error ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-rose-600">
              <span className="font-semibold">Unable to display the chart.</span>
              <span className="text-xs text-rose-500">{error}</span>
            </div>
          ) : (
            <DriversHeatmap rows={rows} />
          )}
        </FloatingCard>

        <FloatingCard
          tone="light"
          className="lg:col-span-4"
          title="Explanation"
          titleSize="text-lg"
          body=""
          bodySize="text-sm"
          childrenClassName="mt-4 space-y-3 text-sm text-slate-600"
        >
          <p className="text-slate-500">
            <i>Top Drivers</i> illustrates the team metrics with the greatest correlation with historical ratings from 1996/97 to now. Team metrics under consideration are taken from advanced box scores.
          </p>

          <p className="text-slate-500">
            <i>Net Rating</i> is arguably the most comprehensive single indicator of team strength. It captures the point differential per 100 possessions, blending offensive and defensive performance into one number. Teams with consistently high net ratings dominate both ends of the floor, which directly translates to winning margins and, by extension, higher ratings.
            While <i>Net Rating</i> is the number of points scored per 100 possessions minus the number of points allowed per 100 possessions, <i>offensive rating</i> is just the number of points scored per 100 points.
            <i>Offensive Rating</i> quantifies how effectively a team converts possessions into points. A high offensive rating reflects strong shot selection, ball movement, and execution.
            As both are measured per 100 possessions, <i>Net Rating</i> and <i>Offensive Rating</i> are also good indicators of a team's pace.
          </p>  

          <p className="text-slate-500">
            <i>True Shooting Percentage</i>, <i>Effective Field Goal Percentage</i>, and <i>Field Goal Percentage</i> all reflect scoring efficiency. 
            <i>Field Goal Percentage</i> offers a baseline view of scoring efficiency.
            <i>True Shooting Percentage</i> adjusts for the value of three-pointers and free throws, offering a more accurate measure of scoring efficiency than traditional <i>Field Goal Percentage</i>. 
            Similarly, <i>Effective Field Goal Percentage</i> accounts for the added value of three-pointers.
            These metrics are often dependent on teams' shot selection quality and periemter efficiency, and thus their ability to maximise points per shot.
          </p>

          <p className="text-slate-500">
            The number of <i>Points</i> scored remains a strong signal of offensive power. Although raw scoring does not account for pace or efficiency, at the end of the day, points win and lose games.
          </p>
        </FloatingCard>
      </section>

      <FloatingCard
        tone="light"
        title="Top drivers over time"
        className="lg:col-span-8"
        titleSize="text-lg"
        body="Seasonal correlations between the top drivers and historical ratings"
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
          className="lg:col-span-4"
          title="Explanation"
          titleSize="text-lg"
          body=""
          bodySize="text-sm"
          childrenClassName="mt-4 space-y-3 text-sm text-slate-600"
        >
          <p className="text-slate-500">
            <i>Top Drivers Over Time</i> illustrates how the importance of the top drivers of historical ratings have evolved over the time, from 1996/97 to now, highlighting where certain metrics gained or lost influence on overall ratings.
          </p>

          <p className="text-slate-500">
            <i>Net rating</i> has consistently remained essentially the most important driver of historical ratings, confirming its status as the most comprehensive single indicator of team strength by capturing both offensive and defensive performance.
          </p>

          <p className="text-slate-500">
            <i>Points</i> per game, by contrast, shows considerable fluctuation. Its correlation with ratings rises and falls unpredictably, suggesting that raw scoring alone is not a stable indicator of team strength.
          </p>  

          <p className="text-slate-500">
            <i>True Shooting Percentage</i> begins as the leading metric in the first four seasons, but then settles into a lower range for the next two decades. This shift may reflect changes in league-wide scoring efficiency or diminishing marginal returns from shooting optimisation.
          </p>

          <p className="text-slate-500">
            Interestingly, <i>Offensive Rating</i>, <i>Effective Field Goal Percentage</i>, and <i>Field Goal Percentage</i> don’t exhibit a clear long-term trend, but they move in lockstep, rising and falling together season by season. This suggests they’re capturing similar underlying dynamics in team performance, likely tied to scoring efficiency and shot selection.
          </p>
        </FloatingCard>
    </div>
  );
}
