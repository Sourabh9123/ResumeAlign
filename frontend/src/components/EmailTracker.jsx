import React, { useState, useEffect } from 'react';
import { agentApi } from '../api/client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export function EmailTracker() {
    const [emails, setEmails] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedThread, setSelectedThread] = useState(null);
    const [threadData, setThreadData] = useState(null);
    const [threadLoading, setThreadLoading] = useState(false);
    const [replyText, setReplyText] = useState("");
    const [replying, setReplying] = useState(false);
    const [suggesting, setSuggesting] = useState(false);
    const [promptContext, setPromptContext] = useState("");
    const [error, setError] = useState(null);

    const loadEmails = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('resume_builder_access_token');
            const res = await fetch(`${API_URL}/emails`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Failed to fetch emails");
            const data = await res.json();
            setEmails(data);
        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadEmails();
    }, []);

    const handleViewThread = async (email) => {
        if (!email.thread_id) return;
        setSelectedThread(email);
        setThreadLoading(true);
        setError(null);
        setThreadData(null);
        try {
            const token = localStorage.getItem('resume_builder_access_token');
            const res = await fetch(`${API_URL}/emails/${email.thread_id}/replies`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Failed to fetch thread");
            const data = await res.json();
            setThreadData(data);
            
            // Auto-suggest reply if there are actual replies
            if (data.messages && data.messages.length > 1) {
                handleSuggestReply(data.messages);
            } else {
                setReplyText("");
            }
        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setThreadLoading(false);
        }
    };

    const handleSuggestReply = async (messagesContext = null, tweakPrompt = null) => {
        setSuggesting(true);
        try {
            const contextMsgs = messagesContext || threadData.messages;
            const threadContextStr = contextMsgs.map(m => `From: ${m.from}\nDate: ${m.date}\nBody: ${m.body}`).join("\n\n---\n\n");
            
            // If tweaking, include current draft as context
            let finalPrompt = tweakPrompt;
            if (tweakPrompt && replyText) {
                finalPrompt = `I have a current draft:\n"""${replyText}"""\nPlease tweak it according to this instruction: ${tweakPrompt}`;
            }

            const token = localStorage.getItem('resume_builder_access_token');
            const res = await fetch(`${API_URL}/emails/suggest_reply`, {
                method: "POST",
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    thread_context: threadContextStr,
                    custom_prompt: finalPrompt
                })
            });
            if (!res.ok) throw new Error("Failed to generate suggestion");
            const data = await res.json();
            setReplyText(data.suggested_reply);
            setPromptContext("");
        } catch (err) {
            console.error("Suggestion error:", err);
        } finally {
            setSuggesting(false);
        }
    };

    const handleSendReply = async () => {
        if (!replyText.trim() || !threadData || !threadData.messages.length) return;
        setReplying(true);
        try {
            const lastMsg = threadData.messages[threadData.messages.length - 1];
            
            const token = localStorage.getItem('resume_builder_access_token');
            const res = await fetch(`${API_URL}/emails/${selectedThread.thread_id}/reply`, {
                method: "POST",
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: replyText,
                    refine_with_ai: false,
                    to: lastMsg.from || selectedThread.recipient,
                    subject: selectedThread.subject,
                    message_id: lastMsg.id
                })
            });
            if (!res.ok) throw new Error("Failed to send reply");
            setReplyText("");
            setPromptContext("");
            await handleViewThread(selectedThread); // refresh thread
        } catch (err) {
            console.error(err);
            alert("Error sending reply: " + err.message);
        } finally {
            setReplying(false);
        }
    };

    return (
        <div className="flex h-[calc(100vh-240px)] min-h-[560px] w-full gap-8">
            <div className="custom-scrollbar flex w-[38%] flex-col overflow-y-auto rounded-3xl border border-gray-800/80 bg-[#0a0f1c]">
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-800/80 bg-gray-900/50 px-6 py-5 backdrop-blur-md">
                    <h3 className="text-base font-semibold text-gray-200">Sent emails</h3>
                    <button onClick={loadEmails} className="text-blue-400 hover:text-blue-300">
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    </button>
                </div>
                {loading ? (
                    <div className="p-10 text-center text-gray-500">Loading emails...</div>
                ) : emails.length === 0 ? (
                    <div className="p-10 text-center leading-7 text-gray-500">No sent emails tracked yet. Use the Agent to send cold emails.</div>
                ) : (
                    <div className="flex-1 overflow-y-auto">
                        {emails.map(email => (
                            <div 
                                key={email.id} 
                                onClick={() => handleViewThread(email)}
                                className={`cursor-pointer border-b border-gray-800/50 px-6 py-5 transition-colors ${selectedThread?.id === email.id ? 'border-l-4 border-l-blue-500 bg-blue-500/10' : (email.has_replies ? 'border-l-4 border-l-emerald-500 bg-emerald-900/20 hover:bg-emerald-900/30' : 'hover:bg-gray-800/30')}`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <p className="truncate text-sm font-semibold text-gray-200">{email.recipient}</p>
                                    {email.has_replies && <span className="ml-2 shrink-0 whitespace-nowrap rounded-full border border-emerald-500/30 bg-emerald-500/20 px-2.5 py-1 text-[10px] font-bold text-emerald-400">New Reply</span>}
                                </div>
                                <p className={`mt-2 truncate text-sm ${email.has_replies ? 'text-emerald-300' : 'text-emerald-400'}`}>{email.subject}</p>
                                <p className="mt-2 text-xs text-gray-500">{new Date(email.sent_at).toLocaleString()}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="relative flex flex-1 flex-col overflow-hidden rounded-3xl border border-gray-800/80 bg-[#0a0f1c]">
                {error && <div className="border-b border-red-500/30 bg-red-900/20 p-5 text-sm text-red-400">{error}</div>}
                
                {!selectedThread ? (
                    <div className="flex flex-1 flex-col items-center justify-center p-10 text-gray-500">
                        <svg className="mb-5 h-16 w-16 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                        <p className="text-base">Select an email to view the thread and replies</p>
                    </div>
                ) : threadLoading ? (
                    <div className="flex flex-1 items-center justify-center text-gray-500">Loading thread...</div>
                ) : threadData ? (
                    <>
                        <div className="border-b border-gray-800/80 bg-gray-900/50 px-7 py-6 backdrop-blur-md">
                            <h3 className="text-xl font-semibold text-white">{selectedThread.subject}</h3>
                            <p className="mt-2 text-sm text-gray-400">To: {selectedThread.recipient}</p>
                        </div>
                        <div className="custom-scrollbar flex-1 space-y-6 overflow-y-auto p-7">
                            {threadData.messages.map((msg) => (
                                <div key={msg.id} className={`max-w-[85%] rounded-2xl p-5 ${msg.from.includes(selectedThread.recipient) ? 'border border-gray-700/50 bg-gray-800/80 self-start' : 'ml-auto border border-blue-800/50 bg-blue-900/20'}`}>
                                    <div className="mb-3 flex items-start justify-between gap-4">
                                        <p className="text-xs font-semibold text-gray-300">{msg.from}</p>
                                        <p className="shrink-0 text-xs text-gray-500">{new Date(msg.date).toLocaleString()}</p>
                                    </div>
                                    <div className="whitespace-pre-wrap font-sans text-sm leading-6 text-gray-300">{msg.body}</div>
                                </div>
                            ))}
                        </div>
                        
                        <div className="border-t border-gray-800/80 bg-gray-900/80 p-6">
                            <div className="flex items-end gap-5">
                                <div className="flex-1 space-y-4">
                                    <div className="relative">
                                        <textarea 
                                            className="custom-scrollbar h-36 w-full resize-none rounded-2xl border border-gray-700/80 bg-[#050914] p-4 pt-9 text-sm leading-6 text-gray-200 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/30"
                                            placeholder="Type your reply here..."
                                            value={replyText}
                                            onChange={(e) => setReplyText(e.target.value)}
                                        />
                                        <div className="absolute left-4 top-3 flex items-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                                            {suggesting ? (
                                                <span className="flex items-center text-emerald-400 animate-pulse">
                                                    <svg className="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                                                    AI is thinking...
                                                </span>
                                            ) : "Reply draft"}
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-3 rounded-2xl border border-gray-700/50 bg-[#050914] p-3">
                                        <input 
                                            type="text" 
                                            className="flex-1 border-none bg-transparent px-3 text-sm text-gray-300 placeholder-gray-600 focus:ring-0"
                                            placeholder="Tweak draft (e.g. 'make it shorter', 'sound more excited')"
                                            value={promptContext}
                                            onChange={(e) => setPromptContext(e.target.value)}
                                            onKeyDown={(e) => {
                                                if(e.key === 'Enter') handleSuggestReply(null, promptContext);
                                            }}
                                        />
                                        <button
                                            onClick={() => handleSuggestReply(null, promptContext)}
                                            disabled={suggesting || !promptContext.trim()}
                                            className="rounded-xl bg-gray-800 px-4 py-2.5 text-xs font-semibold text-purple-300 transition-colors hover:bg-gray-700 disabled:opacity-50"
                                        >
                                            Tweak with AI
                                        </button>
                                        <button
                                            onClick={() => handleSuggestReply()}
                                            disabled={suggesting}
                                            className="rounded-xl bg-gray-800 px-4 py-2.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-gray-700 disabled:opacity-50"
                                            title="Regenerate entirely"
                                        >
                                            Regenerate
                                        </button>
                                    </div>
                                </div>
                                <button 
                                    onClick={handleSendReply}
                                    disabled={replying || !replyText.trim() || suggesting}
                                    className="mb-1 flex h-full shrink-0 items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-emerald-500 px-7 py-4 text-sm font-bold uppercase tracking-widest text-white shadow-[0_0_20px_rgba(52,211,153,0.3)] transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {replying ? 'Sending...' : 'Send'}
                                </button>
                            </div>
                        </div>
                    </>
                ) : null}
            </div>
        </div>
    );
}
