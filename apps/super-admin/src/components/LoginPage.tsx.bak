import { useState } from 'react';
import { Button, Card, CardContent, Input, Label } from '@plexica/ui';
import { AlertCircle } from 'lucide-react';

interface LoginPageProps {
  onLogin: (email: string, password: string) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState('admin@plexica.com');
  const [password, setPassword] = useState('admin');

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onLogin(email, password);
  };

  return (
    <div className="min-h-screen bg-muted flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex w-16 h-16 bg-primary rounded-lg items-center justify-center text-white font-bold text-2xl mb-4">
              P
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-1">Plexica Super Admin</h1>
            <p className="text-sm text-muted-foreground">Platform Management Console</p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="admin@plexica.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Enter your password"
              />
            </div>

            <Button type="submit" className="w-full">
              Sign In
            </Button>
          </form>

          {/* Demo Credentials */}
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-800 font-medium">Demo Credentials:</p>
            <p className="text-xs text-blue-700 mt-1">
              Email: <code className="bg-blue-100 px-1 rounded">admin@plexica.com</code>
              <br />
              Password: <code className="bg-blue-100 px-1 rounded">admin</code>
            </p>
          </div>

          {/* Note */}
          <div className="mt-6 flex gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              In production, this would integrate with Keycloak SSO
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
