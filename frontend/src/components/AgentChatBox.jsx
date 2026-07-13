import React, { useMemo, useState } from 'react';
import { agentApi } from '../api/client';

function isEmailOutreach(prompt, bulkEmails) {
    if (bulkEmails.trim()) return true;
    const p = (prompt || '').toLowerCase();
    return (
        /\b(email|e-mail|mail|outreach|pitch|cold email|send (this |an? )?(email|mail)|draft (an? )?(email|mail|pitch)|message to|write (an? )?email)\b/.test(p)
        || p.includes('recruit')
        || p.includes('hiring manager')
    );
}

function buildContextPrompt(prompt, selectedResumeUrl, bulkEmails) {
    let contextPrompt = prompt;
    if (selectedResumeUrl) {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
        let absUrl = selectedResumeUrl;
        if (!absUrl.startsWith('http')) absUrl = `${API_URL}${absUrl}`;
        contextPrompt = `${prompt}\n\nCRITICAL: The system has provided this resume link: ${absUrl}. You MUST use this link in the 'attachment_url' field when calling any email tools. DO NOT include this link directly in the body of the email text! The email tool will natively attach the file for you. If you do not have my name in memory, try to extract it from the resume if you can read it, or sign off naturally without bracketed placeholders like [Your Name].`;
    }
    if (bulkEmails.trim()) {
        contextPrompt = `${contextPrompt}\n\nI want to send this as a mass outreach campaign to the following recipients:\n${bulkEmails}\n\nPlease draft the single email template that will be sent individually to each of them.`;
    }
    return contextPrompt;
}

const QUICK_ACTIONS = [
    {
        label: 'Draft pitch',
        hint: 'Cold email',
        prompt: 'Draft a cold email pitching my profile for a Python developer role.',
        email: true,
        icon: (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
        ),
    },
    {
        label: 'Calendar',
        hint: 'Today & tomorrow',
        prompt: 'What is on my calendar for today and tomorrow?',
        email: false,
        icon: (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
        ),
    },
    {
        label: 'Inbox',
        hint: 'Latest mail',
        prompt: 'List my 5 most recent emails.',
        email: false,
        icon: (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
        ),
    },
];

