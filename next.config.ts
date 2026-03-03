import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Supabase Storage
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      // Google AI / Gemini generated images
      {
        protocol: "https",
        hostname: "generativelanguage.googleapis.com",
      },
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
      },
    ],
  },
};

export default nextConfig;
