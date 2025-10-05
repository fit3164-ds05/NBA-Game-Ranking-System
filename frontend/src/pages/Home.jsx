import Picbutton from "../components/Picbutton";
import FloatingCard from "../components/FloatingCard";
import { useNavigate } from "react-router-dom";
import Dash from "../../public/dashboard.svg";
import Stats from "../../public/stats.svg";
import Predictions from "../../public/predictions.svg";

export default function Home() {
  const navigate = useNavigate();
  const theme = {
    text: "text-slate-800",
    badge: "bg-amber-100 text-amber-700",
    heroAccent: "text-amber-600",
    heroTitle: "text-slate-900",
    heroBody: "text-slate-600",
    ctaPrimary: "bg-amber-500 text-white hover:bg-amber-600",
    ctaSecondary: "border border-slate-300 text-slate-700 hover:bg-white",
    highlightTitle: "text-slate-900",
    highlightBody: "text-slate-600",
    featureText: "text-slate-500",
    featureLink: "text-amber-600",
    outroText: "text-slate-500",
  };

  const tileBase =
    "flex h-full flex-col gap-6 rounded-[28px] bg-white p-6 shadow-[0_20px_50px_-30px rgba(15,23,42,0.25)] transition-transform duration-300 ease-out hover:-translate-y-2";
  const featureBase =
    "rounded-[28px] bg-white p-7 shadow-[0_20px_50px_-30px rgba(15,23,42,0.25)]";


  return (
    <main className={`flex w-full flex-col items-center px-8 pb-12 pt-16 ${theme.text}`}>
      <section className="relative mt-0 w-full px-2 sm:px-6">
        <div className="max-w-2xl space-y-3 justify-center text-center mx-auto">
          <h1 className={`text-5xl font-semibold leading-tight sm:text-6xl justify-center ${theme.heroTitle}`}>
            NBA Analytics and Predictions, Refined.
          </h1>
          <p className={`text-lg sm:text-xl ${theme.heroBody}`}>
            Harnessing algorithms and data science methodologies to uncover hidden patterns and reimagine how we rank and predict NBA matchups.
          </p>
        </div>
      </section>

      <section className="mt-20 w-full px-2 sm:px-6">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          <div className={tileBase}>
            <Picbutton
              title="Historical Ratings"
              onClick={() => navigate("/historicalranking")}
              icon={Stats}
              alt_text="Stats icon"
            />
            <p className="text-sm text-slate-500">
              Follow every era, every roster move, every breakout season with a few crisp taps.
            </p>
          </div>

          <div className={tileBase}>
            <Picbutton
              title="Statistics Dashboard"
              onClick={() => navigate("/dashboardhome")}
              icon={Dash}
              alt_text="Dashboard icon"
            />
            <p className="text-sm text-slate-500">
              Live charts and refined metrics that keep you a step ahead of the conversation.
            </p>
          </div>

          <div className={tileBase}>
            <Picbutton
              title="Game Predictions"
              onClick={() => navigate("/gameprediction")}
              icon={Predictions}
              alt_text="Predictions icon"
            />
            <p className="text-sm text-slate-500">
              Project the next statement win with context from decades of matchups.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-24 w-full px-2 sm:px-6">
        <div className="space-y-16 bg-slate-50 p-10">
          <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div className="space-y-6">
              <h2 className={`text-4xl font-semibold sm:text-5xl ${theme.highlightTitle}`}>
                Flow from big-picture Rankings to precise shot charts in seconds.
              </h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FloatingCard
                tone="light"
                className={featureBase}
                padding="p-7"
                title="Shot charts, elevated"
                titleSize="text-s"
                body="Court renders with ambient lighting pull you into the story while staying tactically sharp."
                bodySize="text-sm"
              />
              <FloatingCard
                tone="light"
                className={featureBase}
                padding="p-7"
                title="Made for long sessions"
                titleSize="text-s"
                body="Switch between light and dark instantly to match your environment and focus window."
                bodySize="text-sm"
              />
            </div>
          </div>
          </div>
      </section>

      <footer className={`mt-20 px-2 text-center text-xs uppercase tracking-[0.35em] ${theme.outroText}`}>
        Crafted for hoop minds with an eye for detail
      </footer>
    </main>
  );
}
