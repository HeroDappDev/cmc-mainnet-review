/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.CMC_DEV_MODE === "1" ? ".next-dev" : ".next",
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false, crypto: false };
    
    // Ignore Coinbase CDP SDK missing dependencies by mapping them to false
    config.resolve.alias = {
      ...config.resolve.alias,
      '@x402/evm': false,
      '@x402/evm/exact/client': false,
      '@x402/evm/upto/client': false,
      '@x402/core/client': false,
      '@x402/svm/exact/client': false,
      '@x402/svm/upto/client': false,
      'pino-caller': false,
      'lokijs': false,
      'encoding': false,
      '@react-native-async-storage/async-storage': false
    };

    return config;
  },
};

export default nextConfig;
