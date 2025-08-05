import Picbutton from "../components/Picbutton";
import { useNavigate } from "react-router-dom";

export default function Home() {
  const navigate = useNavigate();

  return (
     <div className="relative min-h-screen">

      <div className="fixed inset-0 z-0 bg-home-hero bg-cover bg-center" />

      {/* foreground content */}
      <main className="relative z-10 w-full max-w-7xl mx-auto px-4 py-12 flex flex-col items-center">
        <h1 className="text-4xl font-extrabold text-center text-black mb-12">
          Welcome to the NBA Game Ranking System
        </h1>

        {/* three-button grid */}
        <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
          <Picbutton
            title="Historical Ratings"
            onClick={() => navigate('/historicalranking')}
          />
          <Picbutton
            title="Statistics Dashboard"
            onClick={() => navigate('/dashboardhome')}
          />
          <Picbutton
            title="Game Predictions"
            onClick={() => navigate('/gameprediction')}
          />
        </div>

        {/* section divider */}
        <div className="w-full border-b-4 border-white mb-6" />

        <h2 className="text-3xl font-bold text-white mb-4">Features</h2>
      </main>
    </div>
  );
}
