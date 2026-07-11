import React, { useState } from 'react';
import { agentApi } from '../api/client';

export function AgentChatBox({ history }) {
    const [prompt, setPrompt] = useState("");
    const [selectedResumeUrl, setSelectedResumeUrl] = useState("");
    const [mode, setMode] = useState("idle"); // idle, drafting, review, executing, done
    const [draftResult, setDraftResult] = useState("");
    const [finalResult, setFinalResult] = useState("");
    const [error, setError] = useState("");

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
        <div className="mt-8 bg-gray-900/40 p-6 rounded-[2rem] border border-gray-800/80 backdrop-blur-sm animate-fade-in">
            <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest mb-4 flex items-center">
                <svg className="w-5 h-5 mr-2 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                Google Workspace Agent
            </h3>
            
            <p className="text-xs text-gray-500 mb-4">
                Ask the agent to draft emails, calendar events, or docs. Review the draft before approving the final execution!
            </p>

            <div className="space-y-4">
                {/* Input Mode */}
                {mode === "idle" && (
                    <div className="animate-fade-in">
                        <div className="mb-4">
                            <label className="block text-xs font-bold text-gray-400 mb-2">Attach a Resume (Optional)</label>
                            <select
                                className="w-full rounded-xl border border-gray-700/80 bg-gray-900/50 p-3 text-sm text-gray-300 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
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

                        <div className="mb-4">
                            <label className="block text-xs font-bold text-gray-400 mb-2">What would you like me to do?</label>
                            <textarea 
                                className="w-full h-24 bg-gray-950/50 border border-gray-700/80 rounded-xl p-3 text-sm text-gray-300 focus:outline-none focus:ring-1 focus:ring-purple-500/50 resize-none placeholder-gray-600 shadow-inner custom-scrollbar"
                                placeholder="e.g. 'Draft a cold email to hiring@startup.com pitching me for the frontend role and attach my resume.'"
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                            />
                        </div>

                        <button
                            onClick={handleDraft}
                            disabled={!prompt.trim()}
                            className="w-full py-3 rounded-xl font-bold text-sm tracking-wide transition-all bg-purple-600/20 text-purple-300 border border-purple-500/50 hover:bg-purple-500/30 hover:text-purple-200"
                        >
                            Draft Action for Review
                        </button>
                    </div>
                )}

                {/* Loading State for Draft */}
                {mode === "drafting" && (
                    <div className="flex flex-col items-center justify-center py-6 animate-pulse">
                        <div className="w-8 h-8 rounded-full border-t-2 border-r-2 border-purple-500 animate-spin mb-3"></div>
                        <p className="text-xs text-purple-400 font-bold uppercase tracking-widest">Agent is drafting...</p>
                    </div>
                )}

                {/* Review Mode */}
                {mode === "review" && (
                    <div className="animate-fade-in space-y-4">
                        <div className="bg-[#0b0e14] border border-gray-800 p-4 rounded-xl">
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-xs font-bold text-purple-400 uppercase tracking-widest">Review Draft</p>
                                <span className="bg-amber-500/10 text-amber-400 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider border border-amber-500/20">Needs Approval</span>
                            </div>
                            <textarea 
                                className="w-full h-40 bg-transparent text-sm text-gray-300 focus:outline-none resize-none custom-scrollbar"
                                value={draftResult}
                                onChange={(e) => setDraftResult(e.target.value)}
                            />
                            <p className="text-[10px] text-gray-500 mt-2">You can edit the text above before confirming.</p>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={handleCancel}
                                className="flex-1 py-3 rounded-xl font-bold text-sm text-gray-400 bg-gray-800/50 border border-gray-700 hover:bg-gray-800 hover:text-gray-300 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleExecute}
                                className="flex-[2] py-3 rounded-xl font-bold text-sm text-emerald-300 bg-emerald-600/20 border border-emerald-500/50 hover:bg-emerald-500/30 hover:text-emerald-200 transition-all flex items-center justify-center"
                            >
                                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                Confirm & Execute
                            </button>
                        </div>
                    </div>
                )}

                {/* Loading State for Execute */}
                {mode === "executing" && (
                    <div className="flex flex-col items-center justify-center py-6 animate-pulse">
                        <div className="w-8 h-8 rounded-full border-t-2 border-r-2 border-emerald-500 animate-spin mb-3"></div>
                        <p className="text-xs text-emerald-400 font-bold uppercase tracking-widest">Executing action...</p>
                    </div>
                )}

                {/* Done Mode */}
                {mode === "done" && (
                    <div className="animate-fade-in space-y-4">
                        <div className="bg-emerald-900/10 border border-emerald-800 p-4 rounded-xl">
                            <div className="flex items-center mb-3">
                                <svg className="w-5 h-5 text-emerald-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Action Complete</p>
                            </div>
                            <div className="text-sm text-gray-300 whitespace-pre-wrap">{finalResult}</div>
                        </div>
                        <button
                            onClick={handleCancel}
                            className="w-full py-3 rounded-xl font-bold text-sm text-gray-400 bg-gray-800/50 border border-gray-700 hover:bg-gray-800 hover:text-gray-300 transition-colors"
                        >
                            Start New Action
                        </button>
                    </div>
                )}

                {error && (
                    <div className="p-3 bg-red-900/20 border border-red-500/20 rounded-xl animate-fade-in">
                        <p className="text-xs text-red-400 font-medium">{error}</p>
                    </div>
                )}
            </div>
        </div>
    );
}

