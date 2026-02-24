import thycloneLogo from "@/assets/thyclone-logo.png";

export function Footer() {
  return (
    <footer className="w-full border-t border-border bg-background py-6 mt-auto">
      <div className="container flex flex-col sm:flex-row items-center justify-center gap-2 text-sm text-muted-foreground">
        <span>A project by</span>
        <a
          href="https://www.thycl.one"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary font-medium hover:underline transition-colors"
        >
          Thyclone
        </a>
      </div>
    </footer>
  );
}
