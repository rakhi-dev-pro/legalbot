import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ArrowLeft, ShieldAlert, ShieldCheck, AlertTriangle, FileText, Printer, Filter, Cpu, CheckCircle2, Search, ExternalLink, Sparkles, BookOpen, Layers, ChevronDown, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { fetchDocumentChunks } from '../services/api';

export default function ReportViewer({ report, onBack }) {
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedSeverity, setSelectedSeverity] = useState('ALL');
  // Multi-select: Set of clause IDs currently "pinned" for highlighting
  const [selectedClauseIds, setSelectedClauseIds] = useState(new Set());
  const [documentChunks, setDocumentChunks] = useState([]);
  const [loadingChunks, setLoadingChunks] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('split'); // 'split' | 'report_only'
  // Page navigation
  const [activePage, setActivePage] = useState(null); // null = show all pages

  const clauseRefs = useRef({});
  const docChunkRefs = useRef({});
  const pageRefs = useRef({});

  useEffect(() => {
    if (report && report.document_id) {
      loadChunks(report.document_id);
    }
  }, [report]);

  const loadChunks = async (docId) => {
    setLoadingChunks(true);
    try {
      const chunks = await fetchDocumentChunks(docId);
      setDocumentChunks(chunks || []);
    } catch (err) {
      console.error('Failed to load document text chunks:', err);
      setDocumentChunks([]);
    } finally {
      setLoadingChunks(false);
    }
  };

  if (!report) return null;

  const clauses = report.risk_clauses || [];
  const entities = report.key_entities || {};

  const filteredClauses = clauses.filter((c) => {
    const matchCat = selectedCategory === 'ALL' || c.clause_type === selectedCategory;
    const matchSev = selectedSeverity === 'ALL' || (c.risk_level && c.risk_level.toUpperCase() === selectedSeverity);
    return matchCat && matchSev;
  });

  // Group chunks by page number for page-wise rendering
  const pageGroups = useMemo(() => {
    const groups = {};
    documentChunks.forEach((chunk, idx) => {
      const page = chunk.page_number || 1;
      if (!groups[page]) groups[page] = [];
      groups[page].push({ ...chunk, _globalIndex: idx });
    });
    return groups;
  }, [documentChunks]);

  const pageNumbers = useMemo(() => {
    return Object.keys(pageGroups).map(Number).sort((a, b) => a - b);
  }, [pageGroups]);

  // Set initial active page once chunks are loaded
  useEffect(() => {
    if (pageNumbers.length > 0 && activePage === null) {
      setActivePage(pageNumbers[0]);
    }
  }, [pageNumbers]);

  // Toggle a clause selection (multi-select)
  const toggleClauseSelection = (clauseId) => {
    setSelectedClauseIds((prev) => {
      const next = new Set(prev);
      if (next.has(clauseId)) {
        next.delete(clauseId);
      } else {
        next.add(clauseId);
      }
      return next;
    });
  };

  // When clicking a clause on the right panel: toggle selection + scroll to matching chunk
  const handleSelectClause = (clauseId) => {
    toggleClauseSelection(clauseId);

    // Find the clause and auto-navigate to its page
    const clause = clauses.find((c) => c.id === clauseId);
    if (clause && clause.page_number) {
      setActivePage(clause.page_number);
    }

    // Scroll to the matching chunk after a short delay for page switch
    setTimeout(() => {
      if (docChunkRefs.current[clauseId]) {
        docChunkRefs.current[clauseId].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  // Clear all selections
  const clearAllSelections = () => {
    setSelectedClauseIds(new Set());
  };

  const handlePrintReport = () => {
    window.print();
  };

  const SeverityChip = ({ level }) => {
    const norm = (level || '').toUpperCase();
    if (norm === 'HIGH') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm shadow-rose-900/30">
          <AlertTriangle className="w-3 h-3" /> HIGH RISK
        </span>
      );
    }
    if (norm === 'MEDIUM') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm shadow-amber-900/30">
          <AlertTriangle className="w-3 h-3" /> MEDIUM RISK
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-900/30">
        <ShieldCheck className="w-3 h-3" /> LOW RISK
      </span>
    );
  };

  // Check if a given chunk is associated with any of the SELECTED risk clauses
  const getSelectedMatchesForChunk = (chunkText) => {
    if (!chunkText || selectedClauseIds.size === 0) return [];
    const normChunk = chunkText.toLowerCase().replace(/\s+/g, ' ');
    return clauses.filter((clause) => {
      if (!selectedClauseIds.has(clause.id)) return false;
      const normClause = (clause.clause_text || '').toLowerCase().replace(/\s+/g, ' ');
      return normChunk.includes(normClause.substring(0, 50)) || normClause.includes(normChunk.substring(0, 50));
    });
  };

  // Count risks per page for the page nav sidebar
  const riskCountPerPage = useMemo(() => {
    const counts = {};
    clauses.forEach((clause) => {
      const page = clause.page_number || 1;
      counts[page] = (counts[page] || 0) + 1;
    });
    return counts;
  }, [clauses]);

  return (
    <div className="space-y-5 animate-fadeIn max-w-full mx-auto print:p-0">
      
      {/* Top Bar Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4 print:hidden">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-slate-400 hover:text-slate-200 text-xs font-semibold bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <FileText className="w-5 h-5 text-sky-400" /> Contract Analysis Viewer
            </h1>
            <p className="text-[11px] text-slate-400 font-mono">
              Document ID: {report.document_id}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Mode Switcher */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
            <button
              onClick={() => setViewMode('split')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition cursor-pointer ${
                viewMode === 'split' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" /> Side-by-Side Reader
            </button>
            <button
              onClick={() => setViewMode('report_only')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition cursor-pointer ${
                viewMode === 'report_only' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" /> Summary Report Only
            </button>
          </div>

          <button
            onClick={handlePrintReport}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-sky-400 px-3.5 py-1.5 rounded-xl text-xs font-semibold border border-slate-800 transition cursor-pointer"
          >
            <Printer className="w-4 h-4" /> Print / Export PDF
          </button>
        </div>
      </div>

      {/* Main Container Layout */}
      <div className={`grid grid-cols-1 ${viewMode === 'split' ? 'lg:grid-cols-12' : ''} gap-5`}>
        
        {/* LEFT PANEL: Page-wise Document Reader */}
        {viewMode === 'split' && (
          <div className="lg:col-span-7 flex gap-3" style={{ height: 'calc(100vh - 160px)' }}>

            {/* Page Navigation Sidebar */}
            <div className="w-16 shrink-0 flex flex-col gap-1.5 overflow-y-auto pr-1 py-1">
              {pageNumbers.map((pageNum) => (
                <button
                  key={pageNum}
                  onClick={() => setActivePage(pageNum)}
                  className={`relative flex flex-col items-center justify-center py-2.5 px-1 rounded-xl text-center transition-all duration-200 border ${
                    activePage === pageNum
                      ? 'bg-sky-600/20 border-sky-500 text-sky-300 shadow-lg shadow-sky-900/20 ring-1 ring-sky-500/50'
                      : 'bg-slate-900/80 border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700 hover:bg-slate-800/50'
                  }`}
                >
                  <span className="text-[9px] font-bold uppercase tracking-widest leading-none mb-0.5">Pg</span>
                  <span className="text-base font-extrabold leading-none">{pageNum}</span>
                  {riskCountPerPage[pageNum] && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[8px] font-bold flex items-center justify-center shadow-md">
                      {riskCountPerPage[pageNum]}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Document Content Area */}
            <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden glow-sky">
              
              {/* Reader Header */}
              <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3 shrink-0">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-sky-400" />
                  <h3 className="font-bold text-sm text-slate-100">Original Document</h3>
                  {activePage && (
                    <span className="text-[10px] bg-sky-500/10 text-sky-400 px-2.5 py-0.5 rounded-full font-bold border border-sky-500/20">
                      Page {activePage} of {pageNumbers.length}
                    </span>
                  )}
                  {selectedClauseIds.size > 0 && (
                    <span className="text-[10px] bg-rose-500/10 text-rose-400 px-2.5 py-0.5 rounded-full font-bold border border-rose-500/20 flex items-center gap-1">
                      <Eye className="w-3 h-3" /> {selectedClauseIds.size} risk{selectedClauseIds.size > 1 ? 's' : ''} highlighted
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {selectedClauseIds.size > 0 && (
                    <button
                      onClick={clearAllSelections}
                      className="text-[10px] text-slate-400 hover:text-rose-300 px-2 py-0.5 rounded-lg hover:bg-rose-500/10 transition font-semibold"
                    >
                      Clear highlights
                    </button>
                  )}
                  <div className="relative w-40">
                    <Search className="absolute left-2.5 top-2 w-3 h-3 text-slate-500" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search in text..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-7 pr-2 py-1 text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>
              </div>

              {/* Document Text — Page-wise View */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-0">
                {loadingChunks ? (
                  <div className="p-8 text-center text-slate-500 font-sans">
                    <p className="animate-pulse">Loading decrypted document text...</p>
                  </div>
                ) : activePage && pageGroups[activePage] ? (
                  <>
                    {/* Page Header */}
                    <div className="flex items-center gap-3 mb-5 pb-3 border-b-2 border-sky-500/20">
                      <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
                        <span className="text-sm font-extrabold text-sky-400">{activePage}</span>
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-200">Page {activePage}</h4>
                        <p className="text-[10px] text-slate-500">
                          {pageGroups[activePage].length} section{pageGroups[activePage].length !== 1 ? 's' : ''} on this page
                          {riskCountPerPage[activePage] && (
                            <span className="text-rose-400 ml-2">• {riskCountPerPage[activePage]} risk{riskCountPerPage[activePage] > 1 ? 's' : ''} detected</span>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Sections within this page */}
                    {pageGroups[activePage].map((chunk) => {
                      const matchingClauses = getSelectedMatchesForChunk(chunk.chunk_text);
                      const isHighlighted = matchingClauses.length > 0;
                      const hasHigh = matchingClauses.some(c => c.risk_level?.toUpperCase() === 'HIGH');
                      const hasMed = matchingClauses.some(c => c.risk_level?.toUpperCase() === 'MEDIUM');

                      const filteredBySearch = searchTerm && !chunk.chunk_text.toLowerCase().includes(searchTerm.toLowerCase());
                      if (filteredBySearch) return null;

                      return (
                        <div
                          key={chunk._globalIndex}
                          ref={(el) => {
                            if (isHighlighted) {
                              matchingClauses.forEach(clause => {
                                docChunkRefs.current[clause.id] = el;
                              });
                            }
                          }}
                          className="mb-4"
                        >
                          {/* Section Separator */}
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <div className={`w-1 h-5 rounded-full ${isHighlighted ? (hasHigh ? 'bg-rose-500' : hasMed ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-slate-700'}`} />
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                              Section {chunk._globalIndex + 1}
                            </span>
                            {isHighlighted && matchingClauses.map((matchingClause, mIdx) => {
                              const isHighClause = matchingClause.risk_level?.toUpperCase() === 'HIGH';
                              const isMedClause = matchingClause.risk_level?.toUpperCase() === 'MEDIUM';
                              return (
                                <span key={matchingClause.id || mIdx} className={`text-[9px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                                  isHighClause ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : isMedClause ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                }`}>
                                  <AlertTriangle className="w-2.5 h-2.5" /> {matchingClause.clause_type}
                                </span>
                              );
                            })}
                          </div>

                          {/* Section Content */}
                          <div
                            className={`px-4 py-3 rounded-xl transition-all duration-300 border-l-[3px] ${
                              isHighlighted
                                ? hasHigh
                                  ? 'bg-rose-950/30 border-l-rose-500 ring-1 ring-rose-500/20 shadow-lg shadow-rose-900/10'
                                  : hasMed
                                  ? 'bg-amber-950/30 border-l-amber-500 ring-1 ring-amber-500/20 shadow-lg shadow-amber-900/10'
                                  : 'bg-emerald-950/30 border-l-emerald-500 ring-1 ring-emerald-500/20'
                                : 'bg-slate-950/50 border-l-slate-800'
                            }`}
                          >
                            <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap font-mono">
                              {chunk.chunk_text}
                            </p>
                          </div>
                        </div>
                      );
                    })}

                    {/* Page Footer Navigation */}
                    <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-800/60">
                      <button
                        onClick={() => {
                          const idx = pageNumbers.indexOf(activePage);
                          if (idx > 0) setActivePage(pageNumbers[idx - 1]);
                        }}
                        disabled={pageNumbers.indexOf(activePage) === 0}
                        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-sky-400 disabled:opacity-30 disabled:hover:text-slate-400 transition px-3 py-1.5 rounded-lg hover:bg-slate-800/50"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" /> Previous Page
                      </button>
                      <span className="text-[10px] text-slate-500 font-mono">
                        Page {activePage} of {pageNumbers.length}
                      </span>
                      <button
                        onClick={() => {
                          const idx = pageNumbers.indexOf(activePage);
                          if (idx < pageNumbers.length - 1) setActivePage(pageNumbers[idx + 1]);
                        }}
                        disabled={pageNumbers.indexOf(activePage) === pageNumbers.length - 1}
                        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-sky-400 disabled:opacity-30 disabled:hover:text-slate-400 transition px-3 py-1.5 rounded-lg hover:bg-slate-800/50"
                      >
                        Next Page <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="p-8 text-center text-slate-500 font-sans">
                    <p>Document text is not available or still processing.</p>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* RIGHT PANEL: AI Risk Analysis & Interactive Clauses */}
        <div className={viewMode === 'split' ? 'lg:col-span-5' : 'w-full'}>
          <div className="space-y-5" style={viewMode === 'split' ? { height: 'calc(100vh - 160px)', overflowY: 'auto' } : {}}>
          
          {/* Header Summary Box */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-lg font-bold text-slate-100">Executive Summary & Metadata</h2>
                <p className="text-[11px] text-slate-400 font-mono">Model: {report.model_used}</p>
              </div>
              <SeverityChip level={report.overall_risk} />
            </div>

            <p className="text-xs text-slate-300 leading-relaxed font-sans bg-slate-950 p-3.5 rounded-xl border border-slate-800">
              {report.executive_summary}
            </p>

            {/* Entity Chips */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {Object.entries(entities).map(([key, val]) => (
                <div key={key} className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">
                    {key.replace('_', ' ')}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-200 font-mono truncate block">
                    {Array.isArray(val) ? (val.length ? val.join(', ') : 'Not Specified') : (val || 'Not Specified')}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Risk Clauses Section */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                  Detected Risk Clauses ({filteredClauses.length})
                </h3>
                <p className="text-[11px] text-slate-400">
                  Click clauses to highlight them in the document reader (multi-select)
                </p>
              </div>

              <div className="flex items-center gap-2">
                {/* Severity Filter Tabs */}
                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[10px] font-bold">
                  <Filter className="w-3 h-3 text-slate-500 ml-1.5" />
                  {['ALL', 'HIGH', 'MEDIUM', 'LOW'].map((sev) => (
                    <button
                      key={sev}
                      onClick={() => setSelectedSeverity(sev)}
                      className={`px-2 py-0.5 rounded transition cursor-pointer ${
                        selectedSeverity === sev
                          ? 'bg-sky-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {sev}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Clause Cards List */}
            <div className="space-y-3">
              {filteredClauses.length > 0 ? (
                filteredClauses.map((clause, idx) => {
                  const isSelected = selectedClauseIds.has(clause.id);

                  return (
                    <div
                      key={clause.id || idx}
                      ref={(el) => (clauseRefs.current[clause.id] = el)}
                      onClick={() => handleSelectClause(clause.id)}
                      className={`p-4 rounded-xl border transition-all duration-200 cursor-pointer space-y-2.5 ${
                        isSelected
                          ? 'bg-sky-950/60 border-sky-500 ring-2 ring-sky-400/60 shadow-xl shadow-sky-900/20'
                          : 'bg-slate-950/90 border-slate-800 hover:border-slate-700 hover:bg-slate-900/80'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs flex items-center gap-2">
                          {/* Selection indicator */}
                          <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                            isSelected
                              ? 'bg-sky-500 border-sky-400 text-white'
                              : 'border-slate-600 text-transparent hover:border-slate-500'
                          }`}>
                            {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                          </span>
                          <span className="text-sky-400">{idx + 1}. {clause.clause_type}</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400 font-mono">
                            Confidence: {(clause.confidence_score * 100).toFixed(0)}%
                          </span>
                          <SeverityChip level={clause.risk_level} />
                        </div>
                      </div>

                      {/* Explanation */}
                      <p className="text-xs text-slate-200 font-sans leading-relaxed">
                        {clause.explanation}
                      </p>

                      {/* Recommended Action */}
                      {clause.recommendation && (
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/20">
                          <Sparkles className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-0.5">Recommended Action</p>
                            <p className="text-xs text-emerald-200/90 leading-relaxed">{clause.recommendation}</p>
                          </div>
                        </div>
                      )}

                      {/* Snippet */}
                      <pre className="text-[11px] text-amber-300/90 bg-slate-900 p-2.5 rounded-lg border border-slate-800 font-mono whitespace-pre-wrap max-h-24 overflow-hidden">
                        "{clause.clause_text?.substring(0, 300)}{clause.clause_text?.length > 300 ? '...' : ''}"
                      </pre>

                      {/* Page indicator */}
                      {clause.page_number && (
                        <div className="flex items-center gap-1 text-[10px] text-slate-500">
                          <FileText className="w-3 h-3" />
                          Found on Page {clause.page_number}
                          {isSelected && (
                            <span className="ml-2 text-sky-400 font-semibold flex items-center gap-1">
                              <Eye className="w-3 h-3" /> Highlighted in reader
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="p-8 text-center text-slate-500 bg-slate-950 rounded-xl border border-slate-800">
                  <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-emerald-400 opacity-60" />
                  <p className="text-xs font-semibold">No clauses found matching selected criteria.</p>
                </div>
              )}
            </div>

          </div>
          </div>
        </div>

      </div>

    </div>
  );
}
