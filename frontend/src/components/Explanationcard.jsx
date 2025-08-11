import React from 'react';

export default function Explanationcard({ title, children }) {
  return (
    <article className="w-full bg-yellow-900/80 h-100 rounded-lg p-4 text-white">
      <h1 className="text-xl font-bold mb-2 ">{title}</h1>
      <div>{children}</div>
    </article>
  );
}
