import { Link } from "@tanstack/react-router";

export function SiteNav() {
  return (
    <header className="sticky top-0 z-50 border-b-2 border-foreground bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center border-2 border-primary bg-primary font-display text-lg text-primary-foreground">
            G
          </span>
          <span className="font-display text-xl tracking-wide sm:text-2xl">GUARDIAN</span>
          <span className="label-tag hidden text-muted-foreground sm:inline-block">
            MCP Governance Gateway
          </span>
        </Link>

        <nav className="flex items-center gap-3 text-xs sm:gap-6 sm:text-sm">
          <a href="/#threat" className="hidden font-semibold uppercase tracking-widest hover:text-primary sm:inline">
            The Threat
          </a>
          <a href="/#how" className="hidden font-semibold uppercase tracking-widest hover:text-primary sm:inline">
            How It Works
          </a>
          <a href="/#powers" className="hidden font-semibold uppercase tracking-widest hover:text-primary sm:inline">
            Powers
          </a>
          <Link
            to="/demo"
            className="border-2 border-primary bg-primary px-3 py-2 font-display text-xs uppercase tracking-widest text-primary-foreground hover:bg-background hover:text-primary sm:px-4 sm:text-sm"
          >
            Live Demo
          </Link>
        </nav>
      </div>
    </header>
  );
}
