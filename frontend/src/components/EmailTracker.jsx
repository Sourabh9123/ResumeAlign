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
        <div className="flex w-full h-[calc(100vh-200px)] gap-6">
            <div className="w-1/3 bg-[#0a0f1c] border border-gray-800/80 rounded-2xl overflow-y-auto custom-scrollbar flex flex-col">
                <div className="p-5 border-b border-gray-800/80 bg-gray-900/50 flex justify-between items-center sticky top-0 z-10 backdrop-blur-md">
                    <h3 className="font-bold text-gray-200 uppercase tracking-widest text-sm">Sent Emails</h3>
                    <button onClick={loadEmails} className="text-blue-400 hover:text-blue-300">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    </button>
                </div>
                {loading ? (
                    <div className="p-8 text-center text-gray-500">Loading emails...</div>
                ) : emails.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">No sent emails tracked yet. Use the Agent to send cold emails.</div>
                ) : (
                    <div className="flex-1 overflow-y-auto">
                        {emails.map(email => (
                            <div 
                                key={email.id} 
                                onClick={() => handleViewThread(email)}
                                className={`p-4 border-b border-gray-800/50 cursor-pointer transition-colors ${selectedThread?.id === email.id ? 'bg-blue-500/10 border-l-4 border-l-blue-500' : 'hover:bg-gray-800/30'}`}
                            >
                                <p className="text-sm font-bold text-gray-200 truncate">{email.recipient}</p>
                                <p className="text-xs text-emerald-400 mt-1 truncate">{email.subject}</p>
                                <p className="text-xs text-gray-500 mt-1">{new Date(email.sent_at).toLocaleString()}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex-1 bg-[#0a0f1c] border border-gray-800/80 rounded-2xl flex flex-col relative overflow-hidden">
                {error && <div className="p-4 bg-red-900/20 text-red-400 border-b border-red-500/30 text-sm">{error}</div>}
                
                {!selectedThread ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-8">
                        <svg className="w-16 h-16 mb-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                        <p>Select an email to view the thread and replies</p>
                    </div>
                ) : threadLoading ? (
                    <div className="flex-1 flex items-center justify-center text-gray-500">Loading thread...</div>
                ) : threadData ? (
                    <>
                        <div className="p-5 border-b border-gray-800/80 bg-gray-900/50 backdrop-blur-md">
                            <h3 className="font-bold text-lg text-white">{selectedThread.subject}</h3>
                            <p className="text-sm text-gray-400 mt-1">To: {selectedThread.recipient}</p>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                            {threadData.messages.map((msg, idx) => (
                                <div key={msg.id} className={`p-4 rounded-2xl max-w-[85%] ${msg.from.includes(selectedThread.recipient) ? 'bg-gray-800/80 border border-gray-700/50 self-start' : 'bg-blue-900/20 border border-blue-800/50 ml-auto'}`}>
                                    <div className="flex justify-between items-start mb-2">
                                        <p className="text-xs font-bold text-gray-300">{msg.from}</p>
                                        <p className="text-xs text-gray-500">{new Date(msg.date).toLocaleString()}</p>
                                    </div>
                                    <div className="text-sm text-gray-300 whitespace-pre-wrap font-sans">{msg.body}</div>
                                </div>
                            ))}
                        </div>
                        
                        <div className="p-5 border-t border-gray-800/80 bg-gray-900/80">
                            <div className="flex gap-4 items-end">
                                <div className="flex-1 space-y-3">
                                    <div className="relative">
                                        <textarea 
                                            className="w-full h-32 bg-[#050914] border border-gray-700/80 rounded-xl p-3 pt-8 text-sm text-gray-200 focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50 resize-none custom-scrollbar"
                                            placeholder="Type your reply here..."
                                            value={replyText}
                                            onChange={(e) => setReplyText(e.target.value)}
                                        />
                                        <div className="absolute top-2 left-3 flex items-center text-xs font-bold text-gray-500 uppercase tracking-widest">
                                            {suggesting ? (
                                                <span className="flex items-center text-emerald-400 animate-pulse">
                                                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                                                    AI is thinking...
                                                </span>
                                            ) : "Reply Draft"}
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-3 bg-[#050914] p-2 rounded-xl border border-gray-700/50">
                                        <input 
                                            type="text" 
                                            className="flex-1 bg-transparent border-none text-sm text-gray-300 placeholder-gray-600 focus:ring-0 px-2"
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
                                            className="px-4 py-2 rounded-lg bg-gray-800 text-purple-400 font-bold text-xs hover:bg-gray-700 transition-colors disabled:opacity-50"
                                        >
                                            Tweak with AI
                                        </button>
                                        <button
                                            onClick={() => handleSuggestReply()}
                                            disabled={suggesting}
                                            className="px-4 py-2 rounded-lg bg-gray-800 text-emerald-400 font-bold text-xs hover:bg-gray-700 transition-colors disabled:opacity-50"
                                            title="Regenerate entirely"
                                        >
                                            Regenerate
                                        </button>
                                    </div>
                                </div>
                                <button 
                                    onClick={handleSendReply}
                                    disabled={replying || !replyText.trim() || suggesting}
                                    className="px-6 py-4 h-full rounded-xl bg-gradient-to-r from-blue-600 to-emerald-500 text-white font-bold text-sm tracking-widest uppercase disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 transition-transform shrink-0 shadow-[0_0_20px_rgba(52,211,153,0.3)] mb-1 flex items-center justify-center"
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
