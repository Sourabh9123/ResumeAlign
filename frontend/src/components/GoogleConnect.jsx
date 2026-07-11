import React, { useState, useEffect } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { agentApi } from '../api/client';

export function GoogleConnect() {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const data = await agentApi.checkOAuthStatus('google');
        setConnected(data.connected);
      } catch (error) {
        console.error("Failed to check OAuth status:", error);
      } finally {
        setLoading(false);
      }
    };
    checkStatus();
  }, []);

  const login = useGoogleLogin({
    scope: 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive.readonly',
    onSuccess: async (tokenResponse) => {
      setLoading(true);
      try {
        await agentApi.saveOAuth('google', tokenResponse.access_token, tokenResponse.refresh_token);
        setConnected(true);
      } catch (error) {
        console.error("Failed to save OAuth token", error);
        alert("Failed to connect Google account.");
      } finally {
        setLoading(false);
      }
    },
    onError: (error) => {
      console.log('Login Failed:', error);
      alert("Google login failed.");
    }
  });

  return (
    <div className="bg-gray-900/50 border border-gray-700/80 rounded-2xl p-5 mb-6 text-center">
        <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest mb-3 flex justify-center items-center">
            <svg className="w-5 h-5 mr-2 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
            Google Workspace Integration
        </h3>
        <p className="text-xs text-gray-400 mb-4">Connect your Google account to let the AI agent send emails or schedule events on your behalf.</p>
        
        {connected ? (
            <div className="flex flex-col items-center gap-2">
                <div className="w-full px-4 py-2 bg-emerald-500/10 text-emerald-400 text-xs font-bold rounded-xl border border-emerald-500/20 inline-block">
                    ✓ Google Account Connected
                </div>
                <button 
                    type="button"
                    onClick={() => login()}
                    disabled={loading}
                    className="w-full py-2 px-4 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all bg-gray-800/60 text-gray-400 border border-gray-700/50 hover:text-gray-200 hover:bg-gray-700"
                >
                    {loading ? 'Refreshing...' : 'Refresh Connection'}
                </button>
            </div>
        ) : (
            <button 
                type="button"
                onClick={() => login()}
                disabled={loading}
                className={`w-full py-2 px-4 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${
                    loading 
                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700' 
                    : 'bg-blue-600/20 text-blue-300 border border-blue-500/30 hover:bg-blue-600/30 hover:border-blue-500/50'
                }`}
            >
                {loading ? 'Checking...' : 'Connect Google'}
            </button>
        )}
    </div>
  );
}
