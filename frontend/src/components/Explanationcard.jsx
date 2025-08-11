import React from 'react';

export default function Explanationcard({ title, colour }) {
  return (
    <article className={`w-full bg-${colour} h-100 rounded-lg p-4 text-white`}>
      <h1 className="text-4xl font-bold mb-2 text-center font-sans">{title}</h1>
    </article>
  );
}
