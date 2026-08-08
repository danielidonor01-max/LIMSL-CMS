import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import AppShell from "@/components/AppShell";
import ServiceWorker from "@/components/ServiceWorker";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "LIMSL CMS | Computerized Maintenance Management System",
  description: "Computerized Maintenance Management System (CMS) for Lee International Machinery and Services Limited (LIMSL).",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "LIMSL CMS", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

// Keeps the phone's status bar in the app's colour when installed to a home
// screen, and stops iOS zooming the layout on a field tap.
export const viewport: Viewport = {
  themeColor: "#059669",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full bg-slate-50 text-slate-900 font-sans">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
        <ServiceWorker />
      </body>
    </html>
  );
}
