import { useState } from 'react'
import './index.css'
import Layout from './components/Layout'

import { Routes, Route } from 'react-router-dom';
import About from './pages/About';
import Home from './pages/Home';
import Contact from './pages/Contact'
import DashboardHome from './pages/DashboardHome';
import GamePrediction from './pages/GamePrediction';
import HistoricalRanking from './pages/HistoricalRanking';

function App() {
  return (
    <>
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/dashboardhome" element={<DashboardHome />} />
        <Route path="/gameprediction" element={<GamePrediction />} />
        <Route path="/historicalranking" element={<HistoricalRanking />} />
      </Routes>
    </Layout>
    </>
  )
}

export default App
