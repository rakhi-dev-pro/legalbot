import React, { useState } from 'react';
import { FileText, AlertTriangle, ShieldCheck, Cpu, Search, Trash2, Eye, RefreshCw, UploadCloud, ChevronRight, CheckCircle2 } from 'lucide-react';
import { deleteDocument, triggerDocumentAnalysis, fetchDocumentReport } from '../services/api';

export default function Dashboard({ documents, loading, onSelectDocReport, onNavigateUpload, onRefresh }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRisk, setFilterRisk] = useState('ALL');
  const [processingDocId, setProcessingDocId] = useState(null);

  const filteredDocs = documents.filter((doc) => {
    const matchesSearch = doc.original_filename.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRisk = filterRisk === 'ALL' || (doc.overall_risk && doc.overall_risk.toUpperCase() === filterRisk);
    return matchesSearch && matchesRisk;
  });

  // Calculate statistics
  const totalCount = documents.length;
  const highRiskCount = documents.filter((d) => d.overall_risk === 'High' || d.overall_risk === 'HIGH').length;
  const completedCount = documents.filter((d) => d.status === 'completed').length;

  const handleViewReport = async (docId) => {
    try {
      setProcessingDocId(docId);
      const report = await fetchDocumentReport(docId);
      onSelectDocReport(report);
    } catch (err) {
      console.error('Error fetching report:', err);
      // If report not generated yet, attempt re-trigger
      try {
        await triggerDocumentAnalysis(docId);
        onRefresh();
      } catch (trigErr) {
        alert('Could not retrieve report. Please ensure analysis is completed.');
      }
    } finally {
      setProcessingDocId(null);
    }
  };

  const handleDelete = async (docId, filename) => {
    if (window.confirm(`Are you sure you want to delete contract "${filename}"?`)) {
      try {
        await deleteDocument(docId);
        onRefresh();
      } catch (err) {
        alert('Failed to delete document.');
      }
    }
  };

  const RiskBadge = ({ level }) => {
    if (!level) return <span className="text-slate-500 font-mono text-[11px]">Pending</span>;
    const norm = level.toUpperCase();
    if (norm === 'HIGH') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 glow-rose">
          <AlertTriangle className="w-3 h-3" /> HIGH RISK
        </span>
      );
    }
    if (norm === 'MEDIUM') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 glow-amber">
          <AlertTriangle className="w-3 h-3" /> MEDIUM RISK
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 glow-emerald">
        <ShieldCheck className="w-3 h-3" /> LOW RISK
      </span>
    );
  };

  return (
    <div className="space-y-8 animate-fadeIn max-w-7xl mx-auto">
      
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-100">
            Contract Intelligence Dashboard
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">
            Real-time automated legal risk scoring and document repository
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onNavigateUpload}
            className="flex items-center gap-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-lg shadow-sky-900/40 transition cursor-pointer"
          >
            <UploadCloud className="w-4 h-4" /> Upload New Document
          </button>
          <button
            onClick={onRefresh}
            title="Refresh Library"
            className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-800 transition cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Aggregate Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        {/* Card 1 */}
        <div className="glass-card p-5 rounded-2xl border border-slate-800/80 hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Total Analyzed Documents</span>
            <div className="p-2 bg-sky-500/10 text-sky-400 rounded-xl">
              <FileText className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-slate-100 mt-2">{totalCount}</p>
          <p className="text-[11px] text-slate-500 mt-1 font-mono">{completedCount} fully processed</p>
        </div>

        {/* Card 2 */}
        <div className="glass-card p-5 rounded-2xl border border-slate-800/80 hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">High Risk Flags</span>
            <div className="p-2 bg-rose-500/10 text-rose-400 rounded-xl">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-rose-400 mt-2">{highRiskCount}</p>
          <p className="text-[11px] text-slate-500 mt-1 font-mono">Requires immediate counsel review</p>
        </div>

        {/* Card 3 */}
        <div className="glass-card p-5 rounded-2xl border border-slate-800/80 hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">AI Model Engine</span>
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl">
              <Cpu className="w-5 h-5" />
            </div>
          </div>
          <p className="text-lg font-bold text-slate-100 mt-2">IBM Granite 4.1 3B</p>
          <p className="text-[11px] text-amber-300/80 mt-1 font-mono">Local llama.cpp GGUF</p>
        </div>

        {/* Card 4 */}
        <div className="glass-card p-5 rounded-2xl border border-slate-800/80 hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Privacy & Security</span>
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>
          <p className="text-lg font-bold text-emerald-400 mt-2">100% On-Premise</p>
          <p className="text-[11px] text-slate-500 mt-1 font-mono">AES-256 encrypted storage</p>
        </div>

      </div>

      {/* Document Library Table Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
        
        {/* Table Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search contracts by name..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500 transition"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs text-slate-400 font-medium">Filter Risk:</span>
            {['ALL', 'HIGH', 'MEDIUM', 'LOW'].map((riskKey) => (
              <button
                key={riskKey}
                onClick={() => setFilterRisk(riskKey)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  filterRisk === riskKey
                    ? 'bg-sky-600 text-white shadow-md'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {riskKey}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Document Name</th>
                <th className="py-3 px-4">Upload Date</th>
                <th className="py-3 px-4">Size</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Risk Severity</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredDocs.length > 0 ? (
                filteredDocs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-850/50 transition">
                    <td className="py-3.5 px-4 font-semibold text-slate-100 flex items-center gap-2.5">
                      <FileText className="w-4 h-4 text-sky-400 shrink-0" />
                      <span className="truncate max-w-xs">{doc.original_filename}</span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-400">
                      {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : 'Today'}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-400">
                      {(doc.file_size_bytes / 1024).toFixed(1)} KB
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center gap-1 font-mono text-[11px] ${
                        doc.status === 'completed' ? 'text-emerald-400' : 'text-amber-400'
                      }`}>
                        <CheckCircle2 className="w-3 h-3" />
                        {doc.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <RiskBadge level={doc.overall_risk} />
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleViewReport(doc.id)}
                          disabled={processingDocId === doc.id}
                          className="flex items-center gap-1.5 bg-sky-600/20 hover:bg-sky-600 text-sky-300 hover:text-white px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer border border-sky-500/30"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>{processingDocId === doc.id ? 'Loading...' : 'View Report'}</span>
                        </button>

                        <button
                          onClick={async () => {
                            try {
                              setProcessingDocId(doc.id);
                              await triggerDocumentAnalysis(doc.id, true);
                              alert(`Re-analysis dispatched with ?force=true for "${doc.original_filename}".`);
                              onRefresh();
                            } catch (e) {
                              alert('Failed to trigger re-analysis: ' + (e.response?.data?.detail || e.message));
                            } finally {
                              setProcessingDocId(null);
                            }
                          }}
                          disabled={processingDocId === doc.id}
                          title="Force re-run AI risk analysis"
                          className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition cursor-pointer"
                        >
                          <RefreshCw className={`w-4 h-4 ${processingDocId === doc.id ? 'animate-spin' : ''}`} />
                        </button>

                        <button
                          onClick={() => handleDelete(doc.id, doc.original_filename)}
                          title="Delete Contract"
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-slate-500">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p>No legal documents found in repository.</p>
                    <button
                      onClick={onNavigateUpload}
                      className="mt-3 text-sky-400 hover:underline font-semibold text-xs inline-flex items-center gap-1"
                    >
                      Upload your first contract <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>

    </div>
  );
}
