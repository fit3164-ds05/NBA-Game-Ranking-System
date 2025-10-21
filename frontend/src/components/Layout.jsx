import React from 'react';
import Header from './Header'
import Footer from './Footer';

export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-gray-100">
      <Header title="NBA DATA DRIBBLE" />
      <main className="w-full px-6 py-8 sm:px-10">
        {children}
      </main>
      <Footer></Footer>
    </div>
  );
}
