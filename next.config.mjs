import { imageHosts } from './image-hosts.config.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  productionBrowserSourceMaps: false,
  distDir: process.env.DIST_DIR || '.next',
  assetPrefix: process.env.ASSET_PREFIX || '',

  serverExternalPackages: ['pg', 'pg-native', 'newman'],

  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },

  images: {
    remotePatterns: imageHosts,
    minimumCacheTTL: 60,
    qualities: [75, 85, 100],
  },

  // instrumentation.ts is compiled for the EDGE runtime; the bundler follows its
  // dynamic import into the Node-only evidence graph (evidenceStore 'fs'/'path',
  // pg -> pgpass -> ...). That code never EXECUTES on edge, so stub every Node
  // core module the edge bundle must RESOLVE, and alias the pg tree away. Also
  // disable webpack's on-disk cache in DEV to stop the .next/cache pack.gz
  // rename/stat ENOENT races common on Windows / synced enterprise paths.
  webpack: (config, { dev, isServer, nextRuntime }) => {
    if (dev) config.cache = false;

    config.resolve = config.resolve || {};
    const pgAlias = {
      pg: false,
      pgpass: false,
      'pg-connection-string': false,
      'pg-pool': false,
      'pg-native': false,
      'pg-cloudflare': false,
    };

    if (nextRuntime === 'edge') {
      config.resolve.alias = { ...(config.resolve.alias || {}), ...pgAlias };
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        fs: false,
        'fs/promises': false,
        path: false,
        os: false,
        net: false,
        tls: false,
        dns: false,
        crypto: false,
        stream: false,
        util: false,
        events: false,
        url: false,
        buffer: false,
        string_decoder: false,
        assert: false,
        querystring: false,
        zlib: false,
        http: false,
        https: false,
        http2: false,
        tty: false,
        child_process: false,
        module: false,
        perf_hooks: false,
        async_hooks: false,
        worker_threads: false,
        readline: false,
        constants: false,
        vm: false,
      };
    } else if (!isServer) {
      config.resolve.alias = { ...(config.resolve.alias || {}), ...pgAlias };
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        fs: false,
        'fs/promises': false,
        path: false,
        os: false,
        net: false,
        tls: false,
        dns: false,
        child_process: false,
      };
    }
    return config;
  },

  async redirects() {
    return [{ source: '/', destination: '/contract-program-selection', permanent: false }];
  },
};

export default nextConfig;

// Made with Bob
