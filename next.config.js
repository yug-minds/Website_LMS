/** @type {import('next').NextConfig} */
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'randomuser.me',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'xyaxjscxqcyqesmmlybh.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/object/**',
      },
    ],
    formats: ['image/avif', 'image/webp'], // AVIF is prioritized over WebP for better compression
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    qualities: [60, 75, 85], // Add support for different quality levels
    minimumCacheTTL: 31536000, // Cache optimized images for 1 year (static content)
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  // Ensure CSS is processed correctly
  transpilePackages: [],
  // Force CSS to reload on changes
  reactStrictMode: true,
  // Performance optimizations
  compress: true, // Enable gzip compression
  // swcMinify is enabled by default in recent Next.js versions and the option is deprecated/removed
  // swcMinify: true,
  // Optimize bundle splitting
  experimental: {
    optimizeCss: true, // Optimize CSS
  },
  // Webpack optimizations
  webpack: (config, { dev, isServer }) => {
    if (!isServer) {
      // Optimize client-side bundle - reduce chunk count and improve splitting
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          maxInitialRequests: 20, // Reduced from 25 to limit initial chunks
          maxAsyncRequests: 25, // Reduced from 30
          minSize: 30000, // Increased from 20KB to reduce small chunks
          maxSize: 244000, // 244KB - optimize for better caching
          cacheGroups: {
            default: false,
            vendors: false,
            // React and React-DOM in separate chunk (high priority, frequently used)
            react: {
              name: 'react',
              test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
              chunks: 'all',
              priority: 50,
              enforce: true,
            },
            // Next.js framework in separate chunk
            nextjs: {
              name: 'nextjs',
              test: /[\\/]node_modules[\\/]next[\\/]/,
              chunks: 'all',
              priority: 45,
              enforce: true,
            },
            // Separate chunk for recharts (large charting library)
            recharts: {
              name: 'recharts',
              test: /[\\/]node_modules[\\/]recharts[\\/]/,
              chunks: 'all',
              priority: 40,
              enforce: true,
            },
            // Separate chunk for framer-motion (animation library)
            framerMotion: {
              name: 'framer-motion',
              test: /[\\/]node_modules[\\/](framer-motion|motion)[\\/]/,
              chunks: 'all',
              priority: 40,
              enforce: true,
            },
            // Separate chunk for exceljs (large Excel library)
            exceljs: {
              name: 'exceljs',
              test: /[\\/]node_modules[\\/]exceljs[\\/]/,
              chunks: 'all',
              priority: 40,
              enforce: true,
            },
            // All @radix-ui components together
            radixUI: {
              name: 'radix-ui',
              test: /[\\/]node_modules[\\/]@radix-ui[\\/]/,
              chunks: 'all',
              priority: 35,
            },
            // All icon libraries together
            icons: {
              name: 'icons',
              test: /[\\/]node_modules[\\/](lucide-react|@tabler)[\\/]/,
              chunks: 'all',
              priority: 35,
            },
            // Supabase and related libraries
            supabase: {
              name: 'supabase',
              test: /[\\/]node_modules[\\/]@supabase[\\/]/,
              chunks: 'all',
              priority: 33,
            },
            // Other large vendor libraries
            vendor: {
              name: 'vendor',
              test: /[\\/]node_modules[\\/]/,
              chunks: 'all',
              priority: 20,
              minChunks: 2, // Require at least 2 pages to use it
              reuseExistingChunk: true,
            },
            // Common chunk for shared code across pages (minimum 2 pages)
            common: {
              name: 'common',
              minChunks: 3, // Increased from 2 to reduce chunks
              chunks: 'all',
              priority: 10,
              reuseExistingChunk: true,
              minSize: 50000, // Increased minimum size
            },
          },
        },
      };
    }
    return config;
  },
};

// Injected content via Sentry wizard below

const { withSentryConfig } = require("@sentry/nextjs");

module.exports = withSentryConfig(
  withBundleAnalyzer(nextConfig),
  {
    // For all available options, see:
    // https://www.npmjs.com/package/@sentry/webpack-plugin#options

    org: "yugminds-74",
    project: "javascript-nextjs",

    // Only print logs for uploading source maps in CI
    silent: !process.env.CI,

    // For all available options, see:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: true,

    // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
    // This can increase your server load as well as your hosting bill.
    // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
    // side errors will fail.
    tunnelRoute: "/monitoring",

    // Use webpack configuration for tree-shaking and monitoring
    webpack: {
      treeshake: {
        removeDebugLogging: true,
      },
      automaticVercelMonitors: true,
    },
  }
);
