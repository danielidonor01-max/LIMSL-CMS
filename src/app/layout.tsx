import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "LIMSL CMS | Computerized Maintenance Management System",
  description: "Computerized Maintenance Management System (CMS) for Lee International Machinery and Services Limited (LIMSL).",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full bg-slate-950 text-slate-100 font-sans flex flex-col">
        {children}
      </body>
    </html>
  );
}
