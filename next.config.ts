import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  serverExternalPackages: ["nodemailer", "pdfjs-dist", "@napi-rs/canvas"],
};

export default nextConfig;
