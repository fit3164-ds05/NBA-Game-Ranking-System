import DashboardSwitcher from "../components/DashboardSwitcher";
import FloatingCard from "../components/FloatingCard";

export default function DashboardHome() {
  const centeredTitleClass =
    "text-center font-semibold uppercase tracking-[0.35em] text-amber-500";
  const centeredBodyClass = "text-center text-slate-600";

  return (
    <div className="flex w-full flex-col gap-12 px-8 text-slate-900">
      <DashboardSwitcher
        description="Move from league-wide signals to focused breakdowns with a single gesture."
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">

        <FloatingCard
        title="Shot Charts"
        titleClassName={centeredTitleClass}
        body="Select shot charts for a player and season with detailed explanations of each shot area on hover. (Available from the 1996/97 season onward)"
        bodyClassName={centeredBodyClass}
        bodyAfterChildren
        >
        <img
          src="/shotchart.svg"
          alt="Shot chart icon"
          className="mx-auto mt-4 h-32 w-32"
        />
        </FloatingCard>

        <FloatingCard
        title="Drivers of Ratings"
        titleClassName={centeredTitleClass}
        body="Explore the key drivers of historical ratings and how they have changed over the lifetime of the league"
        bodyClassName={centeredBodyClass}
        bodyAfterChildren
        >
        <img
          src="/heatmap.svg"
          alt="Heatmap icon"
          className="mx-auto mt-4 h-32 w-32"
        />
        </FloatingCard>

        <FloatingCard
        title="League Trends"
        titleClassName={centeredTitleClass}
        body="Explore how league-wide trends have changed over the lifetime of the league"
        bodyClassName={centeredBodyClass}
        bodyAfterChildren
        >
        <img
          src="/linechart.svg"
          alt="Line Chart icon"
          className="mx-auto mt-4 h-32 w-32"
        />
        </FloatingCard>

      </div>
    </div>
  );
}
