import DashboardSwitcher from "../components/DashboardSwitcher";
import FloatingCard from "../components/FloatingCard";

export default function DriversofRatings() {
  return (
    <div className="flex w-full flex-col gap-12 px-8 text-slate-900">
      <DashboardSwitcher
        title="The forces behind team ratings and wins"
        description="Glide across efficiencies, lineup stability, and schedule swings with a calm, analytical lens."
      />

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <FloatingCard
            tone="light"
            className="lg:col-span-8"
            title="Trendline Composer"
            titleSize="text-lg"
            body="Layer net rating, opponent shot profile, and travel fatigue into a single trajectory view to read momentum like a front office."
            bodySize="text-sm"
            childrenClassName="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3"
          >
            {[
              { team: "BOS", metric: "Net +11.2", status: "Cooling" },
              { team: "DAL", metric: "Net +8.9", status: "Accelerating" },
              { team: "NYK", metric: "Net +6.4", status: "Stabilizing" },
            ].map((spot) => (
              <div
                key={spot.team}
                className="rounded-2xl bg-white p-5 shadow-[0_18px_48px_-30px rgba(15,23,42,0.24)]"
              >
                <div className="text-xs uppercase tracking-[0.32em] text-emerald-500/90">
                  {spot.team}
                </div>
                <div className="mt-3 text-xl font-semibold text-slate-900">{spot.metric}</div>
                <div className="text-xs text-slate-500">Momentum: {spot.status}</div>
              </div>
            ))}
          </FloatingCard>

          <FloatingCard
            tone="light"
            className="lg:col-span-4"
            title="Lineup Stability"
            titleSize="text-lg"
            body="Rolling five-man continuity to flag chemistry surges or injury turbulence ahead of headlines."
            bodySize="text-sm"
            childrenClassName="mt-4 space-y-3 text-sm text-slate-600"
          >
            <ul className="space-y-3">
              {[
                { team: "MIN", value: "94% continuity", note: "Most consistent rotation" },
                { team: "PHX", value: "68% continuity", note: "Bench recalibration ongoing" },
                { team: "MIA", value: "55% continuity", note: "Injury-limited" },
              ].map((line) => (
                <li
                  key={line.team}
                  className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-[0_16px_42px_-28px rgba(15,23,42,0.22)]"
                >
                  <div>
                    <p className="text-xs uppercase tracking-[0.32em] text-amber-500/80">{line.team}</p>
                    <p className="text-xs text-slate-500">{line.note}</p>
                  </div>
                  <span className="text-sm font-semibold text-slate-900">{line.value}</span>
                </li>
              ))}
            </ul>
          </FloatingCard>
        </section>

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
