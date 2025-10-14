import { useNavigate } from "react-router-dom";
import DashboardSwitcher from "../components/DashboardSwitcher";
import Picbutton from "../components/Picbutton";

const dashboardCards = [
  {
    title: "Shot Charts",
    description:
      "Select shot charts for a player and season with detailed explanations of each shot area on hover. (Available from the 1996/97 season onward)",
    icon: "/shotchart.svg",
    alt: "Shot chart icon",
    to: "/dashboardshotchart",
  },
  {
    title: "Drivers of Ratings",
    description:
      "Explore the key drivers of historical ratings and how they have changed over the lifetime of the league",
    icon: "/heatmap.svg",
    alt: "Heatmap icon",
    to: "/DriversofRatings",
  },
  {
    title: "League Trends",
    description:
      "Explore how league-wide trends have changed over the lifetime of the league",
    icon: "/linechart.svg",
    alt: "Line chart icon",
    to: "/LeagueTrends",
  },
];

export default function DashboardHome() {
  const navigate = useNavigate();

  return (
    <div className="flex w-full flex-col gap-12 px-8 text-slate-900">
      <DashboardSwitcher
        description="Move from league-wide signals to focused breakdowns with a single gesture."
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {dashboardCards.map((card) => (
          <Picbutton
            key={card.title}
            title={card.title}
            onClick={() => navigate(card.to)}
            icon={card.icon}
            alt_text={card.alt}
            description={card.description}
            className="rounded-[28px] bg-white/90 px-8 py-12 shadow-[0_26px_70px_-42px rgba(15,23,42,0.25)] backdrop-blur hover:-translate-y-1 hover:bg-amber-50/70"
          />
        ))}
      </div>
    </div>
  );
}
