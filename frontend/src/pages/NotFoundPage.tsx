export function NotFoundPage() {
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center space-y-4">
        <h1 className="text-6xl font-bold text-accent">404</h1>
        <p className="text-text-secondary text-lg">Page not found</p>
        <a
          href="/"
          className="inline-block px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
        >
          Back to Simulator
        </a>
      </div>
    </div>
  );
}
