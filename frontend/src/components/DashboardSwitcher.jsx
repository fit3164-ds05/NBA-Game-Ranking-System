import { NavLink } from "react-router-dom";

const tabs = [
  { to: "/dashboardhome", label: "Overview" },
  { to: "/dashboardshotchart", label: "Shot Chart" },
  { to: "/dashboardfeature2", label: "Team Trends" },
  { to: "/dashboardfeature3", label: "Player Insights" }
];

export default function DashboardSwitcher({
  title = "Statistics Dashboard",
  label = "Discover the data that matters",
  description = "Switch between curated analytics views while staying in flow.",
}) {
  const baseStyles = "px-5 py-2 text-sm font-medium transition-colors duration-200 rounded-full";
  const inactiveStyles = "text-slate-500 hover:text-slate-900 hover:bg-white";
  const activeStyles = "bg-amber-400 text-slate-900 shadow-[0_10px_30px_-18px rgba(251,191,36,0.8)]";

  return (
    <header className="w-full rounded-[28px] bg-white/90 p-6 shadow-[0_28px_70px_-40px rgba(15,23,42,0.35)] backdrop-blur-sm">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <h1 className="text-sm font-semibold uppercase tracking-[0.35em] text-amber-500 md:text-base">
            {title}
          </h1>
          <h2 className="text-2xl font-semibold text-slate-900 md:text-3xl">{label}</h2>
          <p className="text-sm text-slate-500 md:text-base">{description}</p>
        </div>
        <nav className="flex flex-wrap items-center gap-2 rounded-full bg-white/95 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `${baseStyles} ${isActive ? activeStyles : inactiveStyles}`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
