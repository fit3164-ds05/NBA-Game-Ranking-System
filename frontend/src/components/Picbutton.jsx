import React from "react";

const EYEBROW_CLASS =
  "text-s font-semibold uppercase tracking-[0.35em] text-amber-500";

export default function Picbutton({
  title,
  onClick,
  icon,
  alt_text,
  description,
  className = "",
}) {
  const baseClass =
    "w-full py-10 flex flex-col items-center justify-center bg-white rounded-lg shadow-md hover:bg-amber-50 transition cursor-pointer";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${baseClass} ${className}`.trim()}
    >
      <img src={icon} alt={alt_text} className="mb-2 h-20 w-20" />
      <span className={`${EYEBROW_CLASS} text-center`}>{title}</span>
      {description ? (
        <p className="mt-3 max-w-xs text-center text-sm text-slate-500">
          {description}
        </p>
      ) : null}
    </button>
  );
}
