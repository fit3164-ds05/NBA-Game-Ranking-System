import React from 'react';
import { NavLink, Link } from 'react-router-dom';

export default function Header({title}){
    const baseStyles = "px-4 py-2 rounded transition-colors duration-200";
    const activeStyles = "bg-gray-800 text-white"; // dark when active
    const inactiveStyles = "bg-amber-600 text-gray-800 hover:bg-gray-300"; // when inactive



        return (
    <header
      className="relative z-10 w-full max-w-7xl mx-auto mt-4
         flex justify-between items-center
         px-6 py-4
         bg-amber-600 text-white
         backdrop-blur-md shadow-lg
         rounded-2xl"
    >

      <h1 className="text-2xl font-bold">
        <Link to="/">NBA GAME RANKING SYSTEM</Link>
      </h1>

      <nav className="space-x-4">
        <NavLink to="/historicalratings"
        className={({isActive}) =>
        `${baseStyles} ${isActive ? activeStyles : inactiveStyles}`}
        >Historical Ratings</NavLink>

        <NavLink to="/dashboardhome"
        className={({isActive}) =>
        `${baseStyles} ${isActive ? activeStyles : inactiveStyles}`}
        >Statistics Dashboard</NavLink>

        <NavLink to="/gameprediction"
        className={({isActive}) =>
        `${baseStyles} ${isActive ? activeStyles : inactiveStyles}`}
        >Game Predictions</NavLink>

        <NavLink to="/about"
        className={({isActive}) =>
        `${baseStyles} ${isActive ? activeStyles : inactiveStyles}`}
        >About</NavLink>

        <NavLink to="/contact"
        className={({isActive}) =>
        `${baseStyles} ${isActive ? activeStyles : inactiveStyles}`}
        >Contact</NavLink>
      </nav>
    </header>
  )
};
