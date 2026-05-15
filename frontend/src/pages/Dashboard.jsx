import React, { useState } from 'react';
import { resumeApi } from '../api/client';

export default function Dashboard() {
    const [file, setFile] = useState(null);
    const [jdText, setJdText] = useState("");
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState(null);
    const [error, setError] = useState("");

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleOptimize = async () => {
        if (!file) {
            setError("Please select a resume file.");
            return;
        }
        setLoading(true);
        setError("");
        setResults(null);
        
        try {
            // Step 1: Extract Text
            const extractData = await resumeApi.extractText(file);
            const extractedText = extractData.extracted_text;
            
            // Step 2: Optimize
            const optimizeData = await resumeApi.optimize(extractedText, jdText);
            setResults(optimizeData);
            
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.detail || "An error occurred during optimization.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white p-8">
            <div className="max-w-4xl mx-auto">
                <header className="mb-10 text-center">
                    <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 mb-2">
                        AI Resume Optimizer
                    </h1>
                    <p className="text-gray-400">Tailor your resume perfectly to any job description using advanced AI.</p>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                    {/* Resume Upload */}
                    <div className="bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-700 hover:border-blue-500 transition-colors">
                        <h2 className="text-xl font-bold mb-4 text-blue-400">1. Upload Resume</h2>
                        <input 
                            type="file" 
                            className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-900 file:text-blue-300 hover:file:bg-blue-800 transition"
                            onChange={handleFileChange}
                            accept=".pdf,.docx,.txt,.png,.jpg"
                        />
                        {file && <p className="mt-3 text-sm text-emerald-400">✓ Selected: {file.name}</p>}
                    </div>

                    {/* JD Input */}
                    <div className="bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-700 hover:border-emerald-500 transition-colors">
                        <h2 className="text-xl font-bold mb-4 text-emerald-400">2. Target Job Description</h2>
                        <textarea 
                            className="w-full h-32 bg-gray-900 border border-gray-600 rounded-lg p-3 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                            placeholder="Paste the job description here (optional)..."
                            value={jdText}
                            onChange={(e) => setJdText(e.target.value)}
                        />
                    </div>
                </div>

                <div className="text-center mb-10">
                    <button 
                        onClick={handleOptimize}
                        disabled={loading}
                        className={`px-8 py-3 rounded-full font-bold text-lg shadow-lg transition-transform transform hover:scale-105 ${loading ? 'bg-gray-600 cursor-not-allowed' : 'bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600'}`}
                    >
                        {loading ? 'AI is working...' : 'Optimize Resume'}
                    </button>
                    {error && <p className="mt-4 text-red-400 font-medium">{error}</p>}
                </div>

                {/* Results Section */}
                {results && (
                    <div className="bg-gray-800 p-8 rounded-3xl shadow-2xl border border-gray-700 animate-fade-in">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold text-white">Optimization Results</h2>
                            {results.ats_score > 0 && (
                                <div className="bg-gray-900 px-4 py-2 rounded-full border border-gray-600">
                                    <span className="text-sm text-gray-400 mr-2">ATS Score:</span>
                                    <span className={`font-bold ${results.ats_score > 70 ? 'text-emerald-400' : 'text-yellow-400'}`}>
                                        {results.ats_score}%
                                    </span>
                                </div>
                            )}
                        </div>

                        {results.jd_keywords && results.jd_keywords.length > 0 && (
                            <div className="mb-6">
                                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Targeted Keywords</h3>
                                <div className="flex flex-wrap gap-2">
                                    {results.jd_keywords.map((kw, i) => (
                                        <span key={i} className="px-3 py-1 bg-blue-900/50 text-blue-300 text-xs rounded-full border border-blue-700/50">
                                            {kw}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Original Data Structure</h3>
                                <pre className="bg-gray-900 p-4 rounded-xl text-xs text-gray-300 overflow-auto h-96 border border-gray-700">
                                    {JSON.stringify(results.structured_resume, null, 2)}
                                </pre>
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Optimized For JD</h3>
                                <pre className="bg-gray-900 p-4 rounded-xl text-xs text-emerald-400 overflow-auto h-96 border border-emerald-900/30">
                                    {JSON.stringify(results.optimized_resume, null, 2)}
                                </pre>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
