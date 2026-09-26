import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import SearchStandards from './pages/SearchStandards';
import Recommendations from './pages/Recommendations';
import ScanTender from './pages/ScanTender';
import Compare from './pages/Compare';
import History from './pages/History';
import Verify from './pages/Verify';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="search" element={<SearchStandards />} />
          <Route path="recommend" element={<Recommendations />} />
          <Route path="scan" element={<ScanTender />} />
          <Route path="compare" element={<Compare />} />
          <Route path="history" element={<History />} />
          <Route path="verify" element={<Verify />} />
          {/* Catch-all → Dashboard */}
          <Route path="*" element={<Dashboard />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