export function AgentChatBox({ history }) {
    const [prompt, setPrompt] = useState('');
    const [bulkEmails, setBulkEmails] = useState('');
    const [selectedResumeUrl, setSelectedResumeUrl] = useState('');
    const [showEmailOptions, setShowEmailOptions] = useState(false);
    const [mode, setMode] = useState('idle');
    const [draftResult, setDraftResult] = useState('');
    const [finalResult, setFinalResult] = useState('');
    const [error, setError] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [uploadedFileName, setUploadedFileName] = useState('');

    const needsReview = useMemo(
        () => isEmailOutreach(prompt, bulkEmails),
        [prompt, bulkEmails]
    );

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setIsUploading(true);
        setError('');
        try {
            const data = await agentApi.uploadAttachment(file);
            setSelectedResumeUrl(data.url);
            setUploadedFileName(file.name);
            setShowEmailOptions(true);
        } catch (err) {
            console.error(err);
            setError('Failed to upload file.');
            setUploadedFileName('');
        } finally {
            setIsUploading(false);
        }
    };

    const handleQuickAction = (action) => {
        setPrompt(action.prompt);
        setShowEmailOptions(Boolean(action.email));
        setError('');
    };

    const handleAskNow = async () => {
        if (!prompt.trim()) return;
        setMode('answering');
        setError('');
        setFinalResult('');
        setDraftResult('');
        try {
            const contextPrompt = buildContextPrompt(prompt, selectedResumeUrl, '');
            const runPrompt = `${contextPrompt}\n\nCRITICAL: Answer using read-only tools only (search emails, list calendar, search Drive if needed). Do NOT send emails, create calendar events, or modify any Google Docs. Return a clear, concise answer.`;
            const data = await agentApi.executeAction(runPrompt, selectedResumeUrl);
            setFinalResult(data.result || 'Done.');
            setMode('done');
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.detail || 'Failed to run action.');
            setMode('idle');
        }
    };

    const handleDraftEmail = async () => {
        if (!prompt.trim()) return;
        setMode('drafting');
        setError('');
        setDraftResult('');
        setFinalResult('');
        try {
            const contextPrompt = buildContextPrompt(prompt, selectedResumeUrl, bulkEmails);
            const safePrompt = `${contextPrompt}\n\nCRITICAL INSTRUCTION: You are drafting a cold outreach email. Do NOT send the email yet. Draft the exact subject, body, and recipient(s) for review. You MAY use read-only tools if needed. DO NOT use bracketed placeholders like [Your Name]; use profile memory or a natural sign-off.`;
            const data = await agentApi.executeAction(safePrompt, selectedResumeUrl);
            setDraftResult(data.result || 'No draft generated.');
            setMode('review');
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.detail || 'Failed to draft email.');
            setMode('idle');
        }
    };

    const handlePrimary = () => {
        if (needsReview) handleDraftEmail();
        else handleAskNow();
    };

    const handleExecute = async () => {
        setMode('executing');
        setError('');
        try {
            const contextPrompt = buildContextPrompt(prompt, selectedResumeUrl, bulkEmails);
            const executePrompt = `Earlier I asked you to: "${contextPrompt}".\n\nI have reviewed and approved the following draft:\n\n"""\n${draftResult}\n"""\n\nPlease send this email NOW using the approved draft. ${bulkEmails.trim() ? "CRITICAL: Use the 'send_bulk_emails' tool for the recipient list." : 'Use send_email or draft_email as appropriate — prefer send_email since I approved it.'} Do not ask for confirmation again.`;
            const data = await agentApi.executeAction(executePrompt, selectedResumeUrl);
            setFinalResult(data.result || 'Email sent.');
            setMode('done');
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.detail || 'Failed to send email.');
            setMode('review');
        }
    };

    const handleCancel = () => {
        setMode('idle');
        setDraftResult('');
        setFinalResult('');
        setError('');
    };

    return (
        <div className="relative overflow-hidden rounded-[2rem] border border-violet-500/15 bg-[#0b1020]/80 shadow-[0_0_80px_-30px_rgba(139,92,246,0.45)] backdrop-blur-xl animate-fade-in">
            {/* Atmosphere */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(139,92,246,0.14),_transparent_55%)]" />
            <div className="pointer-events-none absolute -right-24 top-0 h-80 w-80 rounded-full bg-fuchsia-500/10 blur-3xl" />
            <div className="pointer-events-none absolute -left-20 bottom-0 h-72 w-72 rounded-full bg-indigo-500/10 blur-3xl" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/40 to-transparent" />

            <div className="relative z-10 p-7 sm:p-9 lg:p-11">
                {/* Brand row */}
                <div className="mb-9 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <div className="absolute inset-0 animate-pulse rounded-2xl bg-violet-500/30 blur-md" />
                            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-400/30 bg-gradient-to-br from-violet-500/30 via-fuchsia-500/20 to-indigo-600/30 text-violet-100 shadow-inner">
                                <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" /></svg>
                            </div>
                        </div>
                        <div>
                            <div className="flex items-center gap-2.5">
                                <h3 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">AI Agent</h3>
                                <span className="rounded-full border border-violet-400/25 bg-violet-500/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-200">
                                    Online
                                </span>
                            </div>
                            <p className="mt-1.5 text-sm text-gray-400">Your AI agent for Gmail & Calendar</p>
                        </div>
                    </div>
                    <p className="max-w-xs text-sm leading-6 text-gray-500 sm:text-right">
                        Docs live in <span className="text-cyan-300/90">Manage Docs</span>. Emails get a review before send.
                    </p>
                </div>

                {mode === 'idle' && (
                    <div className="animate-fade-in space-y-7">
                        {/* Quick chips */}
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            {QUICK_ACTIONS.map((action) => (
                                <button
                                    key={action.label}
                                    type="button"
                                    onClick={() => handleQuickAction(action)}
                                    className="group flex items-center gap-3.5 rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-4 text-left transition-all hover:border-violet-400/30 hover:bg-violet-500/10"
                                >
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-500/10 text-violet-200 transition-transform group-hover:scale-105">
                                        {action.icon}
                                    </span>
                                    <span>
                                        <span className="block text-sm font-semibold text-gray-100">{action.label}</span>
                                        <span className="mt-0.5 block text-xs text-gray-500">{action.hint}</span>
                                    </span>
                                </button>
                            ))}
                        </div>

                        {/* Composer */}
                        <div className="rounded-[1.5rem] border border-white/10 bg-[#070b16]/80 p-2 shadow-inner">
                            <textarea
                                className="custom-scrollbar min-h-[150px] w-full resize-none bg-transparent px-4 pt-4 text-base leading-7 text-gray-100 placeholder-gray-600 focus:outline-none"
                                placeholder="Ask the AI agent anything… e.g. Draft a cold email for a backend role at Acme"
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                            />

                            <div className="flex flex-col gap-3 border-t border-white/5 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                                <button
                                    type="button"
                                    onClick={() => setShowEmailOptions((v) => !v)}
                                    className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                                        showEmailOptions || selectedResumeUrl || bulkEmails
                                            ? 'bg-violet-500/15 text-violet-200'
                                            : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'
                                    }`}
                                >
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                                    {showEmailOptions ? 'Hide email options' : 'Email options'}
                                    {(selectedResumeUrl || bulkEmails) && (
                                        <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
                                    )}
                                </button>

                                <button
                                    type="button"
                                    onClick={handlePrimary}
                                    disabled={!prompt.trim()}
                                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_0_30px_-8px_rgba(168,85,247,0.7)] transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                                >
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                    {needsReview ? 'Draft email' : 'Ask agent'}
                                </button>
                            </div>
                        </div>

                        {showEmailOptions && (
                            <div className="animate-fade-in space-y-5 rounded-[1.5rem] border border-violet-500/15 bg-violet-500/[0.04] p-5 sm:p-6">
                                <div>
                                    <label className="mb-2.5 block text-xs font-medium uppercase tracking-wide text-gray-500">Attach resume</label>
                                    <div className="flex flex-col gap-3 sm:flex-row">
                                        <select
                                            className="flex-1 appearance-none rounded-xl border border-white/10 bg-[#070b16] px-4 py-3 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                                            value={uploadedFileName ? 'uploaded' : selectedResumeUrl}
                                            onChange={(e) => {
                                                setUploadedFileName('');
                                                setSelectedResumeUrl(e.target.value);
                                            }}
                                        >
                                            <option value="">No attachment</option>
                                            {uploadedFileName && <option value="uploaded">Uploaded: {uploadedFileName}</option>}
                                            {history && history.filter((item) => item.download_url).map((item) => (
                                                <option key={item.id} value={item.download_url}>
                                                    {item.resume_title} {item.jd_title ? `(${item.jd_title})` : ''}
                                                </option>
                                            ))}
                                        </select>
                                        <div className="relative">
                                            <input
                                                type="file"
                                                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                                onChange={handleFileUpload}
                                                disabled={isUploading}
                                            />
                                            <button
                                                type="button"
                                                disabled={isUploading}
                                                className="w-full rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-gray-200 hover:bg-white/10 disabled:opacity-50 sm:w-auto"
                                            >
                                                {isUploading ? 'Uploading…' : 'Upload'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <label className="mb-2.5 block text-xs font-medium uppercase tracking-wide text-gray-500">Mass send (optional)</label>
                                    <textarea
                                        className="custom-scrollbar min-h-[80px] w-full rounded-xl border border-white/10 bg-[#070b16] p-4 text-sm leading-6 text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                                        placeholder="email1@company.com, email2@startup.com"
                                        value={bulkEmails}
                                        onChange={(e) => setBulkEmails(e.target.value)}
                                    />
                                </div>
                            </div>
                        )}

                        <p className="text-center text-xs text-gray-600">
                            {needsReview
                                ? 'Cold emails are drafted first — you approve before anything is sent.'
                                : 'Calendar and inbox questions run right away.'}
                        </p>
                    </div>
                )}

                {(mode === 'drafting' || mode === 'answering') && (
                    <div className="flex flex-col items-center justify-center px-6 py-24">
                        <div className="relative mb-8 h-16 w-16">
                            <div className="absolute inset-0 animate-ping rounded-full bg-violet-500/20" />
                            <div className="absolute inset-0 animate-spin rounded-full border-2 border-violet-500/20 border-t-violet-400" />
                            <div className="absolute inset-3 flex items-center justify-center text-violet-200">
                                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" /></svg>
                            </div>
                        </div>
                        <p className="text-lg font-medium text-violet-100">
                            {mode === 'drafting' ? 'Drafting your email…' : 'Thinking…'}
                        </p>
                        <p className="mt-2 text-sm text-gray-500">Connecting to your Google Workspace</p>
                    </div>
                )}

                {mode === 'review' && (
                    <div className="animate-fade-in space-y-5">
                        <div className="rounded-[1.5rem] border border-amber-500/20 bg-amber-500/[0.04] p-6 sm:p-7">
                            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                                <p className="text-base font-semibold text-white">Review draft</p>
                                <span className="rounded-full border border-amber-400/30 bg-amber-500/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-200">
                                    Not sent
                                </span>
                            </div>
                            <textarea
                                className="custom-scrollbar h-72 w-full resize-none rounded-xl border border-white/10 bg-[#070b16] p-5 text-base leading-7 text-gray-200 focus:outline-none focus:ring-2 focus:ring-violet-500/25"
                                value={draftResult}
                                onChange={(e) => setDraftResult(e.target.value)}
                            />
                            <p className="mt-3 text-sm text-gray-500">Tweak the copy, then send when ready.</p>
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row">
                            <button
                                type="button"
                                onClick={handleCancel}
                                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-6 py-3.5 text-sm font-semibold text-gray-300 hover:bg-white/10"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleExecute}
                                className="flex flex-[2] items-center justify-center rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_0_24px_-6px_rgba(16,185,129,0.5)]"
                            >
                                Send email
                            </button>
                        </div>
                    </div>
                )}

                {mode === 'executing' && (
                    <div className="flex flex-col items-center justify-center px-6 py-24">
                        <div className="mb-7 h-12 w-12 animate-spin rounded-full border-2 border-emerald-500/20 border-t-emerald-400" />
                        <p className="text-lg font-medium text-emerald-200">Sending…</p>
                    </div>
                )}

                {mode === 'done' && (
                    <div className="animate-fade-in space-y-5">
                        <div className="rounded-[1.5rem] border border-emerald-500/20 bg-emerald-500/[0.05] p-6 sm:p-7">
                            <div className="mb-5 flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/20 text-emerald-300">
                                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                </div>
                                <p className="text-base font-semibold text-emerald-200">Done</p>
                            </div>
                            <div className="whitespace-pre-wrap text-base leading-7 text-gray-300">{finalResult}</div>
                        </div>
                        <button
                            type="button"
                            onClick={handleCancel}
                            className="w-full rounded-xl border border-white/10 bg-white/5 px-6 py-3.5 text-sm font-semibold text-gray-300 hover:bg-white/10"
                        >
                            Ask again
                        </button>
                    </div>
                )}

                {error && (
                    <div className="mt-5 flex items-start gap-3 rounded-2xl border border-red-500/25 bg-red-500/10 px-5 py-4 text-sm leading-6 text-red-200">
                        <svg className="mt-0.5 h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <span>{error}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
