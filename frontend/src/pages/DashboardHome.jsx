import { useState } from "react";
import PlayerDropdown from "../components/playerdropdown";

function DashboardHome() {
  return (
    <div className="w-screen overflow-x-hidden flex justify-center items-center min-h-screen p-6 bg-gray-100">
      <PlayerDropdown></PlayerDropdown>    
      </div>
  );
}


export default DashboardHome;
