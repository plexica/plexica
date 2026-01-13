// apps/web/src/App.tsx

function App() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-primary-600 mb-4">Plexica</h1>
        <p className="text-lg text-muted-foreground mb-8">
          Cloud-native multi-tenant platform with plugin architecture
        </p>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">✅ React 18 + Vite + TypeScript</p>
          <p className="text-sm text-muted-foreground">✅ Tailwind CSS configured</p>
          <p className="text-sm text-muted-foreground">✅ API Client ready</p>
          <p className="text-sm text-muted-foreground">✅ Auth Store configured</p>
        </div>
        <div className="mt-8">
          <button className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">
            Get Started
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
