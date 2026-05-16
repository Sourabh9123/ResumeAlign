import React, { useState } from 'react';
import { resumeApi } from '../api/client';

/**
 * Dashboard Component
 * 
 * A full-width, premium web application layout for AI Resume Optimization.
 * Features a persistent input sidebar and an expansive results/processing stage.
 */
export default function Dashboard() {
    const [file, setFile] = useState(null);
    const [jdText, setJdText] = useState("");
    const [additionalPrompt, setAdditionalPrompt] = useState("");
    const [loading, setLoading] = useState(false);
    const [loadingStep, setLoadingStep] = useState("");
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
            setLoadingStep("Extracting text from your resume...");
            const extractData = await resumeApi.extractText(file);
            const extractedText = extractData.extracted_text;
            
            setLoadingStep("AI is deeply analyzing and optimizing your resume. This can take a few minutes...");
            const optimizeData = await resumeApi.optimize(extractedText, jdText, additionalPrompt);
            
            setLoadingStep("Finalizing your stunning PDF...");
            setResults(optimizeData);
            
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.detail || "An error occurred during optimization.");
        } finally {
            setLoading(false);
            setLoadingStep("");
        }
    };

    return (
        <div className="flex h-screen w-full bg-[#050914] text-gray-200 overflow-hidden font-sans selection:bg-emerald-500/30">
            {/* Left Sidebar - Inputs */}
            <aside className="w-full md:w-[450px] lg:w-[500px] h-full bg-[#0a0f1c] border-r border-gray-800/60 shadow-2xl flex flex-col z-20 shrink-0">
                <div className="p-8 pb-4 border-b border-gray-800/50">
                    <div className="flex items-center space-x-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        </div>
                        <h1 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-emerald-400 to-teal-300">
                            AI Optimizer
                        </h1>
                    </div>
                    <p className="text-xs text-gray-400 font-medium tracking-wide">Advanced Resume Engineering</p>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                    {/* Step 1: Upload */}
                    <div className="space-y-3">
                        <label className="flex items-center text-sm font-bold text-gray-300 uppercase tracking-widest">
                            <span className="w-6 h-6 rounded-md bg-blue-500/20 text-blue-400 flex items-center justify-center mr-2 text-xs">1</span>
                            Upload Resume
                        </label>
                        <div className="group relative border-2 border-dashed border-gray-700/80 hover:border-blue-500/60 bg-gray-900/50 rounded-2xl p-6 text-center transition-all">
                            <input 
                                type="file" 
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                onChange={handleFileChange}
                                accept=".pdf,.docx,.txt"
                            />
                            <div className="pointer-events-none flex flex-col items-center">
                                <svg className="w-8 h-8 text-blue-400/70 mb-2 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                <span className="text-sm text-gray-300 font-medium">Click to browse or drag file</span>
                                <span className="text-xs text-gray-500 mt-1">PDF, DOCX, TXT</span>
                            </div>
                        </div>
                        {file && (
                            <div className="flex items-center p-3 bg-blue-900/20 border border-blue-500/30 rounded-xl animate-fade-in">
                                <div className="w-2 h-2 bg-blue-400 rounded-full mr-3 animate-pulse"></div>
                                <p className="text-xs text-blue-200 font-medium truncate">{file.name}</p>
                            </div>
                        )}
                    </div>

                    {/* Step 2: JD */}
                    <div className="space-y-3">
                        <label className="flex items-center text-sm font-bold text-gray-300 uppercase tracking-widest">
                            <span className="w-6 h-6 rounded-md bg-emerald-500/20 text-emerald-400 flex items-center justify-center mr-2 text-xs">2</span>
                            Job Description
                        </label>
                        <textarea 
                            className="w-full h-36 bg-gray-900/50 border border-gray-700/80 rounded-2xl p-4 text-sm text-gray-300 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 resize-none transition-all placeholder-gray-600 shadow-inner custom-scrollbar"
                            placeholder="Paste target job description to heavily tailor your resume..."
                            value={jdText}
                            onChange={(e) => setJdText(e.target.value)}
                        />
                    </div>

                    {/* Step 3: Custom Prompt */}
                    <div className="space-y-3">
                        <label className="flex items-center text-sm font-bold text-gray-300 uppercase tracking-widest">
                            <span className="w-6 h-6 rounded-md bg-purple-500/20 text-purple-400 flex items-center justify-center mr-2 text-xs">3</span>
                            Custom Instructions
                        </label>
                        <textarea 
                            className="w-full h-36 bg-gray-900/50 border border-gray-700/80 rounded-2xl p-4 text-sm text-gray-300 focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/50 resize-none transition-all placeholder-gray-600 shadow-inner custom-scrollbar"
                            placeholder="e.g., 'Make it sound more executive', 'Shorten bullet points', 'Highlight Python skills'..."
                            value={additionalPrompt}
                            onChange={(e) => setAdditionalPrompt(e.target.value)}
                        />
                    </div>
                </div>

                <div className="p-6 border-t border-gray-800/50 bg-[#0a0f1c]">
                    <button 
                        onClick={handleOptimize}
                        disabled={loading || !file}
                        className={`w-full relative px-6 py-4 rounded-xl font-bold text-sm uppercase tracking-widest shadow-lg transition-all duration-300 overflow-hidden ${
                            loading || !file 
                            ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700' 
                            : 'bg-gradient-to-r from-blue-600 via-emerald-500 to-teal-500 text-white hover:shadow-[0_0_30px_-5px_rgba(16,185,129,0.4)] hover:scale-[1.02]'
                        }`}
                    >
                        {loading ? 'Processing...' : 'Optimize Resume'}
                    </button>
                    {error && (
                        <p className="mt-4 text-red-400 font-medium text-xs text-center p-2 bg-red-900/20 rounded-lg border border-red-500/20">
                            {error}
                        </p>
                    )}
                </div>
            </aside>

            {/* Right Main Area - Results/Loading */}
            <main className="flex-1 relative h-full overflow-y-auto bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-900 via-[#050914] to-black custom-scrollbar">
                <div className="absolute top-0 right-0 w-full h-full pointer-events-none overflow-hidden z-0">
                    <div className="absolute -top-40 -right-40 w-96 h-96 bg-emerald-500/5 rounded-full blur-[120px]"></div>
                    <div className="absolute top-1/2 left-1/4 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[150px] -translate-y-1/2"></div>
                </div>

                <div className="relative z-10 w-full h-full flex flex-col p-8 md:p-12 lg:p-16">
                    {!loading && !results && (
                        <div className="flex-1 flex flex-col items-center justify-center opacity-40">
                            <svg className="w-24 h-24 text-gray-600 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                            <h2 className="text-2xl font-light text-gray-400">Awaiting input...</h2>
                            <p className="text-gray-500 mt-2">Upload a resume and start optimization.</p>
                        </div>
                    )}

                    {loading && (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="relative p-12 rounded-[2.5rem] bg-gray-800/40 backdrop-blur-2xl border border-gray-700/50 shadow-[0_0_80px_-20px_rgba(16,185,129,0.2)] flex flex-col items-center max-w-lg w-full animate-fade-in">
                                <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 to-transparent rounded-[2.5rem]"></div>
                                
                                <div className="relative w-32 h-32 flex items-center justify-center mb-10">
                                    <div className="absolute inset-0 rounded-full border-t-4 border-blue-500/80 animate-spin" style={{ animationDuration: '1s' }}></div>
                                    <div className="absolute inset-3 rounded-full border-r-4 border-emerald-400/80 animate-spin" style={{ animationDuration: '1.5s', animationDirection: 'reverse' }}></div>
                                    <div className="absolute inset-6 rounded-full border-b-4 border-teal-300/80 animate-spin" style={{ animationDuration: '2s' }}></div>
                                    <div className="w-10 h-10 bg-emerald-500/20 rounded-full animate-ping"></div>
                                </div>
                                
                                <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-blue-400 tracking-wide mb-4 text-center">
                                    Synthesizing Intelligence
                                </h3>
                                <p className="text-gray-400 font-medium text-center h-6 animate-pulse">
                                    {loadingStep}
                                </p>
                                <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden mt-8">
                                    <div className="h-full bg-gradient-to-r from-blue-500 via-emerald-400 to-teal-400 animate-slide-right w-1/2 rounded-full"></div>
                                </div>
                            </div>
                        </div>
                    )}

                    {results && !loading && (
                        <div className="w-full max-w-7xl mx-auto animate-fade-in pb-10">
                            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end mb-12 gap-6 border-b border-gray-800/80 pb-8">
                                <div>
                                    <h2 className="text-4xl font-extrabold text-white mb-3 tracking-tight">Optimization Complete</h2>
                                    <p className="text-gray-400 text-lg">Your resume has been structurally and linguistically enhanced.</p>
                                </div>
                                
                                <div className="flex flex-wrap gap-4 items-center">
                                    {results.ats_score > 0 && (
                                        <div className="bg-gray-900/80 px-6 py-3 rounded-2xl border border-gray-700/50 flex items-center shadow-lg">
                                            <span className="text-sm text-gray-400 mr-3 font-semibold uppercase tracking-wider">ATS Match</span>
                                            <span className={`text-2xl font-black ${results.ats_score > 70 ? 'text-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.4)]' : 'text-yellow-400'}`}>
                                                {results.ats_score}%
                                            </span>
                                        </div>
                                    )}
                                    {results.pdf_base64 && (
                                        <a 
                                            href={`data:application/pdf;base64,${results.pdf_base64}`}
                                            download={`Optimized_Resume_${new Date().getTime()}.pdf`}
                                            className="group flex items-center bg-white text-black px-8 py-3.5 rounded-2xl text-sm font-bold shadow-[0_0_30px_rgba(255,255,255,0.15)] transition-all hover:scale-105 hover:bg-gray-100"
                                        >
                                            <svg className="w-5 h-5 mr-2 group-hover:-translate-y-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                            Download PDF
                                        </a>
                                    )}
                                </div>
                            </div>

                            {results.jd_keywords && results.jd_keywords.length > 0 && (
                                <div className="mb-12 bg-gray-900/40 p-8 rounded-[2rem] border border-gray-800/80 backdrop-blur-sm">
                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-5 flex items-center">
                                        <svg className="w-5 h-5 mr-2 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                                        Targeted Keywords Injected
                                    </h3>
                                    <div className="flex flex-wrap gap-3">
                                        {results.jd_keywords.map((kw, i) => (
                                            <span key={i} className="px-4 py-2 bg-blue-500/10 text-blue-300 text-xs font-bold tracking-wide rounded-xl border border-blue-500/20 shadow-sm">
                                                {kw}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-1 2xl:grid-cols-2 gap-10">
                                <div className="flex flex-col h-[700px]">
                                    <div className="flex items-center mb-4 pl-2">
                                        <div className="w-2 h-2 rounded-full bg-gray-500 mr-3"></div>
                                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Original Extraction</h3>
                                    </div>
                                    <div className="flex-1 bg-[#0b0e14] p-8 rounded-[2rem] text-xs text-gray-400 overflow-auto border border-gray-800 shadow-inner custom-scrollbar">
                                        <pre className="font-mono leading-relaxed">{JSON.stringify(results.structured_resume, null, 2)}</pre>
                                    </div>
                                </div>
                                
                                <div className="flex flex-col h-[700px]">
                                    <div className="flex items-center mb-4 pl-2">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 mr-3 shadow-[0_0_10px_rgba(16,185,129,0.8)]"></div>
                                        <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-widest">Optimized Output</h3>
                                    </div>
                                    <div className="flex-1 bg-[#071311] p-8 rounded-[2rem] text-xs text-emerald-400 overflow-auto border border-emerald-900/40 shadow-inner custom-scrollbar relative">
                                        <pre className="font-mono leading-relaxed">{JSON.stringify(results.optimized_resume, null, 2)}</pre>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>
            
            {/* Inline styles for custom animations */}
            <style jsx="true">{`
                @keyframes fade-in {
                    0% { opacity: 0; transform: translateY(15px); }
                    100% { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in { animation: fade-in 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                
                @keyframes slide-right {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(200%); }
                }
                .animate-slide-right { animation: slide-right 2s infinite ease-in-out; }
                
                .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(55, 65, 81, 0.6); border-radius: 10px; border: 2px solid transparent; background-clip: padding-box; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: rgba(75, 85, 99, 0.8); }
            `}</style>
        </div>
    );
}
