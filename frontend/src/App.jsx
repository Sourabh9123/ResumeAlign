import { useState } from 'react'

function App() {
  const [isStarted, setIsStarted] = useState(false)
  const [resumeFile, setResumeFile] = useState(null)
  const [jobDescription, setJobDescription] = useState('')

  return (
    <div className="min-h-screen bg-gray-100 px-4 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center justify-center">
        {!isStarted ? (
          <section className="w-full max-w-md rounded-lg bg-white p-8 shadow-md">
            <h1 className="mb-4 text-center text-2xl font-bold text-blue-600">AI Resume Builder</h1>
            <p className="mb-6 text-center text-gray-600">Upload your resume and a job description to get started.</p>
            <button
              type="button"
              onClick={() => setIsStarted(true)}
              className="w-full rounded bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Get Started
            </button>
          </section>
        ) : (
          <section className="w-full rounded-lg bg-white p-8 shadow-md">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Create optimized resume</h1>
                <p className="mt-1 text-sm text-gray-600">Add your resume and the job description.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsStarted(false)}
                className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Back
              </button>
            </div>

            <form className="space-y-5">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-700">Resume file</span>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                  onChange={(event) => setResumeFile(event.target.files?.[0] ?? null)}
                  className="block w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 file:mr-4 file:rounded file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {resumeFile && (
                  <span className="mt-2 block text-sm text-gray-500">Selected: {resumeFile.name}</span>
                )}
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-700">Job description</span>
                <textarea
                  value={jobDescription}
                  onChange={(event) => setJobDescription(event.target.value)}
                  rows={8}
                  className="block w-full resize-y rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Paste the job description here..."
                />
              </label>

              <button
                type="button"
                disabled={!resumeFile || !jobDescription.trim()}
                className="w-full rounded bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                Optimize Resume
              </button>
            </form>
          </section>
        )}
      </div>
    </div>
  )
}

export default App
