import { useState } from "react";
import PlayerDropdown from "../components/PlayerDropdown";

function DashboardHome() {
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  return (
    <div className="w-screen overflow-x-hidden flex flex-col items-center min-h-screen p-6 bg-gray-100 gap-6">

      {/* NBA Player Search Dropdown */}
      <div className="bg-white shadow p-4 rounded w-full max-w-2xl">
        <h2 className="text-lg font-semibold mb-4">NBA Player Search</h2>
        <PlayerDropdown onSelect={setSelectedPlayer} />

        {selectedPlayer && (
          <div className="mt-4 text-sm text-gray-700">
            <p>
              <strong>Selected:</strong> {selectedPlayer.name} ({selectedPlayer.team})
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default DashboardHome;
