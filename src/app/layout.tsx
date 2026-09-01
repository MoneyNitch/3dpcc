import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
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
  title: "3D-PCC – 3D-Druck Kostenrechner",
  description: "Lokaler Kostenrechner für 3D-Drucke auf Basis von .gcode.3mf Dateien",
};

// Applied before hydration so the correct theme is set with no flash of the wrong mode.
const themeInitScript = `
try {
  var stored = localStorage.getItem("theme");
  var theme = stored || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.classList.toggle("dark", theme === "dark");
} catch (e) {}
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
              <span className="text-orange-500">🧵</span> 3D-PCC
            </Link>
            <nav className="flex items-center gap-4 text-sm font-medium text-slate-600 dark:text-slate-300">
              <Link href="/" className="hover:text-orange-500">
                Drucke
              </Link>
              <Link href="/settings" className="hover:text-orange-500">
                Einstellungen
              </Link>
              <ThemeToggle />
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
