import Picbutton from "../components/Picbutton";
import { useNavigate } from "react-router-dom";

export default function Home() {
  const navigate = useNavigate();

  return (
    <div>
      <h1 className="text-4xl font-bold text-center mb-8">
        Welcome to the NBA GAME RANKING SYSTEM
      </h1>
      <div className="grid grid-cols-3 gap-4">
        <Picbutton
          title="Historical Ratings"
          imgSrc="/placeholder.png"
          onClick={() => navigate("/about")}
        ></Picbutton>
        <Picbutton
          title="Statistics Dashboard"
          imgSrc="/placeholder.png"
          onClick={() => navigate("/about")}
        ></Picbutton>
        <Picbutton
          title="Game Predictions"
          imgSrc="/placeholder.png"
          onClick={() => navigate("/about")}
        ></Picbutton>
      </div>
      <div className="w-full border-b-4 border-black mt-8 mb-8 pb-2">
        <h2 className="text-3xl font-bold text-black">
          Features
        </h2>
      </div>
    </div>
  );
}
