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
  icons: {
    icon: [
      { url: "/brand/logo-16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/logo-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/logo-48.png", sizes: "48x48", type: "image/png" },
    ],
    // The supplied artwork tops out at 48px, which is too small for a home-screen
    // icon — iOS renders these at 180px and Android at 192/512. Keeping the
    // vector placeholder there until a larger master (SVG, or >=512px) exists;
    // upscaling a 48px PNG would look worse than a clean generic mark.
    apple: "/icon.svg",
  },
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
