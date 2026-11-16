import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Providers from "@/components/Providers";
import AppShell from "@/components/AppShell";
import ServiceWorker from "@/components/ServiceWorker";

// Self-hosted, and now from files in the repo (src/app/fonts), not fetched
// from Google at all. next/font/google downloaded them at BUILD time, which
// broke production builds when Vercel's build CLI 65.14 stopped resolving
// them ("next/font/google queries have exactly one entry", Nov 2026). Files
// in the repo cannot fail that way. They are the Fontsource 5.3.0 variable
// cuts of the same fonts, latin subset (what the Google loader asked for),
// SIL Open Font License 1.1, licences beside them.
//
// Served from our own origin either way, which is what makes them work on the
// workshop connection and inside the offline shell. A CDN request here would
// be a blank page on a bad signal.
//
// Manrope carries the interface, Outfit carries display type. The pairing is
// Giov's and it is the single biggest reason their screens do not read as
// generated: system-ui is the default every generated interface reaches for,
// and it is most of why ours did.
//
// Variable fonts, so every weight the app uses (Manrope 400-800, Outfit
// 600-700) comes from one file each. Manrope at 500 is still the workhorse:
// it runs lighter than Inter, and body text at 400 on a white card in
// daylight goes thin.
const manrope = localFont({
  src: "./fonts/manrope-latin-variable.woff2",
  variable: "--font-sans",
  display: "swap",
  weight: "200 800",
  fallback: ["ui-sans-serif", "system-ui", "Segoe UI", "Arial", "sans-serif"],
});

const outfit = localFont({
  src: "./fonts/outfit-latin-variable.woff2",
  variable: "--font-display",
  display: "swap",
  weight: "100 900",
  fallback: ["ui-sans-serif", "system-ui", "Segoe UI", "Arial", "sans-serif"],
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
    // Home-screen icons are generated from the 80px master. A flat geometric
    // mark upscales acceptably, no gradients or fine detail to smear, and the
    // phone renders these at roughly 120-180px anyway. A ≥512px master or an SVG
    // would still be sharper; this is the best available from what exists.
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

// iOS shows a blank screen while a standalone web app boots unless it is handed
// an image matching the EXACT device viewport, it will not scale one for you,
// and a startup image with no media query is ignored outright. Sizes are CSS
// pixels (device pixels ÷ the pixel ratio). Android needs none of this: it
// builds its splash from the manifest's name, background_color and icon.
const IOS_SPLASH: { w: number; h: number; ratio: number; file: string }[] = [
  { w: 430, h: 932, ratio: 3, file: "1290x2796" }, // 14/15 Pro Max
  { w: 428, h: 926, ratio: 3, file: "1284x2778" }, // 12-14 Pro Max
  { w: 393, h: 852, ratio: 3, file: "1179x2556" }, // 14/15 Pro
  { w: 390, h: 844, ratio: 3, file: "1170x2532" }, // 12-14
  { w: 375, h: 812, ratio: 3, file: "1125x2436" }, // X / XS / 11 Pro
  { w: 414, h: 896, ratio: 2, file: "828x1792" },  // XR / 11
  { w: 375, h: 667, ratio: 2, file: "750x1334" },  // SE / 8
];

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
    <html lang="en" className={`${manrope.variable} ${outfit.variable} h-full antialiased`}>
      <head>
        {IOS_SPLASH.map((s) => (
          <link
            key={s.file}
            rel="apple-touch-startup-image"
            href={`/brand/splash/${s.file}.png`}
            media={`(device-width: ${s.w}px) and (device-height: ${s.h}px) and (-webkit-device-pixel-ratio: ${s.ratio}) and (orientation: portrait)`}
          />
        ))}
      </head>
      <body className="min-h-full bg-canvas text-ink-900 font-sans">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
        <ServiceWorker />
      </body>
    </html>
  );
}
