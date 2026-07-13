import React, { useEffect, useMemo, useState } from 'react';
import { docsApi } from '../api/client';

const AI_PRESETS = [
    { label: 'Stronger bullets', instruction: 'Rewrite experience and project bullets to be stronger, more impactful, and achievement-focused while keeping all facts accurate.' },
    { label: 'Shorter & tighter', instruction: 'Make the document shorter and tighter. Cut fluff, keep meaning, preserve all key facts.' },
    { label: 'Backend role', instruction: 'Tailor this document for a backend / software engineering role. Emphasize systems, APIs, databases, and ownership.' },
    { label: 'Cover letter tone', instruction: 'Rewrite this as a concise, professional, warm cover letter. Keep it punchy and specific.' },
];

function formatModified(value) {
    if (!value) return '';
    try {
        return new Date(value).toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
    } catch {
        return value;
    }
}

function DocIcon({ className = 'h-5 w-5' }) {
    return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
    );
}

export function DocsManager() {
    const [docs, setDocs] = useState([]);
    const [search, setSearch] = useState('');
    const [listLoading, setListLoading] = useState(true);
    const [selectedId, setSelectedId] = useState(null);
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [savedContent, setSavedContent] = useState('');
    const [webLink, setWebLink] = useState('');
    const [docLoading, setDocLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [aiInstruction, setAiInstruction] = useState('');
    const [aiLoading, setAiLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const isDirty = selectedId && content !== savedContent;

    const stats = useMemo(() => {
        const words = content.trim() ? content.trim().split(/\s+/).length : 0;
        const chars = content.length;
        return { words, chars };
    }, [content]);

    const loadDocs = async (query = search) => {
        setListLoading(true);
        setError('');
        try {
            const data = await docsApi.list(query);
            setDocs(data || []);
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to load Google Docs. Connect Google in the sidebar first.');
            setDocs([]);
        } finally {
            setListLoading(false);
        }
    };

    useEffect(() => {
        loadDocs();
    }, []);

    const openDoc = async (doc) => {
        if (isDirty && !window.confirm('You have unsaved changes. Discard and open another doc?')) {
            return;
        }
        setSelectedId(doc.id);
        setDocLoading(true);
        setError('');
        setMessage('');
        try {
            const data = await docsApi.read(doc.id);
            const text = data.content || '';
            setTitle(data.title);
            setContent(text);
            setSavedContent(text);
            setWebLink(data.web_view_link);
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to read document.');
        } finally {
            setDocLoading(false);
        }
    };

    const handleSave = async () => {
        if (!selectedId) return;
        setSaving(true);
        setError('');
        setMessage('');
        try {
            await docsApi.update(selectedId, content, 'replace');
            setSavedContent(content);
            setMessage('Saved to Google Docs.');
            await loadDocs();
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to save document.');
        } finally {
            setSaving(false);
        }
    };

    const handleAiRewrite = async (instructionOverride = null) => {
        const instruction = (instructionOverride || aiInstruction).trim();
        if (!instruction) return;
        setAiLoading(true);
        setError('');
        setMessage('');
        try {
            const data = await docsApi.aiRewrite(content, instruction);
            setContent(data.content || '');
            setMessage('AI draft ready — review below, then save when you are happy with it.');
            setAiInstruction('');
        } catch (err) {
            setError(err.response?.data?.detail || 'AI rewrite failed.');
        } finally {
            setAiLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!newTitle.trim()) return;
        setCreating(true);
        setError('');
        setMessage('');
        try {
            const data = await docsApi.create(newTitle.trim(), '');
            setShowCreate(false);
            setNewTitle('');
            await loadDocs();
            setSelectedId(data.id);
            setTitle(data.title);
            setContent(data.content || '');
            setSavedContent(data.content || '');
            setWebLink(data.web_view_link);
            setMessage('New Google Doc created. Start writing, or ask AI to draft it.');
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to create document.');
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="relative flex h-[calc(100vh-220px)] min-h-[600px] w-full gap-6 lg:gap-8">
            <div className="pointer-events-none absolute -left-10 top-10 h-64 w-64 rounded-full bg-cyan-500/5 blur-3xl" />
            <div className="pointer-events-none absolute -right-8 bottom-20 h-72 w-72 rounded-full bg-blue-500/5 blur-3xl" />

            {/* Sidebar list */}
            <aside className="relative z-10 flex w-full max-w-[380px] shrink-0 flex-col overflow-hidden rounded-[1.75rem] border border-gray-800/70 bg-[#0a0f1c]/90 shadow-2xl backdrop-blur-sm">
                <div className="space-y-5 border-b border-gray-800/70 bg-gradient-to-b from-gray-900/80 to-transparent px-6 py-6">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-xs font-medium text-cyan-400/90">Library</p>
                            <h3 className="mt-1 text-lg font-semibold text-white">Your Docs</h3>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setShowCreate((v) => !v)}
                                className={`rounded-xl px-3.5 py-2.5 text-xs font-semibold transition-all ${
                                    showCreate
                                        ? 'border border-gray-600 bg-gray-800 text-gray-300'
                                        : 'border border-cyan-500/35 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25'
                                }`}
                            >
                                {showCreate ? 'Cancel' : '+ New'}
                            </button>
                            <button
                                type="button"
                                onClick={() => loadDocs()}
                                className="rounded-xl border border-gray-700/70 bg-gray-900/60 p-2.5 text-gray-400 transition-colors hover:border-gray-600 hover:text-gray-200"
                                title="Refresh"
                            >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            </button>
                        </div>
                    </div>

                    <div className="relative">
                        <svg className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') loadDocs(search);
                            }}
                            placeholder="Search by name…"
                            className="w-full rounded-2xl border border-gray-700/60 bg-[#050914] py-3.5 pl-11 pr-4 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/25"
                        />
                    </div>

                    {showCreate && (
                        <div className="space-y-3 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                            <p className="text-xs font-medium text-cyan-300">Create a new Google Doc</p>
                            <input
                                type="text"
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleCreate();
                                }}
                                placeholder="e.g. Cover letter — Acme"
                                className="w-full rounded-xl border border-gray-700/60 bg-[#050914] px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/25"
                                autoFocus
                            />
                            <button
                                type="button"
                                disabled={creating || !newTitle.trim()}
                                onClick={handleCreate}
                                className="w-full rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
                            >
                                {creating ? 'Creating…' : 'Create doc'}
                            </button>
                        </div>
                    )}

                    {!listLoading && docs.length > 0 && (
                        <p className="text-xs text-gray-500">{docs.length} document{docs.length === 1 ? '' : 's'}</p>
                    )}
                </div>

                <div className="custom-scrollbar flex-1 overflow-y-auto">
                    {listLoading ? (
                        <div className="space-y-3 p-5">
                            {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="animate-pulse rounded-2xl border border-gray-800/50 bg-gray-900/40 p-5">
                                    <div className="h-4 w-3/4 rounded bg-gray-800" />
                                    <div className="mt-3 h-3 w-1/3 rounded bg-gray-800/80" />
                                </div>
                            ))}
                        </div>
                    ) : docs.length === 0 ? (
                        <div className="flex flex-col items-center px-8 py-16 text-center">
                            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-gray-800 bg-gray-900/60 text-gray-600">
                                <DocIcon className="h-7 w-7" />
                            </div>
                            <p className="text-sm font-medium text-gray-300">No docs yet</p>
                            <p className="mt-2 text-sm leading-6 text-gray-500">
                                Connect Google, then create a doc or refresh after adding files in Drive.
                            </p>
                        </div>
                    ) : (
                        docs.map((doc) => {
                            const active = selectedId === doc.id;
                            return (
                                <button
                                    key={doc.id}
                                    type="button"
                                    onClick={() => openDoc(doc)}
                                    className={`group flex w-full items-start gap-4 border-b border-gray-800/40 px-5 py-5 text-left transition-all ${
                                        active
                                            ? 'bg-cyan-500/[0.08] shadow-[inset_3px_0_0_0_rgba(34,211,238,0.7)]'
                                            : 'hover:bg-gray-800/25'
                                    }`}
                                >
                                    <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                                        active
                                            ? 'border-cyan-500/30 bg-cyan-500/15 text-cyan-300'
                                            : 'border-gray-800 bg-gray-900/70 text-gray-500 group-hover:text-gray-300'
                                    }`}>
                                        <DocIcon />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className={`truncate text-sm font-semibold ${active ? 'text-white' : 'text-gray-200'}`}>
                                            {doc.name}
                                        </p>
                                        <p className="mt-1.5 text-xs text-gray-500">{formatModified(doc.modified_time)}</p>
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>
            </aside>

            {/* Editor pane */}
            <section className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden rounded-[1.75rem] border border-gray-800/70 bg-[#0a0f1c]/90 shadow-2xl backdrop-blur-sm">
                {!selectedId ? (
                    <div className="flex flex-1 flex-col items-center justify-center px-10 py-16 text-center">
                        <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 text-cyan-300/80">
                            <DocIcon className="h-10 w-10" />
                        </div>
                        <h3 className="text-2xl font-semibold tracking-tight text-white">Pick a document</h3>
                        <p className="mt-3 max-w-md text-base leading-7 text-gray-400">
                            Select a Google Doc from the list to read it, edit in place, and rewrite with AI — then save back when ready.
                        </p>
                        {error && (
                            <div className="mt-8 max-w-lg rounded-2xl border border-red-500/30 bg-red-900/20 px-5 py-4 text-sm leading-6 text-red-300">
                                {error}
                            </div>
                        )}
                        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                            <button
                                type="button"
                                onClick={() => setShowCreate(true)}
                                className="rounded-2xl border border-cyan-500/35 bg-cyan-500/15 px-5 py-3 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/25"
                            >
                                Create new doc
                            </button>
                            <button
                                type="button"
                                onClick={() => loadDocs()}
                                className="rounded-2xl border border-gray-700 bg-gray-900/60 px-5 py-3 text-sm font-semibold text-gray-300 hover:bg-gray-800"
                            >
                                Refresh list
                            </button>
                        </div>
                    </div>
                ) : docLoading ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-4">
                        <div className="h-12 w-12 animate-spin rounded-full border-2 border-cyan-500/20 border-t-cyan-400" />
                        <p className="text-sm text-gray-400">Opening document…</p>
                    </div>
                ) : (
                    <>
                        <header className="border-b border-gray-800/70 bg-gradient-to-b from-gray-900/70 to-transparent px-7 py-6">
                            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-3">
                                        <h3 className="truncate text-2xl font-semibold tracking-tight text-white">{title}</h3>
                                        {isDirty ? (
                                            <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-300">
                                                Unsaved
                                            </span>
                                        ) : (
                                            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
                                                Synced
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-500">
                                        <span>{stats.words} words</span>
                                        <span className="hidden sm:inline text-gray-700">·</span>
                                        <span>{stats.chars} characters</span>
                                        {webLink && (
                                            <>
                                                <span className="hidden sm:inline text-gray-700">·</span>
                                                <a
                                                    href={webLink}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="font-medium text-cyan-300 hover:text-cyan-200"
                                                >
                                                    Open in Google Docs ↗
                                                </a>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleSave}
                                    disabled={saving || !isDirty}
                                    className="shrink-0 rounded-2xl bg-gradient-to-r from-cyan-600 to-blue-600 px-7 py-3.5 text-sm font-bold text-white shadow-[0_0_28px_rgba(34,211,238,0.18)] transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                                >
                                    {saving ? 'Saving…' : 'Save to Google Docs'}
                                </button>
                            </div>
                        </header>

                        {(error || message) && (
                            <div className={`flex items-start gap-3 border-b px-7 py-4 text-sm leading-6 ${
                                error
                                    ? 'border-red-500/25 bg-red-900/15 text-red-300'
                                    : 'border-emerald-500/25 bg-emerald-900/15 text-emerald-300'
                            }`}>
                                <span className="mt-0.5 shrink-0">
                                    {error ? (
                                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    ) : (
                                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    )}
                                </span>
                                <span>{error || message}</span>
                            </div>
                        )}

                        <div className="custom-scrollbar relative flex-1 overflow-y-auto p-6 lg:p-8">
                            {aiLoading && (
                                <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0a0f1c]/70 backdrop-blur-sm">
                                    <div className="rounded-3xl border border-cyan-500/20 bg-gray-900/90 px-8 py-7 text-center shadow-2xl">
                                        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-cyan-500/20 border-t-cyan-400" />
                                        <p className="text-sm font-medium text-cyan-200">AI is rewriting your doc…</p>
                                        <p className="mt-2 text-xs text-gray-500">This usually takes a few seconds</p>
                                    </div>
                                </div>
                            )}
                            <textarea
                                className="custom-scrollbar h-full min-h-[360px] w-full resize-none rounded-3xl border border-gray-800/80 bg-[#050914]/80 p-7 text-[15px] leading-8 text-gray-100 placeholder-gray-600 shadow-inner focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                                value={content}
                                onChange={(e) => {
                                    setContent(e.target.value);
                                    if (message) setMessage('');
                                }}
                                placeholder="Start writing, or use AI below to draft / improve this document…"
                                spellCheck
                            />
                        </div>

                        <footer className="border-t border-gray-800/70 bg-gray-950/50 px-6 py-5 lg:px-8">
                            <div className="mb-4 flex flex-wrap items-center gap-2">
                                <span className="mr-1 text-xs font-medium text-gray-500">Quick AI:</span>
                                {AI_PRESETS.map((preset) => (
                                    <button
                                        key={preset.label}
                                        type="button"
                                        disabled={aiLoading}
                                        onClick={() => handleAiRewrite(preset.instruction)}
                                        className="rounded-full border border-gray-700/70 bg-gray-900/70 px-3.5 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:border-cyan-500/40 hover:bg-cyan-500/10 hover:text-cyan-200 disabled:opacity-40"
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                                <div className="relative flex-1">
                                    <input
                                        type="text"
                                        value={aiInstruction}
                                        onChange={(e) => setAiInstruction(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleAiRewrite();
                                        }}
                                        disabled={aiLoading}
                                        placeholder="Describe how AI should change this doc…"
                                        className="w-full rounded-2xl border border-gray-700/60 bg-[#050914] px-5 py-4 pr-4 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/25 disabled:opacity-50"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleAiRewrite()}
                                    disabled={aiLoading || !aiInstruction.trim()}
                                    className="flex items-center justify-center gap-2 rounded-2xl border border-cyan-500/40 bg-cyan-600/20 px-6 py-4 text-sm font-semibold text-cyan-100 transition-all hover:bg-cyan-600/30 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                    {aiLoading ? 'Rewriting…' : 'Rewrite with AI'}
                                </button>
                            </div>
                        </footer>
                    </>
                )}
            </section>
        </div>
    );
}
