import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Slutvival Panel",
    template: "%s · Slutvival Panel",
  },
  description:
    "A premium game server operating system for the Slutvival ecosystem.",
  applicationName: "Slutvival Panel",
};

export const viewport: Viewport = {
  themeColor: "#232026",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-background text-foreground">
        <TooltipProvider delay={200}>{children}</TooltipProvider>
        <Toaster
          position="bottom-right"
          richColors
          closeButton
          toastOptions={{ classNames: { toast: "rounded-xl" } }}
        />
      </body>
    </html>
  );
}
