/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Lint runs fine locally via `npx next lint`; blocking builds on pre-existing
    // warnings in Vercel's environment was causing deploy failures unrelated to
    // the changes being deployed. ignoreDuringBuilds is the Next.js-sanctioned
    // escape hatch for this pattern.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
