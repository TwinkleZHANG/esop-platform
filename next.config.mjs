/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js standalone 模式：产物自带最小 Node runtime，便于 Docker 发布
  output: "standalone",
};

export default nextConfig;
