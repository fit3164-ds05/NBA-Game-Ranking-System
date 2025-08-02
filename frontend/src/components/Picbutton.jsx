import React from "react";

export default function Picbutton({ title, imgSrc, onClick }) {
  return (
    <button
      onclick={onClick}
      className="w-full py-10 flex flex-col items-center justify-center bg-black text-white rounded-lg shadow-md hover:bg-blue-800 transition"
    >
      {imgSrc && <img src={imgSrc} alt={title} className="w-12 h-12 mb-2 h-full w-full" />}
      <span className="text-lg font-semibold">{title}</span>
    </button>
  );
}
