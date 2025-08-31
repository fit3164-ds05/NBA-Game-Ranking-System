import React from "react";

export default function Picbutton({ title, onClick, icon, alt_text }) {
  return (
    <button
      onClick={onClick}
      className="w-full py-10 flex flex-col items-center justify-center bg-white text-white rounded-lg shadow-md hover:bg-amber-600 transition"
    >
      <img src={icon} alt={alt_text} className="w-20 h-20 mb-2" />
      <span className="text-lg font-semibold text-black">{title}</span>
    </button>
  );
}
