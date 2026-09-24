'use client'

import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function SignInContent() {
  const params     = useSearchParams()
  const callbackUrl = params.get('callbackUrl') ?? '/'
  const error      = params.get('error')

  const errorMessage =
    error === 'not_authorized'
      ? 'Your account is not authorised to access this system. Contact your administrator.'
      : error
        ? 'Sign-in failed. Please try again or contact your administrator.'
        : null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'var(--bg-base)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      {/* Card */}
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '40px 48px',
          width: '100%',
          maxWidth: 420,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 32,
        }}
      >
        {/* Logo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://septic.proguardplans.com/logo-white.png"
          alt="ProGuard"
          style={{ height: 36, width: 'auto', objectFit: 'contain' }}
        />

        {/* Heading */}
        <div style={{ textAlign: 'center' }}>
          <p
            style={{
              color: 'var(--text-secondary)',
              fontSize: 11,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            Claims Management
          </p>
          <h1
            style={{
              color: 'var(--text-primary)',
              fontSize: 20,
              fontWeight: 600,
              margin: 0,
            }}
          >
            Sign in
          </h1>
        </div>

        {/* Error banner */}
        {errorMessage && (
          <div
            style={{
              background: 'rgba(232, 90, 74, 0.12)',
              border: '1px solid rgba(232, 90, 74, 0.35)',
              borderRadius: 8,
              padding: '12px 16px',
              color: '#E85A4A',
              fontSize: 13,
              lineHeight: 1.5,
              width: '100%',
              textAlign: 'center',
            }}
          >
            {errorMessage}
          </div>
        )}

        {/* Azure AD button */}
        <button
          onClick={() => signIn('azure-ad', { callbackUrl })}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            background: 'var(--brand-cta)',
            border: 'none',
            borderRadius: 8,
            padding: '13px 20px',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'opacity 0.15s',
          }}
          onMouseOver={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = '0.85')}
          onMouseOut={(e)  => ((e.currentTarget as HTMLButtonElement).style.opacity = '1')}
        >
          {/* Microsoft logo mark */}
          <svg width="18" height="18" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1"  y="1"  width="9" height="9" fill="#F25022"/>
            <rect x="11" y="1"  width="9" height="9" fill="#7FBA00"/>
            <rect x="1"  y="11" width="9" height="9" fill="#00A4EF"/>
            <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
          </svg>
          Continue with Microsoft
        </button>

        {/* Footer note */}
        <p
          style={{
            color: 'var(--text-tertiary)',
            fontSize: 11,
            textAlign: 'center',
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          Access restricted to authorised ProGuard staff.
        </p>
      </div>
    </div>
  )
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInContent />
    </Suspense>
  )
}
