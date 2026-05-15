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
  const [resumeFile, setResumeFile] = useState(null)
  const [jobDescription, setJobDescription] = useState('')
  const [extractedText, setExtractedText] = useState('')
  const [resumeError, setResumeError] = useState('')
  const [isExtracting, setIsExtracting] = useState(false)

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
    setResumeFile(null)
    setJobDescription('')
    setExtractedText('')
    setResumeError('')
    setAuthMessage('')
  }

  async function handleExtractText(event) {
    event.preventDefault()
    setResumeError('')
    setExtractedText('')

    if (!resumeFile) {
      setResumeError('Please select a PDF resume.')
      return
    }

    setIsExtracting(true)
    try {
      const formData = new FormData()
      formData.append('file', resumeFile)

      const response = await fetch(`${API_BASE_URL}/resume/extract-text`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      })

      if (!response.ok) {
        throw new Error(await getErrorMessage(response))
      }

      const result = await response.json()
      setExtractedText(result.text)
    } catch (error) {
      setResumeError(error.message)
    } finally {
      setIsExtracting(false)
    }
  }

  if (isSessionLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
        <p className="text-sm font-medium text-gray-600">Loading session...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-4xl items-center justify-center">
        {!user ? (
          <section className="w-full max-w-md rounded-lg bg-white p-8 shadow-md">
            <h1 className="mb-2 text-center text-2xl font-bold text-blue-600">AI Resume Builder</h1>
            <p className="mb-6 text-center text-sm text-gray-600">
              {authMode === 'login' ? 'Sign in to continue.' : 'Create an account to get started.'}
            </p>

            <div className="mb-5 grid grid-cols-2 rounded border border-gray-200 bg-gray-50 p-1">
              <button
                type="button"
                onClick={() => setAuthMode('login')}
                className={`rounded px-3 py-2 text-sm font-medium ${
                  authMode === 'login' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600'
                }`}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => setAuthMode('register')}
                className={`rounded px-3 py-2 text-sm font-medium ${
                  authMode === 'register' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600'
                }`}
              >
                Register
              </button>
            </div>

            <form className="space-y-4" onSubmit={handleAuthSubmit}>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-700">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="block w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-700">Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="block w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  minLength={6}
                  required
                />
              </label>

              {authError && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{authError}</p>}
              {authMessage && <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">{authMessage}</p>}

              <button
                type="submit"
                disabled={isAuthLoading}
                className="w-full rounded bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {isAuthLoading ? 'Please wait...' : authMode === 'login' ? 'Login' : 'Register'}
              </button>
            </form>
          </section>
        ) : (
          <div className="w-full">
            <div className="flex justify-end mb-4">
              <button
                type="button"
                onClick={handleLogout}
                className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 bg-white shadow-sm"
              >
                Logout ({user.email})
              </button>
            </div>
            <Dashboard />
          </div>
        )}
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
