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
        companyCode: { label: 'Company code', type: 'text' },
        email:    { label: 'Email',    type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.companyCode || !credentials?.email || !credentials?.password) return null
        const companyCode = credentials.companyCode.trim().toUpperCase()
        const email = credentials.email.trim().toLowerCase()
        const company = await prisma.company.findUnique({ where: { code: companyCode } })
        if (!company?.active) return null
        const user = await prisma.user.findUnique({
          where: { companyId_email: { companyId: company.id, email } },
        })
        if (!user?.active) return null
        const valid = await bcrypt.compare(credentials.password, user.password)
        if (!valid) return null
        return {
          id:       user.id,
          name:     user.name,
          email:    user.email,
          role:     user.role,
          building: user.building,
          companyId: user.companyId,
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
        token.companyId = user.companyId
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id       = token.id
        session.user.role     = token.role
        session.user.building = token.building
        session.user.companyId = token.companyId
      }
      return session
    },
  },
}
