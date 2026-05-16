import { useEffect, useState } from 'react'
import Dashboard from './pages/Dashboard'
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'
const TOKEN_STORAGE_KEY = 'resume_builder_access_token'

function App() {
  const [authMode, setAuthMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_STORAGE_KEY))
  const [user, setUser] = useState(null)
  const [authError, setAuthError] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [isAuthLoading, setIsAuthLoading] = useState(false)
  const [isSessionLoading, setIsSessionLoading] = useState(Boolean(token))

  useEffect(() => {
    if (!token) {
      setIsSessionLoading(false)
      return
    }

    async function loadCurrentUser() {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!response.ok) {
          throw new Error('Session expired. Please sign in again.')
        }

        const currentUser = await response.json()
        setUser(currentUser)
      } catch (error) {
        localStorage.removeItem(TOKEN_STORAGE_KEY)
        setToken(null)
        setUser(null)
        setAuthError(error.message)
      } finally {
        setIsSessionLoading(false)
      }
    }

    loadCurrentUser()
  }, [token])

  async function handleAuthSubmit(event) {
    event.preventDefault()
    setAuthError('')
    setAuthMessage('')
    setIsAuthLoading(true)

    try {
      if (authMode === 'register') {
        const registerResponse = await fetch(`${API_BASE_URL}/auth/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, password }),
        })

        if (!registerResponse.ok) {
          throw new Error(await getErrorMessage(registerResponse))
        }

        setAuthMessage('Account created. Signing you in now.')
      }

      const formData = new URLSearchParams()
      formData.append('username', email)
      formData.append('password', password)

      const loginResponse = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      })

      if (!loginResponse.ok) {
        throw new Error(await getErrorMessage(loginResponse))
      }

      const authToken = await loginResponse.json()
      localStorage.setItem(TOKEN_STORAGE_KEY, authToken.access_token)
      setToken(authToken.access_token)
      setPassword('')
    } catch (error) {
      setAuthError(error.message)
    } finally {
      setIsAuthLoading(false)
    }
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    setToken(null)
    setUser(null)
    setAuthMessage('')
  }

  if (isSessionLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050914] px-4">
        <p className="text-sm font-medium text-gray-400">Loading session...</p>
      </main>
    )
  }

  if (user) {
    return (
      <div className="relative w-full h-screen overflow-hidden bg-[#050914]">
        <Dashboard />
        <button
          type="button"
          onClick={handleLogout}
          className="absolute top-6 right-6 z-50 rounded-xl bg-gray-900/60 backdrop-blur-md border border-gray-700/50 px-4 py-2 text-sm font-medium text-gray-300 transition-all hover:bg-gray-800 hover:text-white shadow-lg hover:shadow-gray-900/50 flex items-center group"
        >
          <svg className="w-4 h-4 mr-2 text-gray-400 group-hover:text-red-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
          Logout ({user.email})
        </button>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-[#0B0F19] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-900 via-[#0B0F19] to-black px-4 py-10 flex items-center justify-center">
      <div className="w-full max-w-md">
        <section className="w-full rounded-2xl bg-gray-900/50 backdrop-blur-xl border border-gray-800 p-8 shadow-2xl">
          <div className="flex justify-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </div>
          </div>
          <h1 className="mb-2 text-center text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-emerald-400 to-teal-300">AI Optimizer</h1>
          <p className="mb-8 text-center text-sm text-gray-400">
            {authMode === 'login' ? 'Sign in to continue.' : 'Create an account to get started.'}
          </p>

          <div className="mb-6 grid grid-cols-2 rounded-xl border border-gray-800 bg-gray-950/50 p-1">
            <button
              type="button"
              onClick={() => setAuthMode('login')}
              className={`rounded-lg px-3 py-2.5 text-sm font-bold transition-all ${
                authMode === 'login' ? 'bg-gray-800 text-emerald-400 shadow-md' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => setAuthMode('register')}
              className={`rounded-lg px-3 py-2.5 text-sm font-bold transition-all ${
                authMode === 'register' ? 'bg-gray-800 text-blue-400 shadow-md' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Register
            </button>
          </div>

          <form className="space-y-5" onSubmit={handleAuthSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-400">Email Address</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="block w-full rounded-xl border border-gray-700 bg-gray-900/80 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all placeholder-gray-600"
                placeholder="you@example.com"
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-400">Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="block w-full rounded-xl border border-gray-700 bg-gray-900/80 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all placeholder-gray-600"
                placeholder="••••••••"
                minLength={6}
                required
              />
            </label>

            {authError && <p className="rounded-lg bg-red-900/20 border border-red-500/30 px-4 py-3 text-sm text-red-400">{authError}</p>}
            {authMessage && <p className="rounded-lg bg-emerald-900/20 border border-emerald-500/30 px-4 py-3 text-sm text-emerald-400">{authMessage}</p>}

            <button
              type="submit"
              disabled={isAuthLoading}
              className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-emerald-500 px-4 py-3.5 font-bold text-white transition-all hover:scale-[1.02] hover:shadow-[0_0_20px_-5px_rgba(16,185,129,0.5)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
            >
              {isAuthLoading ? 'Processing...' : authMode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </section>
      </div>
    </main>
  )
}

async function getErrorMessage(response) {
  try {
    const data = await response.json()
    if (typeof data.detail === 'string') {
      return data.detail
    }
  } catch {
    return 'Request failed. Please try again.'
  }

  return 'Request failed. Please try again.'
}

export default App
