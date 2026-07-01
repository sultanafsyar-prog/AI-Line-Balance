import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from './db'

export const authOptions: NextAuthOptions = {
  // Sesi 16 jam + rolling (updateAge 1 jam): cukup untuk shift penuh + lembur
  // (shift bisa 12 jam) dan diperpanjang otomatis selama leader aktif, supaya
  // tidak "Unauthorized" di tengah shift.
  session: { strategy: 'jwt', maxAge: 16 * 60 * 60, updateAge: 60 * 60 },
  pages: { signIn: '/login' },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email:    { label: 'Email',    type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        const user = await prisma.user.findUnique({
          where: { email: credentials.email, active: true },
        })
        if (!user) return null
        const valid = await bcrypt.compare(credentials.password, user.password)
        if (!valid) return null
        return {
          id:       user.id,
          name:     user.name,
          email:    user.email,
          role:     user.role,
          building: user.building,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id       = user.id
        token.role     = user.role
        token.building = user.building
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id       = token.id
        session.user.role     = token.role
        session.user.building = token.building
      }
      return session
    },
  },
}
