import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';

import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import IncidentsList from './pages/IncidentsList';
import IncidentDetail from './pages/IncidentDetail';
import LogsExplorer from './pages/LogsExplorer';
import AdminPage from './pages/AdminPage';
import { AuthProvider, ProtectedRoute } from './AuthContext';
import { NavProvider } from './NavContext';

export default function App() {
  return (
    <AuthProvider>
      <NavProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/incidents" element={<ProtectedRoute><IncidentsList /></ProtectedRoute>} />
            <Route path="/incidents/:id" element={<ProtectedRoute><IncidentDetail /></ProtectedRoute>} />
            <Route path="/logs" element={<ProtectedRoute><LogsExplorer /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </NavProvider>
    </AuthProvider>
  );
}
