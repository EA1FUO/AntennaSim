export function AboutPage() {
  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center justify-between px-4 h-12 border-b border-border bg-surface shrink-0">
        <div className="flex items-center gap-2">
          <a href="/" className="text-accent font-bold text-lg tracking-tight">
            AntSim
          </a>
        </div>
        <nav className="flex items-center gap-4 text-sm">
          <a href="/" className="text-text-secondary hover:text-accent transition-colors">
            Simulator
          </a>
          <a href="/about" className="text-text-primary hover:text-accent transition-colors">
            About
          </a>
        </nav>
      </header>

      <main className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-lg space-y-4">
          <h1 className="text-3xl font-bold">About AntSim</h1>
          <p className="text-text-secondary">
            AntSim is a modern, free web-based antenna simulator powered by the
            NEC2 engine. It replaces outdated desktop tools like MMANA-GAL,
            4NEC2, and EZNEC with a beautiful, accessible web experience.
          </p>
          <p className="text-text-secondary">
            Works on any device — no installs, no Wine, no Java.
          </p>
          <p className="text-text-secondary text-sm">
            License: GPL-3.0 | Engine: nec2c
          </p>
        </div>
      </main>
    </div>
  );
}
