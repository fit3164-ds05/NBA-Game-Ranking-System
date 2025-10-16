import React from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import logo from '../assets/Data-Dribble-Logo-no-bg.png';

export default function Header({title}){
    const baseStyles = "px-4 py-2 rounded-full transition-colors duration-200";
    const activeStyles = "bg-gray-800 text-white"; // dark when active
    const inactiveStyles = "bg-amber-600 text-gray-800 hover:bg-amber-500"; // when inactive

    const location = useLocation();
    const normalizedPath = location.pathname.toLowerCase();
    const statisticsPaths = [
        "/dashboardhome",
        "/dashboardshotchart",
        "/driversofratings",
        "/leaguetrends"
    ];
    const isStatisticsActive = statisticsPaths.includes(normalizedPath);


        return (
<header
  className="sticky top-3 z-50 mx-10 flex items-center justify-between
             px-10 py-4 bg-gray-300/30 text-white
             backdrop-blur-md shadow-lg pointer-events-auto rounded-lg"
>

      <h1 className="text-2xl font-bold text-gray-800">
        <Link to="/" className="flex items-center gap-3">
          <img
            src= {logo}
            alt="NBA Data Dribble Logo"
            className="h-10 w-10"
          />
          <span>NBA DATA DRIBBLE</span>
        </Link>
      </h1>

      <nav className="space-x-4">
        <NavLink to="/historicalranking"
        className={({isActive}) =>
        `${baseStyles} ${isActive ? activeStyles : inactiveStyles}`}
        >Historical Ratings</NavLink>

        <NavLink to="/dashboardhome"
        className={() =>
        `${baseStyles} ${isStatisticsActive ? activeStyles : inactiveStyles}`}
        >Statistics Dashboard</NavLink>

        <NavLink to="/gameprediction"
        className={({isActive}) =>
        `${baseStyles} ${isActive ? activeStyles : inactiveStyles}`}
        >Game Predictions</NavLink>


      </nav>
    </header>
  )
};
