import { Navigate } from 'react-router-dom';

export function ProtectedRoute({ type = 'user', children }) {
  const key = type === 'admin' ? 'adminToken' : 'authToken';
  return localStorage.getItem(key) ? children : <Navigate to="/auth" replace />;
}
