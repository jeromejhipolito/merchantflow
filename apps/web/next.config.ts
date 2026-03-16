import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@merchantflow/shared-types", "@merchantflow/shared-schemas"],
};

export default nextConfig;
