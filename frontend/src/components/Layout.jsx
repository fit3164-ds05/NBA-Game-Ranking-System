import React from 'react';
import Header from './Header'

export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="NBA DATA DRIBBLE" />
      <main className="p-8">
        {children}
      </main>
    </div>
  );
}

// E0E0E0