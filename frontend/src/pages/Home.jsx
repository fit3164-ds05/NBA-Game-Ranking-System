import Explanationcard from "../components/Explanationcard";
import Picbutton from "../components/Picbutton";
import { useNavigate } from "react-router-dom";
import Dash from "../../public/dashboard.svg";
import Stats from "../../public/stats.svg";
import Predictions from "../../public/predictions.svg";


export default function Home() {
  const navigate = useNavigate();

  return (
    <div class="min-h-screen">
      <main className="relative z-10 w-full max-w-7xl mx-auto px-4 py-12 flex flex-col items-center">
        <h1 className="text-4xl font-bold text-gray-800 mb-6 text-center"> Welcome to NBA Data Dribble</h1>
        {/* three-button grid */}
        <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12 mt-20">
          <Picbutton
            title="Historical Ratings"
            onClick={() => navigate("/historicalranking")}
            icon={Stats}
            alt_text = "Stats icon"
          />
          <Picbutton
            title="Statistics Dashboard"
            onClick={() => navigate("/dashboardhome")}
            icon = {Dash}
            alt_text = "Dashboard icon"
          />
          <Picbutton
            title="Game Predictions"
            onClick={() => navigate("/gameprediction")}
            icon = {Predictions}
            alt_text = "Predictions icon"
          />
        </div>

        {/* section divider */}
        <div className="w-full border-b-4 border-gray-300 mb-6"/>

        <Explanationcard title="Features" colour="amber-600">
          <div className="w-full grid grid-cols-1 gap-6 mt-12">

            <div className="rounded-xl bg-gradient-to-r from-amber-500 to-amber-700 p-6 text-white shadow-lg transform transition hover:scale-105">
              <h3 className="text-xl font-semibold mb-2">Historical Ratings</h3>
              <p className="text-sm opacity-90">Explore player and team ratings over time to analyze performance trends and historical context.</p>
            </div>

            <div className="rounded-xl bg-gradient-to-r from-amber-500 to-amber-700 p-6 text-white shadow-lg transform transition hover:scale-105">
              <h3 className="text-xl font-semibold mb-2">Statistics Dashboard</h3>
              <p className="text-sm opacity-90">Visualize key statistics and metrics with dynamic charts and interactive data representations tailored to an avid NBA fan.</p>
            </div>

            <div className="rounded-xl bg-gradient-to-r from-amber-500 to-amber-700 p-6 text-white shadow-lg transform transition hover:scale-105">
              <h3 className="text-xl font-semibold mb-2">Game Predictions</h3>
              <p className="text-sm opacity-90">Get data-driven predictions for upcoming games based on historical data and advanced analytics.</p>
            </div>
            <p className="whitespace-nowrap">
              For more detailed information about the features, visit the <a href="/about" className="text-white font-bold underline">About</a> page.
            </p>
          </div>
        </Explanationcard>
      </main>
    </div>
  );
}
