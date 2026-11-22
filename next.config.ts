import type { NextConfig } from "next";
import packageJson from "./package.json";
import engineVersion from "./engine/ENGINE_VERSION.json";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
    NEXT_PUBLIC_ENGINE_VERSION: engineVersion,
  },
  output: 'export',  // This tells Next.js to generate static files
  images: {
    unoptimized: true,  // Disable image optimization for static export
  },
};

export default nextConfig;
