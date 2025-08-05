import React from "react";

export default function Picbutton({ title, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full py-10 flex flex-col items-center justify-center bg-black text-white rounded-lg shadow-md hover:bg-blue-800 transition"
    >      <span className="text-lg font-semibold">{title}</span>
    </button>
  );
}
