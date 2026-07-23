/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // three ships untranspiled ESM; let Next transpile it for the server bundle.
  transpilePackages: ['three'],
};

export default nextConfig;
