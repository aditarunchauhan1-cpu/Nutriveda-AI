import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import LandingPage from "./pages/Landingpage";
import MainPage from "./pages/Mainpage";
import GuidePage from "./pages/GuidePage";
import AuthPage from "./pages/AuthPage";
import AdminPage from "./pages/AdminPage";
import { ProtectedRoute } from "./components/ProtectedRoute";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<ProtectedRoute><LandingPage /></ProtectedRoute>} />
        <Route path="/main" element={<ProtectedRoute><MainPage /></ProtectedRoute>} />
        <Route path="/advanced" element={<Navigate to="/main" replace />} />
        <Route path="/admin" element={<ProtectedRoute type="admin"><AdminPage /></ProtectedRoute>} />

        <Route path="/guide" element={<GuidePage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
