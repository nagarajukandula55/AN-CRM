'use client'
import { Globe, Copy, CheckCircle, Shield, Code } from 'lucide-react'
import { useState } from 'react'

export default function SSOSettingsPage() {
  const [copied, setCopied] = useState<string>('')

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(''), 2000)
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : 'https://angroup.com')

  const endpoints = [
    {
      label: 'SSO Token Endpoint',
      desc: 'Generate SSO token from active session. Use this in your app to get a cross-app token.',
      url: `${appUrl}/api/sso/token`,
      method: 'POST',
      auth: 'Requires: Authorization: Bearer <session_token>',
      body: '{ "app": "shopnative", "scopes": ["profile", "email"] }',
      response: '{ "ssoToken": "...", "expiresIn": 3600, "verifyUrl": "..." }',
    },
    {
      label: 'SSO Verification Endpoint',
      desc: 'Verify SSO token from any app. PUBLIC endpoint — no auth required.',
      url: `${appUrl}/api/sso/verify`,
      method: 'POST',
      auth: 'No auth required (public endpoint)',
      body: '{ "token": "<sso_token>" }',
      response: '{ "valid": true, "user": { "id": "...", "email": "...", "role": "..." } }',
    },
  ]

  const integrationCode = `// In your external app (Node.js/Next.js)
async function verifySSOToken(token) {
  const res = await fetch('${appUrl}/api/sso/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token })
  });
  const data = await res.json();
  if (data.valid) {
    // User is authenticated — data.user has their info
    return data.user;
  }
  return null;
}

// In your React/mobile app
async function loginWithSSO(ssoToken) {
  const user = await verifySSOToken(ssoToken);
  if (user) {
    // Store user session locally
    localStorage.setItem('user', JSON.stringify(user));
  }
}`

  // NOTE: no <Layout> wrapper here — /admin/layout.tsx already renders the
  // sidebar; wrapping again rendered the sidebar twice on this page.
  return (
    <div className="p-4 lg:p-6">
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-widest">Admin</p>
          <h1 className="text-2xl font-bold text-gray-900">SSO Configuration</h1>
          <p className="mt-1 text-sm text-gray-500">
            Single Sign-On for AN Group — share auth across websites, mobile apps, and future products
          </p>
        </div>

        {/* How it works */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Shield size={14} /> How SSO Works
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { step: '1', title: 'User Logs In', desc: 'User authenticates on AN Group main portal with username/password' },
              { step: '2', title: 'Request SSO Token', desc: 'Your app calls /api/sso/token with the session token to get a cross-app SSO token (1hr validity)' },
              { step: '3', title: 'Verify Anywhere', desc: 'Any app — web, mobile, API — calls /api/sso/verify to confirm the token and get user info' },
            ].map((s, i) => (
              <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="h-7 w-7 rounded-xl bg-white/10 flex items-center justify-center text-xs font-bold text-gray-900 mb-3">{s.step}</div>
                <p className="text-sm font-semibold text-gray-900">{s.title}</p>
                <p className="text-xs text-gray-500 mt-1">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Endpoints */}
        <div className="space-y-4">
          {endpoints.map((ep, i) => (
            <div key={i} className="rounded-2xl border border-gray-200 bg-white p-6">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">{ep.label}</h3>
                  <p className="text-xs text-gray-500 mt-1">{ep.desc}</p>
                </div>
                <span className="badge badge-info">{ep.method}</span>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-xl bg-gray-50 border border-gray-200 px-4 py-2">
                  <Globe size={12} className="text-gray-500 flex-shrink-0" />
                  <code className="text-xs text-gray-600 flex-1 font-mono">{ep.url}</code>
                  <button onClick={() => copy(ep.url, `url-${i}`)} className="text-gray-600 hover:text-gray-900 transition-all">
                    {copied === `url-${i}` ? <CheckCircle size={12} className="text-green-400" /> : <Copy size={12} />}
                  </button>
                </div>
                <div className="text-xs text-gray-600 px-1">Auth: {ep.auth}</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] text-gray-600 mb-1 uppercase tracking-wider">Request Body</p>
                    <pre className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-xs text-gray-600 font-mono overflow-auto">{ep.body}</pre>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-600 mb-1 uppercase tracking-wider">Response</p>
                    <pre className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-xs text-gray-600 font-mono overflow-auto">{ep.response}</pre>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Integration code */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Code size={14} /> Integration Example
            </h3>
            <button onClick={() => copy(integrationCode, 'code')}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 transition-all">
              {copied === 'code' ? <CheckCircle size={12} className="text-green-400" /> : <Copy size={12} />}
              {copied === 'code' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <pre className="rounded-xl bg-gray-50 border border-gray-200 px-5 py-4 text-xs text-gray-600 font-mono overflow-auto">{integrationCode}</pre>
        </div>

        {/* Config */}
        <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-5">
          <h4 className="text-sm font-semibold text-yellow-400 mb-3">Environment Variables Required</h4>
          <div className="space-y-2">
            {[
              { key: 'JWT_SECRET', desc: 'Used for session tokens (keep secret, same across all AN services)' },
              { key: 'SSO_SECRET', desc: 'Dedicated SSO signing secret (can be different from JWT_SECRET)' },
              { key: 'NEXT_PUBLIC_APP_URL', desc: 'Your deployment URL, e.g. https://portal.angroup.com' },
            ].map((env, i) => (
              <div key={i} className="flex items-start gap-3">
                <code className="text-xs font-mono text-yellow-300 min-w-[200px]">{env.key}</code>
                <span className="text-xs text-gray-500">{env.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
