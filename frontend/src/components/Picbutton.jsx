import React from "react";

const EYEBROW_CLASS = "text-s font-semibold uppercase tracking-[0.35em] text-amber-500";

export default function Picbutton({ title, onClick, icon, alt_text }) {
  return (
    <button
      onClick={onClick}
      className="w-full py-10 flex flex-col items-center justify-center bg-white rounded-lg shadow-md hover:bg-amber-50 transition cursor-pointer"
    >
      <img src={icon} alt={alt_text} className="w-20 h-20 mb-2" />
      <span className={`${EYEBROW_CLASS} text-center`}>{title}</span>
    </button>
  );
}
