import { useState } from 'react';
import { LoginPage } from './LoginPage';
import { AppContent } from './AppContent';

export function AuthWrapper() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    // Check if user is authenticated (simple localStorage check)
    return localStorage.getItem('super-admin-auth') === 'true';
  });

  const handleLogin = (email: string, password: string) => {
    // Simple mock authentication
    // In production, this would integrate with Keycloak
    if (email === 'admin@plexica.com' && password === 'admin') {
      localStorage.setItem('super-admin-auth', 'true');
      localStorage.setItem('super-admin-email', email);
      setIsAuthenticated(true);
    } else {
      alert('Invalid credentials. Use: admin@plexica.com / admin');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('super-admin-auth');
    localStorage.removeItem('super-admin-email');
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return <AppContent onLogout={handleLogout} />;
}
