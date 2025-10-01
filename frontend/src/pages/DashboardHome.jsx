import DashboardSwitcher from "../components/DashboardSwitcher";
import FloatingCard from "../components/FloatingCard";

export default function DashboardHome() {
  return (
    <div className="flex w-full flex-col gap-12 px-8 text-slate-900">
      <DashboardSwitcher
        description="Move from league-wide signals to focused breakdowns with a single gesture."
      />

      <section className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <FloatingCard
          tone="light"
          className="md:col-span-2"
          title="Momentum Pulse"
          titleSize="text-lg"
          body="A curated stream of pace, offensive rating shifts, and volatility to surface storylines early."
          bodySize="text-sm"
          childrenClassName="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3"
        >
          {[
            { label: "League Pace", value: "101.7", delta: "+2.1" },
            { label: "Offensive Rating", value: "117.4", delta: "+0.8" },
            { label: "Clutch Net Rating", value: "+4.6", delta: "-1.2" },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl bg-white p-4 shadow-[0_18px_48px_-30px rgba(15,23,42,0.25)]"
            >
              <div className="text-xs uppercase tracking-[0.32em] text-amber-500/80">
                {item.label}
              </div>
              <div className="mt-3 text-2xl font-semibold text-slate-900">{item.value}</div>
              <div className="text-xs text-slate-500">7-day change {item.delta}</div>
            </div>
          ))}
        </FloatingCard>

        <FloatingCard
          tone="light"
          title="Spotlight"
          titleSize="text-lg"
          body="Snapshot of the storyline shaping this week."
          bodySize="text-sm"
          childrenClassName="mt-5 space-y-2"
        >
          <p className="text-sm font-medium text-slate-900">
            Thunder climb to #2 in net rating
          </p>
          <p className="text-xs text-slate-500">
            Powered by a top-five half-court offense and the youngest top-three lineup in the conference.
          </p>
        </FloatingCard>
      </section>

      <FloatingCard
        tone="light"
        title="What comes next"
        titleSize="text-lg"
        body="Use the toggles above to pivot into team trajectories or isolate player-level shot charts."
        bodySize="text-sm"
        childrenClassName="mt-6 flex justify-start md:justify-end"
      >
        <div className="flex gap-3 text-xs text-slate-500">
          <span className="rounded-full bg-white px-4 py-2 shadow-[0_12px_32px_-24px rgba(15,23,42,0.25)]">
            Auto-refresh every 15 min
          </span>
          <span className="rounded-full bg-white px-4 py-2 shadow-[0_12px_32px_-24px rgba(15,23,42,0.25)]">
            Live sample data
          </span>
        </div>
      </FloatingCard>
    </div>
  );
}
