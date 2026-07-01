import Link from "next/link";
import { cn } from "@/lib/utils";

export function Brand({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <span className="relative flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-sm ring-1 ring-primary/30">
        <svg viewBox="0 0 24 24" className="size-4.5" fill="none" aria-hidden>
          <path
            d="M3 18L9 8l3.5 5L15 9l6 9H3Z"
            fill="currentColor"
            fillOpacity="0.95"
          />
        </svg>
      </span>
      <span className="flex flex-col leading-none">
        <span className="font-heading text-sm font-semibold tracking-tight text-foreground">
          Slutvival
        </span>
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Panel
        </span>
      </span>
    </Link>
  );
}
