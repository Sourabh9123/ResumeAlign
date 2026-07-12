import React, { useEffect, useMemo, useState } from 'react';
import { resumeApi } from '../api/client';
import { GoogleConnect } from '../components/GoogleConnect';
import { AgentChatBox } from '../components/AgentChatBox';
import { EmailTracker } from '../components/EmailTracker';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

function buildApiUrl(path) {
    if (!path) return "";
    if (path.startsWith("http")) return path;
    return `${API_URL}${path}`;
}

const HISTORY_TIMESPANS = [
    { value: "all", label: "All time" },
    { value: "7", label: "7 days" },
    { value: "30", label: "30 days" },
    { value: "90", label: "90 days" },
];

function isWithinTimespan(createdAt, timespan) {
    if (timespan === "all" || !createdAt) return true;
    const created = new Date(createdAt).getTime();
    const days = Number(timespan);
    if (Number.isNaN(created) || Number.isNaN(days)) return true;
    return created >= Date.now() - days * 24 * 60 * 60 * 1000;
}

function formatDateTime(value) {
    if (!value) return "Unknown time";
    return new Date(value).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

function formatRelativeDate(value) {
    if (!value) return "Saved";
    const diffMs = Date.now() - new Date(value).getTime();
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    if (diffDays <= 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 30) return `${diffDays} days ago`;
    return formatDateTime(value);
}

function getJobLabel(item) {
    return item.jd_title || "No job description";
}

function getCompanyLabel(item) {
    return item.jd_company || "Company not specified";
}

export default function Dashboard() {
    const [activeTab, setActiveTab] = useState("optimizer"); // optimizer, library, agent

    const [file, setFile] = useState(null);
    const [jdText, setJdText] = useState("");
    const [additionalPrompt, setAdditionalPrompt] = useState("");
    const [loading, setLoading] = useState(false);
    const [loadingStep, setLoadingStep] = useState("");
    const [results, setResults] = useState(null);
    const [error, setError] = useState("");
    
    const [history, setHistory] = useState([]);
    const [jdOptions, setJdOptions] = useState([]);
    const [selectedJdId, setSelectedJdId] = useState("");
    const [historySearch, setHistorySearch] = useState("");
    const [historyTimespan, setHistoryTimespan] = useState("all");
    const [historyLoading, setHistoryLoading] = useState(false);

    const filteredHistory = useMemo(() => {
        return history.filter((item) => {
            const matchesJd = !selectedJdId || item.jd_id === selectedJdId;
            const haystack = `${item.resume_title || ""} ${item.jd_title || ""} ${item.jd_company || ""} ${item.jd_source_url || ""}`.toLowerCase();
            const matchesSearch = !historySearch || haystack.includes(historySearch.toLowerCase());
            const matchesTimespan = isWithinTimespan(item.created_at, historyTimespan);
            return matchesJd && matchesSearch && matchesTimespan;
        });
    }, [history, historySearch, historyTimespan, selectedJdId]);

    const historyStats = useMemo(() => {
        const scoredItems = history.filter((item) => Number(item.ats_score) > 0);
        const averageScore = scoredItems.length
            ? Math.round(scoredItems.reduce((sum, item) => sum + Number(item.ats_score), 0) / scoredItems.length)
            : 0;

        return {
            total: history.length,
            visible: filteredHistory.length,
            jdCount: jdOptions.length,
            averageScore,
        };
    }, [filteredHistory.length, history, jdOptions.length]);

    const loadHistory = async () => {
        setHistoryLoading(true);
        try {
            const data = await resumeApi.history();
            setHistory(data.items || []);
            setJdOptions(data.jd_options || []);
        } catch (err) {
            console.error(err);
        } finally {
            setHistoryLoading(false);
        }
    };

    const handleDeleteHistory = async (id) => {
        try {
            await resumeApi.deleteHistory(id);
            setHistory(prev => prev.filter(item => item.id !== id));
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        loadHistory();
    }, []);

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
            const optimizeData = await resumeApi.optimize(extractedText, jdText, additionalPrompt, "", file.name);
            
            setLoadingStep("Finalizing your stunning PDF...");
            setResults(optimizeData);
            await loadHistory();
            
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
            {/* Left Navigation Sidebar */}
            <nav className="w-20 lg:w-64 border-r border-gray-800/60 bg-[#0a0f1c] shadow-2xl flex flex-col shrink-0 z-30 transition-all duration-300">
                <div className="p-6 lg:p-8 border-b border-gray-800/50 flex flex-col items-center lg:items-start">
                    <div className="flex items-center space-x-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        </div>
                        <h1 className="hidden lg:block text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-emerald-400 to-teal-300">
                            AI Optimizer
                        </h1>
                    </div>
                </div>

                <div className="flex-1 w-full py-6 px-4 space-y-2 overflow-y-auto custom-scrollbar">
                    <button
                        onClick={() => setActiveTab("optimizer")}
                        className={`w-full flex items-center p-3 rounded-xl transition-all duration-200 ${
                            activeTab === "optimizer" ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20" : "text-gray-400 hover:bg-gray-800/50 hover:text-gray-200 border border-transparent"
                        }`}
                    >
                        <svg className="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                        <span className="hidden lg:block ml-3 font-bold text-sm tracking-wide">Resume Optimizer</span>
                    </button>

                    <button
                        onClick={() => setActiveTab("library")}
                        className={`w-full flex items-center p-3 rounded-xl transition-all duration-200 ${
                            activeTab === "library" ? "bg-blue-500/10 text-blue-300 border border-blue-500/20" : "text-gray-400 hover:bg-gray-800/50 hover:text-gray-200 border border-transparent"
                        }`}
                    >
                        <svg className="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                        <span className="hidden lg:block ml-3 font-bold text-sm tracking-wide">CV Library</span>
                    </button>

                    <button
                        onClick={() => setActiveTab("agent")}
                        className={`w-full flex items-center p-3 rounded-xl transition-all duration-200 ${
                            activeTab === "agent" ? "bg-purple-500/10 text-purple-300 border border-purple-500/20" : "text-gray-400 hover:bg-gray-800/50 hover:text-gray-200 border border-transparent"
                        }`}
                    >
                        <svg className="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        <span className="hidden lg:block ml-3 font-bold text-sm tracking-wide">AI Agent Workspace</span>
                    </button>

                    <button
                        onClick={() => setActiveTab("emails")}
                        className={`w-full flex items-center p-3 rounded-xl transition-all duration-200 ${
                            activeTab === "emails" ? "bg-amber-500/10 text-amber-300 border border-amber-500/20" : "text-gray-400 hover:bg-gray-800/50 hover:text-gray-200 border border-transparent"
                        }`}
                    >
                        <svg className="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                        <span className="hidden lg:block ml-3 font-bold text-sm tracking-wide">Email Outreach</span>
                    </button>
                </div>

                <div className="p-4 border-t border-gray-800/50">
                    <GoogleConnect />
                </div>
            </nav>

            {/* Main Content Area */}
            <main className="flex-1 h-full overflow-hidden bg-[#060b16]">
                {activeTab === "optimizer" && (
                    <div className="flex h-full animate-fade-in">
                        {/* Optimizer Form */}
                        <div className="w-full lg:w-[450px] xl:w-[500px] h-full bg-[#0a0f1c] border-r border-gray-800/50 flex flex-col shrink-0">
                            <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
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

                                <div className="space-y-3">
                                    <label className="flex items-center justify-between gap-3 text-sm font-bold text-gray-300 uppercase tracking-widest">
                                        <span className="flex min-w-0 items-center">
                                            <span className="w-6 h-6 rounded-md bg-emerald-500/20 text-emerald-400 flex items-center justify-center mr-2 text-xs">2</span>
                                            Job Description
                                        </span>
                                    </label>
                                    <textarea 
                                        className="w-full h-48 bg-gray-900/50 border border-gray-700/80 rounded-2xl p-4 text-sm text-gray-300 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 resize-none transition-all placeholder-gray-600 shadow-inner custom-scrollbar"
                                        placeholder="Paste target job description to heavily tailor your resume..."
                                        value={jdText}
                                        onChange={(e) => setJdText(e.target.value)}
                                    />
                                </div>

                                <div className="space-y-3">
                                    <label className="flex items-center text-sm font-bold text-gray-300 uppercase tracking-widest">
                                        <span className="w-6 h-6 rounded-md bg-purple-500/20 text-purple-400 flex items-center justify-center mr-2 text-xs">3</span>
                                        Custom Instructions
                                    </label>
                                    <textarea 
                                        className="w-full h-32 bg-gray-900/50 border border-gray-700/80 rounded-2xl p-4 text-sm text-gray-300 focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/50 resize-none transition-all placeholder-gray-600 shadow-inner custom-scrollbar"
                                        placeholder="e.g., 'Make it sound more executive', 'Shorten bullet points', 'Highlight Python skills'..."
                                        value={additionalPrompt}
                                        onChange={(e) => setAdditionalPrompt(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="p-6 border-t border-gray-800/50">
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
                                    <p className="mt-4 text-red-400 font-medium text-xs text-center p-2 bg-red-900/20 rounded-lg border border-red-500/20 animate-fade-in">
                                        {error}
                                    </p>
                                )}
                            </div>
                        </div>
                        {/* Optimizer Results */}
                        <div className="flex-1 h-full overflow-y-auto relative custom-scrollbar">
                            <div className="p-8 md:p-12 lg:p-16">
                                {loading && (
                                    <div className="flex-1 flex items-center justify-center h-[calc(100vh-200px)]">
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
                                        </div>
                                    </div>
                                )}

                                {!loading && !results && (
                                    <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] text-center animate-fade-in opacity-60">
                                        <svg className="w-24 h-24 text-gray-700 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                                        <h2 className="text-2xl font-bold text-gray-400">Ready to Optimize</h2>
                                        <p className="text-gray-500 mt-2 max-w-sm">Upload your resume and provide a job description on the left to begin the magic.</p>
                                    </div>
                                )}

                                {results && !loading && (
                                    <div className="w-full max-w-7xl mx-auto animate-fade-in pb-10">
                                        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end mb-12 gap-6 border-b border-gray-800/80 pb-8">
                                            <div>
                                                <h2 className="text-4xl font-extrabold text-white mb-3 tracking-tight">Optimization Complete</h2>
                                                <p className="text-gray-400 text-lg">Your resume has been structurally and linguistically enhanced.</p>
                                                <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
                                                    <span className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-emerald-300">
                                                        Saved to CV Library
                                                    </span>
                                                </div>
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
                                                {(results.download_url || results.pdf_s3_url || results.pdf_base64) && (
                                                    <a 
                                                        href={results.download_url ? buildApiUrl(results.download_url) : (results.pdf_s3_url || `data:application/pdf;base64,${results.pdf_base64}`)}
                                                        download={results.download_url || results.pdf_s3_url ? undefined : `Optimized_Resume_${new Date().getTime()}.pdf`}
                                                        target={results.download_url || results.pdf_s3_url ? "_blank" : undefined}
                                                        rel="noopener noreferrer"
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
                        </div>
                    </div>
                )}

                {activeTab === "library" && (
                    <div className="h-full overflow-y-auto p-8 md:p-12 lg:p-16 custom-scrollbar animate-fade-in">
                        <div className="w-full max-w-7xl mx-auto">
                            <div className="mb-10 flex justify-between items-end border-b border-gray-800/80 pb-8">
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">CV Library</p>
                                    <h2 className="mt-3 text-4xl font-extrabold tracking-tight text-white">Saved resumes by job description</h2>
                                    <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-400">
                                        Every optimized CV is stored with its job description link, ATS score, and generation time so you can reopen the right version quickly.
                                    </p>
                                </div>
                                <button
                                    onClick={loadHistory}
                                    className="rounded-xl border border-gray-700 bg-gray-900/70 px-5 py-3 text-sm font-bold text-blue-300 transition-colors hover:border-blue-500/50 hover:bg-gray-800 hover:text-blue-200"
                                >
                                    Refresh Library
                                </button>
                            </div>

                            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                                <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
                                    <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Saved CVs</p>
                                    <p className="mt-3 text-3xl font-black text-white">{historyStats.total}</p>
                                </div>
                                <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
                                    <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Matched JDs</p>
                                    <p className="mt-3 text-3xl font-black text-emerald-300">{historyStats.jdCount}</p>
                                </div>
                                <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
                                    <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Avg ATS</p>
                                    <p className="mt-3 text-3xl font-black text-blue-300">{historyStats.averageScore || "--"}{historyStats.averageScore ? "%" : ""}</p>
                                </div>
                            </div>

                            <div className="mt-8 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_180px_220px]">
                                <input
                                    type="search"
                                    className="w-full rounded-xl border border-gray-700/80 bg-gray-900/50 p-4 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                                    placeholder="Search by resume, JD title, or job link"
                                    value={historySearch}
                                    onChange={(e) => setHistorySearch(e.target.value)}
                                />
                                <select
                                    className="w-full rounded-xl border border-gray-700/80 bg-gray-900/50 p-4 text-sm text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                                    value={historyTimespan}
                                    onChange={(e) => setHistoryTimespan(e.target.value)}
                                >
                                    {HISTORY_TIMESPANS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                                <select
                                    className="w-full rounded-xl border border-gray-700/80 bg-gray-900/50 p-4 text-sm text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                                    value={selectedJdId}
                                    onChange={(e) => setSelectedJdId(e.target.value)}
                                >
                                    <option value="">All job descriptions</option>
                                    {jdOptions.map((jd) => (
                                        <option key={jd.id} value={jd.id}>
                                            {jd.company ? `${jd.title} at ${jd.company}` : jd.title}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="mt-8 overflow-hidden rounded-xl border border-gray-800 bg-gray-900/30">
                                <div className="hidden grid-cols-[1.4fr_1.4fr_120px_140px] gap-4 border-b border-gray-800 px-5 py-4 text-xs font-bold uppercase tracking-widest text-gray-500 lg:grid bg-gray-950/50">
                                    <span>CV</span>
                                    <span>Job Description</span>
                                    <span>ATS</span>
                                    <span>Timespan</span>
                                </div>
                                {historyLoading && (
                                    <p className="px-5 py-8 text-sm text-gray-500">Loading saved CVs...</p>
                                )}
                                {!historyLoading && filteredHistory.length === 0 && (
                                    <div className="px-5 py-12 text-sm text-gray-500">
                                        No saved CVs match the current JD and timespan filters.
                                    </div>
                                )}
                                {!historyLoading && filteredHistory.map((item) => (
                                    <div key={item.id} className="grid grid-cols-1 gap-3 border-b border-gray-800/70 px-5 py-5 last:border-b-0 lg:grid-cols-[1.4fr_1.4fr_120px_140px] lg:items-center hover:bg-gray-800/20 transition-colors">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-bold text-gray-100">{item.resume_title}</p>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {item.download_url && (
                                                    <a
                                                        href={buildApiUrl(item.download_url)}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="rounded-lg bg-blue-500/10 px-3 py-2 text-xs font-bold text-blue-300 hover:bg-blue-500/20"
                                                    >
                                                        Open CV
                                                    </a>
                                                )}
                                                <button
                                                    onClick={() => handleDeleteHistory(item.id)}
                                                    className="rounded-lg bg-red-500/10 px-3 py-2 text-xs font-bold text-red-400 hover:bg-red-500/20 transition-colors"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </div>
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-bold text-emerald-300">{getJobLabel(item)}</p>
                                            <p className="mt-1 truncate text-xs text-gray-400">{getCompanyLabel(item)}</p>
                                        </div>
                                        <p className="text-sm font-black text-emerald-300">{item.ats_score > 0 ? `${Math.round(item.ats_score)}%` : "--"}</p>
                                        <p className="text-xs font-medium text-gray-500">{formatRelativeDate(item.created_at)}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === "agent" && (
                    <div className="h-full overflow-y-auto p-8 md:p-12 lg:p-16 custom-scrollbar animate-fade-in flex flex-col items-center">
                        <div className="w-full max-w-5xl mx-auto flex flex-col h-full">
                            <div className="mb-8 text-center shrink-0">
                                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-purple-500/10 mb-4 border border-purple-500/20 shadow-lg shadow-purple-500/10">
                                    <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                </div>
                                <h2 className="text-4xl font-extrabold tracking-tight text-white">AI Agent Workspace</h2>
                                <p className="mt-4 text-sm leading-6 text-gray-400 max-w-xl mx-auto">
                                    Interact seamlessly with your Google Workspace. Draft emails, organize meetings, or manage files. Your agent uses your saved CV library to provide deep context.
                                </p>
                            </div>
                            <div className="w-full max-w-4xl mx-auto flex-1 pb-10">
                                <AgentChatBox history={filteredHistory} />
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === "emails" && (
                    <div className="h-full overflow-y-auto p-8 md:p-12 lg:p-16 custom-scrollbar animate-fade-in flex flex-col items-center">
                        <div className="w-full max-w-7xl mx-auto flex flex-col h-full">
                            <div className="mb-8 flex justify-between items-end border-b border-gray-800/80 pb-8 shrink-0">
                                <div>
                                    <h2 className="text-4xl font-extrabold tracking-tight text-white mb-3">Email Outreach Tracking</h2>
                                    <p className="text-gray-400 text-sm max-w-2xl">
                                        Monitor cold emails sent by your AI Agent, read replies from recruiters or founders, and draft smart responses refined by AI.
                                    </p>
                                </div>
                            </div>
                            <div className="w-full flex-1 pb-10">
                                <EmailTracker />
                            </div>
                        </div>
                    </div>
                )}
            </main>
            
            {/* Inline styles for custom animations */}
            <style>{`
                @keyframes fade-in {
                    0% { opacity: 0; transform: translateY(15px); }
                    100% { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in { animation: fade-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                
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
