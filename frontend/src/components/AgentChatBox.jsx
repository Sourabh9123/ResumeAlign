import React, { useState } from 'react';
import { agentApi } from '../api/client';

export function AgentChatBox({ history }) {
    const [prompt, setPrompt] = useState("");
    const [bulkEmails, setBulkEmails] = useState("");
    const [selectedResumeUrl, setSelectedResumeUrl] = useState("");
    const [mode, setMode] = useState("idle"); // idle, drafting, review, executing, done
    const [draftResult, setDraftResult] = useState("");
    const [finalResult, setFinalResult] = useState("");
    const [error, setError] = useState("");

    const quickActions = [
        { icon: "📅", label: "Check Calendar", prompt: "What is on my calendar for today and tomorrow?" },
        { icon: "📁", label: "Find Resume", prompt: "Search my Google Drive for my latest resume or CV." },
        { icon: "✉️", label: "Recent Emails", prompt: "List my 5 most recent emails." },
        { icon: "✍️", label: "Draft Pitch", prompt: "Draft a cold email pitching my profile for a frontend role." }
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
                contextPrompt = `${prompt}\n\nCRITICAL: The system has provided this resume link: ${absUrl}. You MUST use this link in the 'attachment_url' field when calling any email tools. DO NOT include this link directly in the body of the email text! The email tool will natively attach the file for you. If you do not have my name in memory, try to extract it from the resume if you can read it, or sign off naturally without bracketed placeholders like [Your Name].`;
            }

            if (bulkEmails.trim()) {
                contextPrompt = `${contextPrompt}\n\nI want to send this as a mass outreach campaign to the following recipients:\n${bulkEmails}\n\nPlease draft the single email template that will be sent individually to each of them.`;
            }

            const safePrompt = `${contextPrompt}\n\nCRITICAL INSTRUCTION: Do NOT execute any tools that modify state or send data (e.g. do NOT send emails, do NOT create calendar events). Instead, ONLY draft the exact content (subject, body, recipient, event details, etc) that you intend to use and present it to me for review. DO NOT use bracketed placeholders like [Your Name] if possible; either use the injected memory or a generic sign-off.`;

            const data = await agentApi.executeAction(safePrompt, selectedResumeUrl);
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
                contextPrompt = `${prompt}\n\nCRITICAL: Resume link: ${absUrl}. You MUST use this link in the 'attachment_url' field when calling any email tools. DO NOT include this link directly in the body of the email text! The email tool will natively attach the file for you.`;
            }

            if (bulkEmails.trim()) {
                contextPrompt = `${contextPrompt}\n\nRecipients:\n${bulkEmails}`;
            }

            // Instruct the LLM to actually execute now using the provided draft
            const executePrompt = `Earlier I asked you to: "${contextPrompt}". \n\nI have reviewed and approved the following draft you generated:\n\n"""\n${draftResult}\n"""\n\nPlease execute the tools necessary to complete this action NOW using the approved draft content. ${bulkEmails.trim() ? "CRITICAL: You MUST use the 'send_bulk_emails' tool to send this individually to the specified list of recipients." : ""} Do not ask for confirmation again.`;

            const data = await agentApi.executeAction(executePrompt, selectedResumeUrl);
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
        <div className="bg-gray-900/40 p-8 md:p-12 rounded-[2.5rem] border border-gray-800/80 backdrop-blur-sm animate-fade-in flex flex-col h-full shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-purple-600/5 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 bg-blue-600/5 rounded-full blur-3xl pointer-events-none"></div>

            <div className="flex items-center justify-between mb-8 relative z-10">
                <h3 className="text-base font-bold text-gray-200 uppercase tracking-widest flex items-center">
                    <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center mr-4 border border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.15)]">
                        <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    </div>
                    Google Workspace Agent
                </h3>
            </div>
            
            <p className="text-sm text-gray-400 mb-8 relative z-10 leading-relaxed border-l-2 border-purple-500/30 pl-4">
                Your AI agent automatically memorizes your resume profile (Name, Email, Phone, Skills). 
                Ask it to draft emails, check your calendar, or search drive. Review drafts before approving!
            </p>

            <div className="space-y-8 relative z-10">
                {/* Input Mode */}
                {mode === "idle" && (
                    <div className="animate-fade-in space-y-8">
                        
                        {/* Quick Actions */}
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Quick Actions</label>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {quickActions.map((action, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setPrompt(action.prompt)}
                                        className="flex flex-col items-center justify-center p-5 rounded-2xl bg-gray-800/40 border border-gray-700/60 hover:bg-gray-800 hover:border-purple-500/40 transition-all group"
                                    >
                                        <span className="text-2xl mb-2 group-hover:scale-110 transition-transform">{action.icon}</span>
                                        <span className="text-xs text-gray-400 font-semibold text-center leading-tight group-hover:text-gray-300">{action.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Attach a Resume (Optional)</label>
                            <select
                                className="w-full rounded-2xl border border-gray-700/80 bg-gray-900/50 p-4 text-base text-gray-300 focus:outline-none focus:ring-1 focus:ring-purple-500/50 appearance-none"
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
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">What would you like me to do?</label>
                            <div className="relative">
                                <textarea 
                                    className="w-full min-h-[140px] bg-gray-950/50 border border-gray-700/80 rounded-2xl p-5 text-base text-gray-200 focus:outline-none focus:ring-1 focus:ring-purple-500/50 resize-none placeholder-gray-600 shadow-inner custom-scrollbar leading-relaxed"
                                    placeholder="e.g. 'Draft a cold email pitching me for the frontend role...'"
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                />
                                <div className="absolute bottom-4 right-4 text-xs font-bold text-gray-600 uppercase tracking-widest bg-gray-900 px-3 py-1.5 rounded-lg">Shift + Enter for new line</div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 flex items-center justify-between">
                                <span>Mass Outreach Recipients (Optional)</span>
                                <span className="text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded text-[10px]">BETA</span>
                            </label>
                            <textarea 
                                className="w-full min-h-[100px] bg-gray-950/50 border border-gray-700/80 rounded-2xl p-5 text-base text-gray-300 focus:outline-none focus:ring-1 focus:ring-purple-500/50 resize-none placeholder-gray-600 shadow-inner custom-scrollbar leading-relaxed"
                                placeholder="Paste a comma-separated list of emails or emails on new lines (e.g. hr1@company.com, hr2@startup.com)"
                                value={bulkEmails}
                                onChange={(e) => setBulkEmails(e.target.value)}
                            />
                        </div>

                        <button
                            onClick={handleDraft}
                            disabled={!prompt.trim()}
                            className="w-full py-4 rounded-2xl font-bold text-base tracking-widest uppercase transition-all bg-gradient-to-r from-purple-600/20 to-blue-600/20 text-purple-300 border border-purple-500/40 hover:border-purple-500/70 hover:shadow-[0_0_20px_rgba(168,85,247,0.15)] flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed mt-4"
                        >
                            <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                            Draft Action for Review
                        </button>
                    </div>
                )}

                {/* Loading State for Draft */}
                {mode === "drafting" && (
                    <div className="flex flex-col items-center justify-center py-16 animate-pulse bg-gray-900/50 rounded-2xl border border-gray-800">
                        <div className="relative w-16 h-16 mb-6">
                            <div className="absolute inset-0 rounded-full border-t-2 border-r-2 border-purple-500 animate-spin"></div>
                            <div className="absolute inset-3 rounded-full border-b-2 border-l-2 border-blue-500 animate-spin animate-reverse"></div>
                        </div>
                        <p className="text-sm text-purple-400 font-bold uppercase tracking-widest mb-2">Agent is thinking and drafting...</p>
                        <p className="text-xs text-gray-500 max-w-sm text-center leading-relaxed">Using your profile memory and Google Workspace tools to build the perfect draft.</p>
                    </div>
                )}

                {/* Review Mode */}
                {mode === "review" && (
                    <div className="animate-fade-in space-y-6">
                        <div className="bg-[#0b0e14]/80 border border-gray-700 p-6 rounded-2xl shadow-inner">
                            <div className="flex items-center justify-between mb-5 pb-4 border-b border-gray-800">
                                <p className="text-sm font-bold text-purple-400 uppercase tracking-widest flex items-center">
                                    <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                    Review Draft
                                </p>
                                <span className="bg-amber-500/10 text-amber-400 text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wider border border-amber-500/20 animate-pulse">Needs Approval</span>
                            </div>
                            <textarea 
                                className="w-full h-64 bg-transparent text-base text-gray-300 focus:outline-none resize-none custom-scrollbar leading-relaxed"
                                value={draftResult}
                                onChange={(e) => setDraftResult(e.target.value)}
                            />
                            <div className="mt-4 text-xs font-medium text-gray-500 flex items-center bg-gray-900/50 p-3 rounded-xl">
                                <svg className="w-4 h-4 mr-2 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                You can edit the text directly above before confirming.
                            </div>
                        </div>

                        <div className="flex gap-4 pt-2">
                            <button
                                onClick={handleCancel}
                                className="flex-1 py-4 rounded-2xl font-bold text-sm uppercase tracking-widest text-gray-400 bg-gray-800/50 border border-gray-700 hover:bg-gray-800 hover:text-gray-300 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleExecute}
                                className="flex-[2] py-4 rounded-2xl font-bold text-sm uppercase tracking-widest text-emerald-300 bg-emerald-600/20 border border-emerald-500/50 hover:bg-emerald-500/30 hover:text-emerald-200 hover:shadow-[0_0_20px_rgba(16,185,129,0.15)] transition-all flex items-center justify-center"
                            >
                                <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                Confirm & Execute
                            </button>
                        </div>
                    </div>
                )}

                {/* Loading State for Execute */}
                {mode === "executing" && (
                    <div className="flex flex-col items-center justify-center py-16 animate-pulse bg-emerald-900/10 rounded-2xl border border-emerald-900/30">
                        <div className="w-12 h-12 rounded-full border-t-2 border-r-2 border-emerald-500 animate-spin mb-6"></div>
                        <p className="text-sm text-emerald-400 font-bold uppercase tracking-widest">Executing action in Google Workspace...</p>
                    </div>
                )}

                {/* Done Mode */}
                {mode === "done" && (
                    <div className="animate-fade-in space-y-6">
                        <div className="bg-emerald-900/10 border border-emerald-800 p-6 rounded-2xl">
                            <div className="flex items-center mb-5 pb-4 border-b border-emerald-800/50">
                                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center mr-4 border border-emerald-500/30">
                                    <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                </div>
                                <p className="text-sm font-bold text-emerald-400 uppercase tracking-widest">Action Complete</p>
                            </div>
                            <div className="text-base text-gray-300 whitespace-pre-wrap leading-relaxed">{finalResult}</div>
                        </div>
                        <button
                            onClick={handleCancel}
                            className="w-full py-4 rounded-2xl font-bold text-sm uppercase tracking-widest text-gray-400 bg-gray-800/50 border border-gray-700 hover:bg-gray-800 hover:text-gray-300 transition-colors"
                        >
                            Start New Action
                        </button>
                    </div>
                )}

                {error && (
                    <div className="p-5 bg-red-900/20 border border-red-500/30 rounded-2xl animate-fade-in flex items-start">
                        <svg className="w-6 h-6 text-red-400 mr-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <p className="text-base text-red-400 leading-relaxed pt-0.5">{error}</p>
                    </div>
                )}
            </div>
        </div>
    );
}

