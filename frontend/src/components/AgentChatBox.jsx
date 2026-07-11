import React, { useState } from 'react';
import { agentApi } from '../api/client';

export function AgentChatBox({ history }) {
    const [prompt, setPrompt] = useState("");
    const [selectedResumeUrl, setSelectedResumeUrl] = useState("");
    const [mode, setMode] = useState("idle"); // idle, drafting, review, executing, done
    const [draftResult, setDraftResult] = useState("");
    const [finalResult, setFinalResult] = useState("");
    const [error, setError] = useState("");

    const quickActions = [
        { icon: "📅", label: "Check Calendar", prompt: "What is on my calendar for today and tomorrow?" },
        { icon: "📁", label: "Find Resume", prompt: "Search my Google Drive for my latest resume or CV." },
        { icon: "✉️", label: "Recent Emails", prompt: "List my 5 most recent emails." },
        { icon: "✍️", label: "Draft Pitch", prompt: "Draft a cold email pitching my profile to hiring@startup.com." }
    ];

    const handleDraft = async () => {
        if (!prompt.trim()) return;
        setMode("drafting");
        setError("");
        setDraftResult("");
        setFinalResult("");

        try {
            let contextPrompt = prompt;
            if (selectedResumeUrl) {
                const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
                let absUrl = selectedResumeUrl;
                if (!absUrl.startsWith("http")) absUrl = `${API_URL}${absUrl}`;
                contextPrompt = `${prompt}\n\nHere is a link to my resume that you should use/attach: ${absUrl}`;
            }

            const safePrompt = `${contextPrompt}\n\nCRITICAL INSTRUCTION: Do NOT execute any tools that modify state or send data (e.g. do NOT send emails, do NOT create calendar events). Instead, ONLY draft the exact content (subject, body, recipient, event details, etc) that you intend to use and present it to me for review.`;

            const data = await agentApi.executeAction(safePrompt);
            setDraftResult(data.result || "No draft generated.");
            setMode("review");
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.detail || "Failed to draft action.");
            setMode("idle");
        }
    };

    const handleExecute = async () => {
        setMode("executing");
        setError("");
        
        try {
            let contextPrompt = prompt;
            if (selectedResumeUrl) {
                const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
                let absUrl = selectedResumeUrl;
                if (!absUrl.startsWith("http")) absUrl = `${API_URL}${absUrl}`;
                contextPrompt = `${prompt}\n\nResume link: ${absUrl}`;
            }

            // Instruct the LLM to actually execute now using the provided draft
            const executePrompt = `Earlier I asked you to: "${contextPrompt}". \n\nI have reviewed and approved the following draft you generated:\n\n"""\n${draftResult}\n"""\n\nPlease execute the tools necessary to complete this action NOW using the approved draft content. Do not ask for confirmation again.`;

            const data = await agentApi.executeAction(executePrompt);
            setFinalResult(data.result || "Action executed successfully.");
            setMode("done");
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.detail || "Failed to execute action.");
            setMode("review");
        }
    };

    const handleCancel = () => {
        setMode("idle");
        setDraftResult("");
        setFinalResult("");
        setError("");
    };

    return (
        <div className="mt-8 bg-gray-900/40 p-6 rounded-[2rem] border border-gray-800/80 backdrop-blur-sm animate-fade-in flex flex-col h-full shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-purple-600/5 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 bg-blue-600/5 rounded-full blur-3xl pointer-events-none"></div>

            <div className="flex items-center justify-between mb-6 relative z-10">
                <h3 className="text-sm font-bold text-gray-200 uppercase tracking-widest flex items-center">
                    <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center mr-3 border border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.15)]">
                        <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    </div>
                    Google Workspace Agent
                </h3>
            </div>
            
            <p className="text-xs text-gray-400 mb-6 relative z-10 leading-relaxed border-l-2 border-purple-500/30 pl-3">
                Your AI agent automatically memorizes your resume profile (Name, Email, Phone, Skills). 
                Ask it to draft emails, check your calendar, or search drive. Review drafts before approving!
            </p>

            <div className="space-y-5 relative z-10">
                {/* Input Mode */}
                {mode === "idle" && (
                    <div className="animate-fade-in space-y-5">
                        
                        {/* Quick Actions */}
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Quick Actions</label>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                {quickActions.map((action, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setPrompt(action.prompt)}
                                        className="flex flex-col items-center justify-center p-3 rounded-xl bg-gray-800/40 border border-gray-700/60 hover:bg-gray-800 hover:border-purple-500/40 transition-all group"
                                    >
                                        <span className="text-lg mb-1 group-hover:scale-110 transition-transform">{action.icon}</span>
                                        <span className="text-[10px] text-gray-400 font-semibold text-center leading-tight group-hover:text-gray-300">{action.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Attach a Resume (Optional)</label>
                            <select
                                className="w-full rounded-xl border border-gray-700/80 bg-gray-900/50 p-3 text-sm text-gray-300 focus:outline-none focus:ring-1 focus:ring-purple-500/50 appearance-none"
                                value={selectedResumeUrl}
                                onChange={(e) => setSelectedResumeUrl(e.target.value)}
                            >
                                <option value="">-- Do not attach --</option>
                                {history && history.filter(item => item.download_url).map(item => (
                                    <option key={item.id} value={item.download_url}>
                                        {item.resume_title} {item.jd_title ? `(${item.jd_title})` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">What would you like me to do?</label>
                            <div className="relative">
                                <textarea 
                                    className="w-full h-28 bg-gray-950/50 border border-gray-700/80 rounded-xl p-4 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-purple-500/50 resize-none placeholder-gray-600 shadow-inner custom-scrollbar"
                                    placeholder="e.g. 'Draft a cold email to hiring@startup.com pitching me for the frontend role and attach my resume.'"
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                />
                                <div className="absolute bottom-3 right-3 text-[10px] font-bold text-gray-600 uppercase tracking-widest bg-gray-900 px-2 py-1 rounded">Shift + Enter for new line</div>
                            </div>
                        </div>

                        <button
                            onClick={handleDraft}
                            disabled={!prompt.trim()}
                            className="w-full py-3.5 rounded-xl font-bold text-sm tracking-wide transition-all bg-gradient-to-r from-purple-600/20 to-blue-600/20 text-purple-300 border border-purple-500/40 hover:border-purple-500/70 hover:shadow-[0_0_20px_rgba(168,85,247,0.15)] flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                            Draft Action for Review
                        </button>
                    </div>
                )}

                {/* Loading State for Draft */}
                {mode === "drafting" && (
                    <div className="flex flex-col items-center justify-center py-12 animate-pulse bg-gray-900/50 rounded-xl border border-gray-800">
                        <div className="relative w-12 h-12 mb-4">
                            <div className="absolute inset-0 rounded-full border-t-2 border-r-2 border-purple-500 animate-spin"></div>
                            <div className="absolute inset-2 rounded-full border-b-2 border-l-2 border-blue-500 animate-spin animate-reverse"></div>
                        </div>
                        <p className="text-xs text-purple-400 font-bold uppercase tracking-widest">Agent is thinking and drafting...</p>
                        <p className="text-[10px] text-gray-500 mt-2 max-w-xs text-center">Using your profile memory and Google Workspace tools to build the perfect draft.</p>
                    </div>
                )}

                {/* Review Mode */}
                {mode === "review" && (
                    <div className="animate-fade-in space-y-4">
                        <div className="bg-[#0b0e14]/80 border border-gray-700 p-5 rounded-xl shadow-inner">
                            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-800">
                                <p className="text-xs font-bold text-purple-400 uppercase tracking-widest flex items-center">
                                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                    Review Draft
                                </p>
                                <span className="bg-amber-500/10 text-amber-400 text-[9px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider border border-amber-500/20 animate-pulse">Needs Approval</span>
                            </div>
                            <textarea 
                                className="w-full h-48 bg-transparent text-sm text-gray-300 focus:outline-none resize-none custom-scrollbar leading-relaxed"
                                value={draftResult}
                                onChange={(e) => setDraftResult(e.target.value)}
                            />
                            <div className="mt-3 text-[10px] font-medium text-gray-500 flex items-center">
                                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                You can edit the text directly above before confirming.
                            </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={handleCancel}
                                className="flex-1 py-3.5 rounded-xl font-bold text-xs uppercase tracking-widest text-gray-400 bg-gray-800/50 border border-gray-700 hover:bg-gray-800 hover:text-gray-300 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleExecute}
                                className="flex-[2] py-3.5 rounded-xl font-bold text-xs uppercase tracking-widest text-emerald-300 bg-emerald-600/20 border border-emerald-500/50 hover:bg-emerald-500/30 hover:text-emerald-200 hover:shadow-[0_0_15px_rgba(16,185,129,0.15)] transition-all flex items-center justify-center"
                            >
                                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                Confirm & Execute
                            </button>
                        </div>
                    </div>
                )}

                {/* Loading State for Execute */}
                {mode === "executing" && (
                    <div className="flex flex-col items-center justify-center py-12 animate-pulse bg-emerald-900/10 rounded-xl border border-emerald-900/30">
                        <div className="w-10 h-10 rounded-full border-t-2 border-r-2 border-emerald-500 animate-spin mb-4"></div>
                        <p className="text-xs text-emerald-400 font-bold uppercase tracking-widest">Executing action in Google Workspace...</p>
                    </div>
                )}

                {/* Done Mode */}
                {mode === "done" && (
                    <div className="animate-fade-in space-y-4">
                        <div className="bg-emerald-900/10 border border-emerald-800 p-5 rounded-xl">
                            <div className="flex items-center mb-4 pb-3 border-b border-emerald-800/50">
                                <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center mr-3 border border-emerald-500/30">
                                    <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                </div>
                                <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Action Complete</p>
                            </div>
                            <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{finalResult}</div>
                        </div>
                        <button
                            onClick={handleCancel}
                            className="w-full py-3.5 rounded-xl font-bold text-xs uppercase tracking-widest text-gray-400 bg-gray-800/50 border border-gray-700 hover:bg-gray-800 hover:text-gray-300 transition-colors"
                        >
                            Start New Action
                        </button>
                    </div>
                )}

                {error && (
                    <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-xl animate-fade-in flex items-start">
                        <svg className="w-5 h-5 text-red-400 mr-3 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <p className="text-sm text-red-400 leading-relaxed">{error}</p>
                    </div>
                )}
            </div>
        </div>
    );
}

