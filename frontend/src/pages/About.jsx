import ShotChartD3 from "../components/ShotChartD3";

const dummyShots = [
  {
    action_type: "Driving Layup Shot",
    shot_type: "2PT Field Goal",
    shot_distance: 2,
    made: 1,
    period: 1,
    minutes_remaining: 8,
    seconds_remaining: 32,
    team_name: "Los Angeles Lakers",
    opponent: "Golden State Warriors",
    game_date: "20241115",
    x: -20,   // NBA LOC_X (left of basket)
    y: 25,    // NBA LOC_Y (toward top of halfcourt)
  },
  {
    action_type: "Pullup Jump Shot",
    shot_type: "3PT Field Goal",
    shot_distance: 24,
    made: 0,
    period: 1,
    minutes_remaining: 4,
    seconds_remaining: 58,
    team_name: "Los Angeles Lakers",
    opponent: "Golden State Warriors",
    game_date: "20241115",
    x: 210,
    y: 140,
  },
  {
    action_type: "Fadeaway Jump Shot",
    shot_type: "2PT Field Goal",
    shot_distance: 16,
    made: 1,
    period: 2,
    minutes_remaining: 7,
    seconds_remaining: 5,
    team_name: "Los Angeles Lakers",
    opponent: "Golden State Warriors",
    game_date: "20241115",
    x: 35,
    y: 120,
  },
  {
    action_type: "Turnaround Jump Shot",
    shot_type: "2PT Field Goal",
    shot_distance: 10,
    made: 0,
    period: 2,
    minutes_remaining: 2,
    seconds_remaining: 17,
    team_name: "Los Angeles Lakers",
    opponent: "Golden State Warriors",
    game_date: "20241115",
    x: -85,
    y: 55,
  },
  {
    action_type: "Step Back Jump Shot",
    shot_type: "3PT Field Goal",
    shot_distance: 27,
    made: 1,
    period: 3,
    minutes_remaining: 9,
    seconds_remaining: 48,
    team_name: "Los Angeles Lakers",
    opponent: "Golden State Warriors",
    game_date: "20241115",
    x: 180,
    y: 220,
  },
  {
    action_type: "Driving Dunk Shot",
    shot_type: "2PT Field Goal",
    shot_distance: 1,
    made: 1,
    period: 4,
    minutes_remaining: 5,
    seconds_remaining: 10,
    team_name: "Los Angeles Lakers",
    opponent: "Golden State Warriors",
    game_date: "20241115",
    x: -5,
    y: 10,
  },
  {
    action_type: "Catch and Shoot 3",
    shot_type: "3PT Field Goal",
    shot_distance: 23,
    made: 0,
    period: 4,
    minutes_remaining: 1,
    seconds_remaining: 42,
    team_name: "Los Angeles Lakers",
    opponent: "Golden State Warriors",
    game_date: "20241115",
    x: -190,
    y: 200,
  },
];

export default function About() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-slate-900">About this project</h1>
        <p className="text-sm text-slate-600">
          This demo renders a legacy D3 shot chart with static sample data so you can validate the
          script imports and rendering pipeline.
        </p>
      </header>

      <div className="rounded-2xl bg-slate-900 p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold text-white">Shot chart preview</h2>
        <ShotChartD3
          data={dummyShots}
          coordSystem="nba"
          width={720}
          title="Sample game: Lakers vs. Warriors"
          className="rounded-2xl bg-white"
          options={{
            hexagonBinVisibleThreshold: 0,
            hexagonRadiusThreshold: 0,
          }}
        />
      </div>
    </div>
  );
}
