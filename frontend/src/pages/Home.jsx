import Explanationcard from "../components/Explanationcard";
import Picbutton from "../components/Picbutton";
import { useNavigate } from "react-router-dom";
import Dash from "../../public/dashboard.svg";
import Stats from "../../public/stats.svg";
import Predictions from "../../public/predictions.svg";

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen">
      <div className="fixed inset-0 z-0 bg-home-nba bg-cover bg-center" />

      {/* foreground content */}
      <main className="relative z-10 w-full max-w-7xl mx-auto px-4 py-12 flex flex-col items-center">
        <h1 className="text-4xl font-extrabold text-center text-white mb-12">
          Welcome to the NBA Game Ranking System
        </h1>

        {/* three-button grid */}
        <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12 mt-70">
          <Picbutton
            title="Historical Ratings"
            onClick={() => navigate("/historicalranking")}
          />
          <Picbutton
            title="Statistics Dashboard"
            onClick={() => navigate("/dashboardhome")}
          />
          <Picbutton
            title="Game Predictions"
            onClick={() => navigate("/gameprediction")}
          />
        </div>

        {/* section divider */}
        <div className="w-full border-b-4 border-white mb-6"/>

        <Explanationcard title="Features" colour="amber-600">
          <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-6 mt-12">
            <div className="border-4 border-gray-400 rounded-lg p-4 flex flex-col items-center">
              <img src={Stats} alt="Stats icon" className="w-20 h-20 mb-2" />
              <p className="text-center font-semibold">Historical Ratings</p>
              <p> Writing about Historical Ratings </p>
            </div>

            <div className="border-4 border-gray-400 rounded-lg p-4 flex flex-col items-center">
              <img src={Dash} alt="Dashboard icon" className="w-20 h-20 mb-2" />
              <p className="text-center font-semibold">Statistics Dashboard</p>
              <p>Writing about Statistics Dashboard</p>
            </div>

            <div className="border-4 border-gray-400 rounded-lg p-4 flex flex-col items-center">
              <img src={Predictions} alt="Predictions icon" className="w-20 h-20 mb-2"/>
              <p className="text-center font-semibold">Predictions</p>
              <p>Writing about Predictions</p>
            </div>
          </div>
        </Explanationcard>
      </main>
    </div>
  );
}
