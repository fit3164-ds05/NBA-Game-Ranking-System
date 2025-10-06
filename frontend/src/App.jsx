import { useState, useEffect } from 'react';
import './index.css';
import Layout from './components/Layout';
import axios from 'axios';

import { Routes, Route } from 'react-router-dom';
import About from './pages/About';
import Home from './pages/Home';
import Contact from './pages/Contact'
import DashboardHome from './pages/DashboardHome';
import GamePrediction from './pages/GamePrediction';
import HistoricalRanking from './pages/HistoricalRanking';
import DashboardShotChart from './pages/DashboardShotChart';
import Dashboardfeature2 from './pages/Dashboardfeature2';
import Dashboardfeature3 from './pages/Dashboardfeature3';

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
        <Route path="/dashboardshotchart" element={<DashboardShotChart />} />
        <Route path="/dashboardfeature2" element={<Dashboardfeature2 />} />
        <Route path="/dashboardfeature3" element={<Dashboardfeature3 />} />
      </Routes>
    </Layout>
    </>
  )
}

export default App
