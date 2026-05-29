/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: [
        'localhost:3000',
        'ai-line-balance.vercel.app',
      ],
    },
  },
  // Type-check & ESLint diaktifkan kembali (Batch 2 selesai).
  // Jika build gagal di Vercel karena type error, JANGAN matikan flag ini —
  // perbaiki kodenya. Mematikan check = membutakan diri terhadap bug runtime.
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
}
module.exports = nextConfig
