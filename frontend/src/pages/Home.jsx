import { useState } from "react";
import Picbutton from "../components/Picbutton";
import { useNavigate } from "react-router-dom";
import Dash from "../../public/dashboard.svg";
import Stats from "../../public/stats.svg";
import Predictions from "../../public/predictions.svg";

export default function Home() {
  const navigate = useNavigate();
  const [darkMode, setDarkMode] = useState(false);

  const lightTheme = {
    pageBg: "from-slate-50 via-slate-100 to-slate-200",
    text: "text-slate-700",
    heroSurface: "rounded-[40px] border border-slate-200/80 bg-white/70 shadow-xl backdrop-blur",
    heroAccent: "text-amber-600",
    heroTitle: "text-slate-900",
    heroBody: "text-slate-600",
    badge: "bg-amber-100 text-amber-700",
    ctaPrimary: "bg-amber-500 text-white hover:bg-amber-600",
    ctaSecondary: "bg-white/80 text-slate-700 border border-slate-300 hover:bg-white",
    tileSurface: "rounded-3xl border border-slate-200/80 bg-white/60 shadow-md backdrop-blur hover:shadow-xl",
    cardBody: "text-slate-500",
    divider: "bg-gradient-to-r from-transparent via-slate-300 to-transparent",
    highlightSurface: "rounded-[36px] border border-slate-200/70 bg-white/60 shadow-lg backdrop-blur",
    highlightTitle: "text-slate-900",
    highlightBody: "text-slate-600",
    featureCard: "rounded-3xl border border-slate-200/70 bg-white/60 shadow-sm backdrop-blur hover:shadow-lg",
    featureTitle: "text-slate-900",
    featureBody: "text-slate-600",
    featureText: "text-slate-500",
    featureLink: "text-amber-600",
    toggle: "border border-slate-300 bg-white/80 text-slate-700 hover:bg-white",
    outroText: "text-slate-500",
  };

  const darkTheme = {
    pageBg: "from-slate-950 via-slate-900 to-slate-800",
    text: "text-slate-100",
    heroSurface: "rounded-[40px] border border-slate-700/60 bg-slate-900/70 shadow-2xl backdrop-blur",
    heroAccent: "text-amber-300",
    heroTitle: "text-white",
    heroBody: "text-slate-200",
    badge: "bg-amber-500/30 text-amber-100",
    ctaPrimary: "bg-amber-500 text-slate-900 hover:bg-amber-400",
    ctaSecondary: "bg-slate-900/60 text-slate-100 border border-slate-600 hover:bg-slate-800",
    tileSurface: "rounded-3xl border border-slate-700/60 bg-slate-900/60 shadow-lg backdrop-blur hover:shadow-2xl",
    cardBody: "text-slate-300",
    divider: "bg-gradient-to-r from-transparent via-slate-600/60 to-transparent",
    highlightSurface: "rounded-[36px] border border-slate-700/60 bg-slate-900/60 shadow-xl backdrop-blur",
    highlightTitle: "text-white",
    highlightBody: "text-slate-200",
    featureCard: "rounded-3xl border border-slate-700/60 bg-slate-900/60 shadow-md backdrop-blur hover:shadow-xl",
    featureTitle: "text-slate-50",
    featureBody: "text-slate-300",
    featureText: "text-slate-400",
    featureLink: "text-amber-200",
    toggle: "border border-slate-700 bg-slate-900/80 text-amber-200 hover:bg-slate-800",
    outroText: "text-slate-400",
  };

  const theme = darkMode ? darkTheme : lightTheme;
  const tileBase = "p-6 transition-transform duration-300 ease-out hover:-translate-y-2";
  const featureBase = "p-7 transition-transform duration-300 ease-out hover:-translate-y-2";
  const toggleLabel = darkMode ? "Light mode" : "Dark mode";

  return (
    <div className={`relative isolate min-h-screen overflow-hidden bg-gradient-to-br ${theme.pageBg}`}>
      <div
        className="pointer-events-none fixed inset-0 -z-10 opacity-95"
        aria-hidden
        style={{
          backgroundImage: [
            "linear-gradient(180deg, rgba(15,23,42,0.6), rgba(15,23,42,0.12))",
            "radial-gradient(circle at top left, rgba(253,230,138,0.35), transparent 58%)",
            "radial-gradient(circle at bottom right, rgba(253,230,138,0.25), transparent 55%)",
            "repeating-linear-gradient(135deg, rgba(148,163,184,0.24) 0, rgba(148,163,184,0.24) 2px, transparent 2px, transparent 14px)"
          ].join(","),
          backgroundBlendMode: "overlay, screen, screen, normal",
          backgroundSize: "cover, 120% 120%, 110% 110%, 160px 160px",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat, no-repeat, no-repeat, repeat",
        }}
      />

      <main className={`relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center px-4 pb-24 pt-16 ${theme.text}`}>
        <header className="flex w-full items-center justify-between gap-6">
          <div className="text-sm uppercase tracking-[0.3em] text-amber-500">NBA Data Dribble</div>
          <button
            type="button"
            onClick={() => setDarkMode((prev) => !prev)}
            aria-pressed={darkMode}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${theme.toggle}`}
          >
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${darkMode ? "bg-amber-300" : "bg-amber-500"}`} />
            {toggleLabel}
          </button>
        </header>

        <section className={`relative mt-16 w-full px-6 lg:px-10 py-16 ${theme.heroSurface}`}>
          <div className="absolute inset-y-0 right-[-20%] hidden w-1/2 rounded-full bg-gradient-to-br from-amber-400/40 via-amber-200/10 to-transparent blur-3xl sm:block" aria-hidden />
          <div className="max-w-xl space-y-6">
            <span className={`inline-block rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-wider ${theme.badge}`}>
              Amber. Grey. Precision.
            </span>
            <h1 className={`text-5xl font-semibold leading-tight sm:text-6xl ${theme.heroTitle}`}>
              Analytics crafted with an Apple-like calm and NBA-level intensity.
            </h1>
            <p className={`text-lg sm:text-xl ${theme.heroBody}`}>
              Build narratives, surface trends, and predict outcomes through a composed, cinematic experience inspired by the best product storytelling on the web.
            </p>
            <div className="flex flex-wrap gap-4 pt-4">
              <button
                type="button"
                onClick={() => navigate("/dashboardhome")}
                className={`rounded-full px-6 py-3 text-sm font-semibold shadow-md transition ${theme.ctaPrimary}`}
              >
                Explore the Dashboard
              </button>
              <button
                type="button"
                onClick={() => navigate("/historicalranking")}
                className={`rounded-full px-6 py-3 text-sm font-semibold transition ${theme.ctaSecondary}`}
              >
                View Historical Ratings
              </button>
            </div>
          </div>
        </section>

        <section className="mt-20 w-full">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
            <div className={`${tileBase} ${theme.tileSurface}`}>
              <Picbutton
                title="Historical Ratings"
                onClick={() => navigate("/historicalranking")}
                icon={Stats}
                alt_text="Stats icon"
              />
              <p className={`mt-6 text-sm ${theme.cardBody}`}>
                Follow every era, every roster move, every breakout season with a few crisp taps.
              </p>
            </div>
            <div className={`${tileBase} ${theme.tileSurface}`}>
              <Picbutton
                title="Statistics Dashboard"
                onClick={() => navigate("/dashboardhome")}
                icon={Dash}
                alt_text="Dashboard icon"
              />
              <p className={`mt-6 text-sm ${theme.cardBody}`}>
                Live charts and refined metrics that keep you a step ahead of the conversation.
              </p>
            </div>
            <div className={`${tileBase} ${theme.tileSurface}`}>
              <Picbutton
                title="Game Predictions"
                onClick={() => navigate("/gameprediction")}
                icon={Predictions}
                alt_text="Predictions icon"
              />
              <p className={`mt-6 text-sm ${theme.cardBody}`}>
                Project the next statement win with context from decades of matchups.
              </p>
            </div>
          </div>
        </section>

        <section className={`mt-24 w-full px-6 lg:px-10 py-14 ${theme.highlightSurface}`}>
          <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div className="space-y-6">
              <h2 className={`text-4xl font-semibold sm:text-5xl ${theme.highlightTitle}`}>
                Flow from big-picture clarity to precise shot charts in seconds.
              </h2>
              <p className={`text-lg ${theme.highlightBody}`}>
                Zero clutter, maximum signal. The amber glow highlights action; the neutral greys keep focus locked on insight.
              </p>
              <div className="flex flex-wrap gap-4">
                <button
                  type="button"
                  onClick={() => navigate("/gameprediction")}
                  className={`rounded-full px-6 py-3 text-sm font-semibold transition ${theme.ctaSecondary}`}
                >
                  Try game predictions
                </button>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className={`${featureBase} ${theme.featureCard}`}>
                <p className="text-xs uppercase tracking-[0.2em] text-amber-400">Realtime context</p>
                <h3 className={`mt-4 text-xl font-semibold ${theme.featureTitle}`}>Shot charts, elevated</h3>
                <p className={`mt-3 text-sm ${theme.featureBody}`}>
                  Court renders with ambient lighting pull you into the story while staying tactically sharp.
                </p>
              </div>
              <div className={`${featureBase} ${theme.featureCard}`}>
                <p className="text-xs uppercase tracking-[0.2em] text-amber-400">Stress-free UI</p>
                <h3 className={`mt-4 text-xl font-semibold ${theme.featureTitle}`}>Made for long sessions</h3>
                <p className={`mt-3 text-sm ${theme.featureBody}`}>
                  Switch between light and dark instantly to match your environment and focus window.
                </p>
              </div>
            </div>
          </div>
        </section>

        <div className={`mt-24 h-px w-full ${theme.divider}`} />

        <section className="mt-16 w-full">
          <div className="space-y-10">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.3em] text-amber-400">Features</p>
              <h2 className={`text-3xl font-semibold sm:text-4xl ${theme.highlightTitle}`}>
                Everything you need to explore the league without distraction.
              </h2>
            </div>
            <div className="grid gap-8 text-left sm:grid-cols-2">
              <div className={`${featureBase} ${theme.featureCard}`}>
                <h3 className={`text-xl font-semibold ${theme.featureTitle}`}>Historical Ratings</h3>
                <p className={`mt-3 text-sm ${theme.featureBody}`}>
                  Trace legendary franchises and overlooked rotations alike with continuous season-by-season indexing.
                </p>
              </div>
              <div className={`${featureBase} ${theme.featureCard}`}>
                <h3 className={`text-xl font-semibold ${theme.featureTitle}`}>Statistics Dashboard</h3>
                <p className={`mt-3 text-sm ${theme.featureBody}`}>
                  Dynamic visuals adapt to every measure so you can move from scouting to storytelling without friction.
                </p>
              </div>
              <div className={`${featureBase} ${theme.featureCard}`}>
                <h3 className={`text-xl font-semibold ${theme.featureTitle}`}>Game Predictions</h3>
                <p className={`mt-3 text-sm ${theme.featureBody}`}>
                  Blend machine learning outputs with clean design cues to evaluate matchups at a glance.
                </p>
              </div>
              <div className={`${featureBase} ${theme.featureCard}`}>
                <h3 className={`text-xl font-semibold ${theme.featureTitle}`}>Built for exploration</h3>
                <p className={`mt-3 text-sm ${theme.featureBody}`}>
                  Responsive layouts, crisp typography, and ambient gradients echo the polish of Cupertino favorites.
                </p>
              </div>
              <p className={`sm:col-span-2 text-sm ${theme.featureText}`}>
                For a deeper dive into every module, visit the {" "}
                <a href="/about" className={`font-semibold underline-offset-4 hover:underline ${theme.featureLink}`}>
                  About
                </a>{" "}
                page.
              </p>
            </div>
          </div>
        </section>

        <footer className={`mt-20 text-center text-xs uppercase tracking-[0.35em] ${theme.outroText}`}>
          Crafted for hoop minds who appreciate premium product design.
        </footer>
      </main>
    </div>
  );
}
