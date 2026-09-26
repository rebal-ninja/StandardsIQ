import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import SearchStandards from './pages/SearchStandards';
import ScanTender from './pages/ScanTender';
import Recommendations from './pages/Recommendations';
import CompareStandards from './pages/CompareStandards';
import History from './pages/History';
import VerifyStandard from './pages/VerifyStandard';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public landing page — no sidebar layout */}
        <Route path="/landing" element={<LandingPage />} />

        {/* Application — sidebar layout wraps all inner pages */}
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/search" element={<SearchStandards />} />
          <Route path="/scan" element={<ScanTender />} />
          <Route path="/recommend" element={<Recommendations />} />
          <Route path="/compare" element={<CompareStandards />} />
          <Route path="/history" element={<History />} />
          <Route path="/verify" element={<VerifyStandard />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
