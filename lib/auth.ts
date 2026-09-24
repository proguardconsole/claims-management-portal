import type { NextAuthOptions } from 'next-auth'
import AzureADProvider from 'next-auth/providers/azure-ad'
import { TEAM } from './users'

const ALLOWLIST = new Set([
  ...TEAM.map((u) => u.email),
  'sroland@proguardplans.com', // TEMPORARY — FOR TESTING ONLY. Remove once auth confirmed working end-to-end with real team.
])

export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId:     process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId:     process.env.AZURE_AD_TENANT_ID!,
    }),
  ],
  pages: {
    signIn: '/auth/signin',
    error:  '/auth/signin',
  },
  callbacks: {
    async signIn({ user }) {
      const email = user.email?.toLowerCase() ?? ''
      if (ALLOWLIST.has(email)) return true
      // Redirect to sign-in page with a clear error code
      return '/auth/signin?error=not_authorized'
    },
    async session({ session, token }) {
      if (session.user && token.email) {
        session.user.email = token.email
      }
      return session
    },
    async jwt({ token, user }) {
      if (user?.email) token.email = user.email
      return token
    },
  },
  session: {
    strategy: 'jwt',
  },
}
