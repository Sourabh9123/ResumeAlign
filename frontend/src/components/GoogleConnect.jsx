import React, { useState, useEffect, useCallback } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { agentApi } from '../api/client';

function formatCountdown(totalSeconds) {
  if (totalSeconds == null) return '--:--';
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export function GoogleConnect() {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [expiresAtMs, setExpiresAtMs] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [tokenStatus, setTokenStatus] = useState('disconnected');

  const applyStatus = useCallback((data) => {
    setConnected(Boolean(data.connected));
    setTokenStatus(data.token_status || (data.connected ? 'ok' : 'disconnected'));
    if (data.expires_at) {
      const ms = new Date(data.expires_at).getTime();
      setExpiresAtMs(Number.isNaN(ms) ? null : ms);
    } else if (typeof data.seconds_remaining === 'number') {
      setExpiresAtMs(Date.now() + data.seconds_remaining * 1000);
    } else {
      setExpiresAtMs(null);
    }
    if (typeof data.seconds_remaining === 'number') {
      setSecondsLeft(data.seconds_remaining);
    } else {
      setSecondsLeft(null);
    }
  }, []);

  const checkStatus = useCallback(async () => {
    try {
      const data = await agentApi.checkOAuthStatus('google');
      applyStatus(data);
    } catch (error) {
      console.error('Failed to check OAuth status:', error);
    } finally {
      setLoading(false);
    }
  }, [applyStatus]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Live countdown from expiresAtMs
  useEffect(() => {
    if (!connected || expiresAtMs == null) return undefined;

    const tick = () => {
      const left = Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) setTokenStatus('expired');
      else if (left <= 10 * 60) setTokenStatus('expiring');
      else setTokenStatus('ok');
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [connected, expiresAtMs]);

  const login = useGoogleLogin({
    scope: 'https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents',
    prompt: 'consent',
    onSuccess: async (tokenResponse) => {
      setLoading(true);
      try {
        const saved = await agentApi.saveOAuth(
          'google',
          tokenResponse.access_token,
          tokenResponse.refresh_token,
          tokenResponse.expires_in || 3600
        );
        setConnected(true);
        if (saved?.expires_at) {
          applyStatus({
            connected: true,
            expires_at: saved.expires_at,
            seconds_remaining: saved.expires_in || 3600,
            token_status: 'ok',
          });
        } else {
          await checkStatus();
        }
      } catch (error) {
        console.error('Failed to save OAuth token', error);
        alert('Failed to connect Google account.');
      } finally {
        setLoading(false);
      }
    },
    onError: (error) => {
      console.log('Login Failed:', error);
      alert('Google login failed.');
    },
  });

  const statusStyles = {
    ok: {
      badge: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
      refresh: 'border-gray-700/60 bg-gray-800/50 text-gray-400 hover:bg-gray-700 hover:text-gray-200',
      label: 'Connected',
    },
    expiring: {
      badge: 'border-amber-500/30 bg-amber-500/15 text-amber-300',
      refresh: 'border-amber-500/40 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 animate-pulse',
      label: 'Expiring soon',
    },
    expired: {
      badge: 'border-red-500/30 bg-red-500/15 text-red-300',
      refresh: 'border-red-500/40 bg-red-500/25 text-red-200 hover:bg-red-500/35 animate-pulse',
      label: 'Expired — refresh',
    },
    disconnected: {
      badge: '',
      refresh: '',
      label: '',
    },
  };

  const style = statusStyles[tokenStatus] || statusStyles.ok;

  return (
    <div className="rounded-2xl border border-gray-700/60 bg-gray-900/40 p-5 text-left">
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/15">
          <svg className="h-4 w-4 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
        </div>
        <h3 className="text-sm font-semibold text-gray-200">Google Workspace</h3>
      </div>
      <p className="mb-5 text-xs leading-5 text-gray-500">
        Connect so the AI can read and update Docs, send mail, and use Drive or Calendar.
      </p>

      {connected ? (
        <div className="space-y-3">
          <div className={`rounded-xl border px-4 py-3 text-center ${style.badge}`}>
            <p className="text-xs font-semibold">{style.label}</p>
            {secondsLeft != null && (
              <p className="mt-1.5 font-mono text-sm tabular-nums tracking-wide">
                {tokenStatus === 'expired' ? '00:00' : formatCountdown(secondsLeft)}
                <span className="ml-1.5 text-[10px] font-sans font-medium opacity-70">left</span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => login()}
            disabled={loading}
            className={`w-full rounded-xl px-4 py-3 text-xs font-semibold transition-all ${style.refresh}`}
          >
            {loading ? 'Refreshing…' : tokenStatus === 'expired' ? 'Reconnect now' : 'Refresh connection'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => login()}
          disabled={loading}
          className={`w-full rounded-xl px-4 py-3 text-xs font-semibold transition-all ${
            loading
              ? 'cursor-not-allowed border border-gray-700 bg-gray-800 text-gray-500'
              : 'border border-blue-500/30 bg-blue-600/20 text-blue-200 hover:bg-blue-600/30'
          }`}
        >
          {loading ? 'Checking…' : 'Connect Google'}
        </button>
      )}
    </div>
  );
}
