import React, { useEffect, useMemo, useState } from 'react';
import { resumeApi } from '../api/client';

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
                        <label className="flex items-center justify-between gap-3 text-sm font-bold text-gray-300 uppercase tracking-widest">
                            <span className="flex min-w-0 items-center">
                                <span className="w-6 h-6 rounded-md bg-emerald-500/20 text-emerald-400 flex items-center justify-center mr-2 text-xs">2</span>
                                Job Description Link
                            </span>
                            <span className="shrink-0 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-amber-200">
                                Coming Soon
                            </span>
                        </label>
                        <input
                            type="url"
                            className="w-full cursor-not-allowed rounded-2xl border border-gray-800 bg-gray-900/30 p-4 text-sm text-gray-500 shadow-inner placeholder-gray-600"
                            placeholder="Job description link support is coming soon"
                            value=""
                            disabled
                            aria-disabled="true"
                        />
                    </div>

                    <div className="space-y-3">
                        <label className="flex items-center text-sm font-bold text-gray-300 uppercase tracking-widest">
                            <span className="w-6 h-6 rounded-md bg-emerald-500/20 text-emerald-400 flex items-center justify-center mr-2 text-xs">3</span>
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
                            <span className="w-6 h-6 rounded-md bg-purple-500/20 text-purple-400 flex items-center justify-center mr-2 text-xs">4</span>
                            Custom Instructions
                        </label>
                        <textarea 
                            className="w-full h-36 bg-gray-900/50 border border-gray-700/80 rounded-2xl p-4 text-sm text-gray-300 focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/50 resize-none transition-all placeholder-gray-600 shadow-inner custom-scrollbar"
                            placeholder="e.g., 'Make it sound more executive', 'Shorten bullet points', 'Highlight Python skills'..."
                            value={additionalPrompt}
                            onChange={(e) => setAdditionalPrompt(e.target.value)}
                        />
                    </div>

                    <div className="space-y-4 border-t border-gray-800/60 pt-8">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <label className="text-sm font-bold text-gray-300 uppercase tracking-widest">CV Library</label>
                                <p className="mt-1 text-xs text-gray-500">{historyStats.visible} of {historyStats.total} saved CVs</p>
                            </div>
                            <button
                                type="button"
                                onClick={loadHistory}
                                className="rounded-lg border border-gray-700 bg-gray-900/70 px-3 py-2 text-xs font-bold text-blue-300 transition-colors hover:border-blue-500/50 hover:text-blue-200"
                            >
                                Refresh
                            </button>
                        </div>
                        <div className="grid grid-cols-4 gap-1 rounded-xl border border-gray-800 bg-gray-950/60 p-1">
                            {HISTORY_TIMESPANS.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => setHistoryTimespan(option.value)}
                                    className={`rounded-lg px-2 py-2 text-xs font-bold transition-colors ${
                                        historyTimespan === option.value
                                            ? "bg-blue-500/20 text-blue-200"
                                            : "text-gray-500 hover:text-gray-300"
                                    }`}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <select
                                className="min-w-0 bg-gray-900/50 border border-gray-700/80 rounded-xl p-3 text-sm text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                                value={selectedJdId}
                                onChange={(e) => setSelectedJdId(e.target.value)}
                            >
                                <option value="">All JDs</option>
                                {jdOptions.map((jd) => (
                                    <option key={jd.id} value={jd.id}>
                                        {jd.company ? `${jd.title} at ${jd.company}` : jd.title}
                                    </option>
                                ))}
                            </select>
                            <input
                                type="search"
                                className="min-w-0 bg-gray-900/50 border border-gray-700/80 rounded-xl p-3 text-sm text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500/50 placeholder-gray-600"
                                placeholder="Search"
                                value={historySearch}
                                onChange={(e) => setHistorySearch(e.target.value)}
                            />
                        </div>
                        <div className="space-y-3 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
                            {historyLoading && <p className="text-xs text-gray-500">Loading saved resumes...</p>}
                            {!historyLoading && filteredHistory.length === 0 && (
                                <p className="text-xs text-gray-500">No saved resumes match this filter.</p>
                            )}
                            {filteredHistory.map((item) => (
                                <div key={item.id} className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 transition-colors hover:border-blue-500/30">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-bold text-gray-200">{item.resume_title}</p>
                                            <p className="mt-1 truncate text-xs font-bold text-emerald-300">{getJobLabel(item)}</p>
                                            <p className="mt-1 truncate text-[11px] text-gray-500">{getCompanyLabel(item)}</p>
                                            <p className="mt-1 text-[11px] text-gray-500">{formatRelativeDate(item.created_at)}</p>
                                        </div>
                                        {item.ats_score > 0 && (
                                            <span className="shrink-0 rounded-lg bg-emerald-500/10 px-2 py-1 text-xs font-bold text-emerald-300">
                                                {Math.round(item.ats_score)}%
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {item.download_url && (
                                            <a
                                                href={buildApiUrl(item.download_url)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="rounded-lg bg-blue-500/10 px-3 py-2 text-xs font-bold text-blue-300 hover:bg-blue-500/20"
                                            >
                                                Open Resume
                                            </a>
                                        )}
                                        {item.jd_source_url && (
                                            <a
                                                href={item.jd_source_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20"
                                            >
                                                Open JD
                                            </a>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
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
            <main className="flex-1 relative h-full overflow-y-auto bg-[#060b16] custom-scrollbar">
                <div className="relative z-10 w-full min-h-full flex flex-col p-8 md:p-12 lg:p-16">
                    {!loading && !results && (
                        <div className="w-full max-w-7xl mx-auto animate-fade-in">
                            <div className="mb-10 border-b border-gray-800/80 pb-8">
                                <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">CV Library</p>
                                <h2 className="mt-3 text-4xl font-extrabold tracking-tight text-white">Saved resumes by job description</h2>
                                <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-400">
                                    Every optimized CV is stored with its job description link, ATS score, and generation time so you can reopen the right version quickly.
                                </p>
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
                                <div className="hidden grid-cols-[1.4fr_1.4fr_120px_140px] gap-4 border-b border-gray-800 px-5 py-3 text-xs font-bold uppercase tracking-widest text-gray-500 lg:grid">
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
                                    <div key={item.id} className="grid grid-cols-1 gap-3 border-b border-gray-800/70 px-5 py-4 last:border-b-0 lg:grid-cols-[1.4fr_1.4fr_120px_140px] lg:items-center">
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
                                            </div>
                                        </div>
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-bold text-emerald-300">{getJobLabel(item)}</p>
                                            <p className="mt-1 truncate text-xs text-gray-400">{getCompanyLabel(item)}</p>
                                            {item.jd_source_url && (
                                                <a
                                                    href={item.jd_source_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="mt-1 block truncate text-xs text-gray-500 hover:text-gray-300"
                                                >
                                                    {item.jd_source_url}
                                                </a>
                                            )}
                                        </div>
                                        <p className="text-sm font-black text-emerald-300">{item.ats_score > 0 ? `${Math.round(item.ats_score)}%` : "--"}</p>
                                        <p className="text-xs font-medium text-gray-500">{formatRelativeDate(item.created_at)}</p>
                                    </div>
                                ))}
                            </div>
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
                                    <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
                                        <span className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-emerald-300">
                                            Saved to CV Library
                                        </span>
                                        {results.jd_title && (
                                            <span className="max-w-xl truncate rounded-lg border border-gray-700 bg-gray-900/60 px-3 py-2 text-gray-300">
                                                JD: {results.jd_title}
                                            </span>
                                        )}
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
            </main>
            
            {/* Inline styles for custom animations */}
            <style>{`
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
