import { Link, useLocation } from "react-router-dom";
import { LayoutGrid, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import thycloneLogo from "@/assets/thyclone-logo.png";

export function Header() {
  const location = useLocation();

  const navItems = [
    { href: "/", label: "Workspace", icon: LayoutGrid, isWorkspace: true },
    { href: "/about", label: "About", icon: Info, isWorkspace: false },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between">
        {/* Left side: App name + navigation */}
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <span className="text-lg font-bold text-foreground">Comparator & Endpoint Finder</span>
          </Link>

          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                    item.isWorkspace && isActive
                      ? "bg-primary/20 text-primary border border-primary/30"
                      : isActive
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right side: Thyclone branding */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="hidden sm:inline">An experimental project by</span>
          <a
            href="https://www.thycl.one"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:opacity-70 transition-opacity"
          >
            <img
              src={thycloneLogo}
              alt="Thyclone"
              className="h-5 w-auto dark:invert"
            />
          </a>
        </div>
      </div>
    </header>
  );
}
