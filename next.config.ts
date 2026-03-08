import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  env: {
    // Expose Vercel's deployment URL so client code can build correct redirect URLs.
    // VERCEL_URL is set automatically by Vercel for every deployment (preview + production).
    NEXT_PUBLIC_VERCEL_URL: process.env.VERCEL_URL,
  },
};

export default nextConfig;
