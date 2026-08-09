import React, { useState, useEffect } from 'react';
import { Activity, ShieldCheck, Database, HardDrive, Cpu, Server, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { fetchSystemDiagnostics } from '../services/api';

export default function SystemHealth({ isAuthenticated, onOpenAuth }) {
  const [diagnostics, setDiagnostics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const runDiagnostics = async () => {
    if (!isAuthenticated) {
      onOpenAuth();
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      const data = await fetchSystemDiagnostics();
      setDiagnostics(data);
    } catch (err) {
      console.error('Diagnostics error:', err);
      setErrorMsg(err.response?.data?.detail || err.message || 'Failed to execute system diagnostic test.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      runDiagnostics();
    }
  }, [isAuthenticated]);

  return (
    <div className="space-y-8 animate-fadeIn max-w-5xl mx-auto">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-100 flex items-center gap-3">
            <Activity className="w-8 h-8 text-sky-400" />
            System Health & Container Diagnostics
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">
            Protected endpoint test runner over HTTPS (<code className="text-sky-300 font-mono">/tests/all</code>)
          </p>
        </div>
        <div>
          <button
            onClick={runDiagnostics}
            disabled={loading}
            className="flex items-center gap-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white px-5 py-2.5 rounded-xl text-xs font-semibold shadow-lg shadow-sky-900/40 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Running 4-Service Diagnostics...' : '1-Click Run Diagnostic Suite'}</span>
          </button>
        </div>
      </div>

      {/* Main Results Card */}
      {diagnostics ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6 glow-sky">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-7 h-7 text-emerald-400" />
              <div>
                <h3 className="font-bold text-lg text-slate-100">
                  Integration Test Execution Completed
                </h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Executed {diagnostics.summary?.total_tests || 0} service tests in {diagnostics.summary?.total_duration_ms || 0} ms
                </p>
              </div>
            </div>

            <span className={`px-3 py-1 rounded-full text-xs font-extrabold border ${
              diagnostics.overall_status === 'ALL_SYSTEMS_OPERATIONAL'
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 glow-emerald'
                : 'bg-amber-500/20 text-amber-400 border-amber-500/40 glow-amber'
            }`}>
              {diagnostics.overall_status}
            </span>
          </div>

          {/* Individual Service Cards */}
          <div className="grid grid-cols-1 gap-4">
            {diagnostics.services?.map((svc, idx) => (
              <div
                key={idx}
                className="bg-slate-950 p-5 rounded-xl border border-slate-800 hover:border-slate-700 transition space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {svc.status === 'PASS' ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
                    )}
                    <h4 className="font-bold text-sm text-slate-200">{svc.name}</h4>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 font-mono">{svc.duration_ms} ms</span>
                    <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-extrabold font-mono border ${
                      svc.status === 'PASS'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    }`}>
                      {svc.status}
                    </span>
                  </div>
                </div>

                {svc.details && (
                  <pre className="text-xs text-slate-300 font-mono bg-slate-900 p-3 rounded-lg border border-slate-800 overflow-x-auto">
                    {JSON.stringify(svc.details, null, 2)}
                  </pre>
                )}

                {svc.error && (
                  <p className="text-xs text-rose-400 font-mono bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20">
                    {svc.error}
                  </p>
                )}
              </div>
            ))}
          </div>

        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400 space-y-4">
          <Activity className="w-12 h-12 text-sky-400 mx-auto opacity-60 animate-pulse" />
          <h3 className="text-lg font-bold text-slate-200">System Diagnostic Diagnostics Ready</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Click the button above to execute protected test suite `/tests/all` across PostgreSQL, Redis, llama.cpp, and FastAPI over HTTPS.
          </p>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

    </div>
  );
}
