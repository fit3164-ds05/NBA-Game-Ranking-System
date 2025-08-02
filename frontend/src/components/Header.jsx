import React from 'react';
import { Link } from 'react-router-dom';

export default function Header({title}){
        return (
    <header
      className="
        text-white
        w-full
        bg-blue-800
        px-6
        py-4
        flex
        justify-between
        items-center
      "
    >
      <h1 className="text-2xl font-bold">{title}</h1>
      <nav className="space-x-4">
        <nav className="space-x-4">
        <Link to="/" className="hover:underline">Home</Link>
        <Link to="/about" className="hover:underline">About</Link>
        <Link to="/contact" className="hover:underline">Contact</Link>
        </nav>
      </nav>
    </header>
  )
};
