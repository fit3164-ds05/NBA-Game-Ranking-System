import DashboardSwitcher from "../components/DashboardSwitcher";
import FloatingCard from "../components/FloatingCard";

export default function Dashboardfeature3() {
  return (
    <div className="flex w-full flex-col gap-12 px-8 text-slate-900">
      <DashboardSwitcher
        title="League Trends"
        description="League Trends"
      />

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <FloatingCard
            tone="light"
            className="lg:col-span-7"
            title="Shot Shape Overview"
            titleSize="text-lg"
            body="Blend shot quality, touch time, and defender proximity to understand who bends the floor geometry."
            bodySize="text-sm"
            childrenClassName="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            {[
              { player: "Curry", metric: "E-3PT 1.24", blurb: "Volume and efficiency still unmatched." },
              { player: "Doncic", metric: "Usage 35%", blurb: "Heliocentric creation with resilient rim pressure." },
              { player: "Wembanyama", metric: "Blk % 9.1", blurb: "Alters 23% of rim looks faced." },
              { player: "Tatum", metric: "TS% 63", blurb: "Off-ball gravity peaking with clean footwork." },
            ].map((item) => (
              <div
                key={item.player}
                className="rounded-2xl bg-white p-5 shadow-[0_18px_48px_-30px rgba(15,23,42,0.24)]"
              >
                <p className="text-xs uppercase tracking-[0.32em] text-rose-500/80">{item.player}</p>
                <p className="mt-3 text-2xl font-semibold text-slate-900">{item.metric}</p>
                <p className="mt-2 text-xs text-slate-500">{item.blurb}</p>
              </div>
            ))}
          </FloatingCard>

          <FloatingCard
            tone="light"
            className="lg:col-span-5"
            title="Matchup Moodboard"
            titleSize="text-lg"
            body="Drop a player into a coming matchup to surface contextual shot charts and defender tendencies."
            bodySize="text-sm"
            childrenClassName="mt-5 space-y-3 text-sm text-slate-600"
          >
            {[
              { duo: "Embiid vs. Adebayo", note: "Post touches shift to elbows when Bam fronts." },
              { duo: "SGA vs. Jrue", note: "Free throw rate climbs 12% despite elite point-of-attack." },
              { duo: "Kawhi vs. Butler", note: "Mid-post fadeaway efficiency +18% when Butler is fatigued." },
            ].map((line) => (
              <div
                key={line.duo}
                className="rounded-2xl bg-white px-5 py-4 shadow-[0_16px_42px_-28px rgba(15,23,42,0.22)]"
              >
                <p className="text-xs uppercase tracking-[0.32em] text-amber-500/80">{line.duo}</p>
                <p className="mt-2 text-xs text-slate-500">{line.note}</p>
              </div>
            ))}
          </FloatingCard>
        </section>

        <FloatingCard
          tone="light"
          title="Next up"
          titleSize="text-lg"
          body="Activate the shot chart module in the sidebar to illustrate where the stars carve space."
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
