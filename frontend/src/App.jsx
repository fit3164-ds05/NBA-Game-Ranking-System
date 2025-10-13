import { useState, useEffect } from 'react';
import './index.css';
import Layout from './components/Layout';
import axios from 'axios';

import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import DashboardHome from './pages/DashboardHome';
import GamePrediction from './pages/GamePrediction';
import HistoricalRanking from './pages/HistoricalRanking';
import DashboardShotChart from './pages/DashboardShotChart';
import DriversofRatings from './pages/DriversofRatings';
import LeagueTrends from './pages/LeagueTrends';

function App() {

  return (
    <>
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/dashboardhome" element={<DashboardHome />} />
        <Route path="/gameprediction" element={<GamePrediction />} />
        <Route path="/historicalranking" element={<HistoricalRanking />} />
        <Route path="/dashboardshotchart" element={<DashboardShotChart />} />
        <Route path="/DriversofRatings" element={<DriversofRatings />} />
        <Route path="/LeagueTrends" element={<LeagueTrends />} />
      </Routes>
    </Layout>
    </>
  )
}

export default App
