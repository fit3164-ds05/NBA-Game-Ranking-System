import React from 'react';
import Header from './Header'

export default function Layout({ children }) {
  return (
    <div className="min-h-screen p-0 m-0 w-full bg-[#E0E0E0]">
      <Header title="NBA GAME RANKING SYSTEM" />
      <main className="p-8">
        {children}
      </main>
    </div>
  );
}

// E0E0E0