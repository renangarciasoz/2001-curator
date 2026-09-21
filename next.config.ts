import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Ferramenta interna: a única origem remota de imagem é o CDN de pôsteres do TMDB,
  // usado apenas como consulta factual (nunca material de treino — ver README § dois baldes).
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'image.tmdb.org',
        pathname: '/t/p/**',
      },
    ],
  },
};

export default nextConfig;
