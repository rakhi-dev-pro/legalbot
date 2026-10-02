import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  ArrowLeft, 
  ShieldAlert, 
  ShieldCheck, 
  AlertTriangle, 
  FileText, 
  Printer, 
  Filter, 
  Cpu, 
  CheckCircle2, 
  Search, 
  ExternalLink, 
  Sparkles, 
  BookOpen, 
  Layers, 
  ChevronDown, 
  ChevronUp, 
  ChevronRight, 
  Eye, 
  EyeOff, 
  Download, 
  Copy, 
  Check, 
  X, 
  MousePointerClick, 
  MessageSquare, 
  PenTool, 
  Compass,
  FileSearch,
  CheckSquare
} from 'lucide-react';
import { 
  fetchDocumentChunks, 
  fetchDocumentPdfBlob, 
  fetchDocumentHighlights, 
  fetchAnnotatedPdfBlob 
} from '../services/api';
import PdfViewer from './PdfViewer';

export default function ReportViewer({ report, onBack }) {
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedSeverity, setSelectedSeverity] = useState('ALL');
  
  // Multi-select: List of clause IDs currently selected for highlighting on PDF
  const [selectedClauseIds, setSelectedClauseIds] = useState([]);

  // Single active inspected clause (selected by clicking highlighted text or card)
  const [selectedClauseId, setSelectedClauseId] = useState(null);
  
  // Document data states
  const [documentChunks, setDocumentChunks] = useState([]);
  const [loadingChunks, setLoadingChunks] = useState(false);
  const [pdfBlob, setPdfBlob] = useState(null);
  const [pdfHighlights, setPdfHighlights] = useState([]);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [downloadingAnnotated, setDownloadingAnnotated] = useState(false);
  
  // Viewer state
  const [readerType, setReaderType] = useState('pdf'); // 'pdf' | 'text'
  const [viewMode, setViewMode] = useState('split'); // 'split' | 'report_only'
  const [activePage, setActivePage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [summaryExpanded, setSummaryExpanded] = useState(true);
  const [copiedText, setCopiedText] = useState(false);

  // Copilot interactive simulation state
  const [copilotAction, setCopilotAction] = useState(null);

  const docChunkRefs = useRef({});

  useEffect(() => {
    if (report && report.document_id) {
      loadDocumentData(report.document_id);
    }
    if (report && report.risk_clauses) {
      // Default: select all detected risks so they are highlighted in the PDF
      setSelectedClauseIds(report.risk_clauses.map((c) => c.id));
    }
  }, [report]);

  const loadDocumentData = async (docId) => {
    // 1. Load Text Chunks
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

    // 2. Load PDF Blob & Highlights (PyMuPDF fitz)
    setLoadingPdf(true);
    // Fetch PDF blob immediately so viewer displays right away
    fetchDocumentPdfBlob(docId)
      .then((blob) => {
        setPdfBlob(blob);
        if (!blob) setReaderType('text');
      })
      .catch((e) => {
        console.warn('PDF blob not available (may not be PDF):', e);
        setReaderType('text');
      })
      .finally(() => setLoadingPdf(false));

    // Fetch highlights in parallel with retry
    const loadHighlights = async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const highlights = await fetchDocumentHighlights(docId);
          if (highlights && Array.isArray(highlights) && highlights.length > 0) {
            setPdfHighlights(highlights);
            return;
          }
        } catch (err) {
          console.warn(`Highlights fetch attempt ${attempt + 1} failed:`, err);
        }
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 1200));
        }
      }
    };
    loadHighlights();
  };

  if (!report) return null;

  const clauses = report.risk_clauses || [];
  const entities = report.key_entities || {};

  const filteredClauses = clauses.filter((c) => {
    const matchCat = selectedCategory === 'ALL' || c.clause_type === selectedCategory;
    const matchSev = selectedSeverity === 'ALL' || (c.risk_level && c.risk_level.toUpperCase() === selectedSeverity);
    return matchCat && matchSev;
  });

  // Toggle selection of a single clause for PDF highlighting
  const handleToggleClauseSelect = (clauseId, e) => {
    if (e) e.stopPropagation();
    setSelectedClauseIds((prev) => {
      if (prev.includes(clauseId)) {
        return prev.filter((id) => id !== clauseId);
      } else {
        return [...prev, clauseId];
      }
    });
  };

  // Select all detected risks
  const handleSelectAllRisks = () => {
    setSelectedClauseIds(clauses.map((c) => c.id));
  };

  // Deselect all detected risks
  const handleDeselectAllRisks = () => {
    setSelectedClauseIds([]);
  };

  // Group chunks by page number for text view
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
    const fromChunks = Object.keys(pageGroups).map(Number);
    const fromHighlights = pdfHighlights.map((h) => h.page_number);
    const combined = Array.from(new Set([...fromChunks, ...fromHighlights, 1])).sort((a, b) => a - b);
    return combined;
  }, [pageGroups, pdfHighlights]);

  // Handle clicking a highlighted text element or card to inspect
  const handleSelectClause = (clauseId) => {
    if (selectedClauseId === clauseId) {
      setSelectedClauseId(null);
      setCopilotAction(null);
      return;
    }

    setSelectedClauseId(clauseId);
    setCopilotAction(null);

    // Auto-select this clause in multi-select set so its highlight is visible
    setSelectedClauseIds((prev) => (prev.includes(clauseId) ? prev : [...prev, clauseId]));

    // Auto-switch to the page containing this clause
    const clause = clauses.find((c) => c.id === clauseId);
    if (clause && clause.page_number) {
      setActivePage(clause.page_number);
    }

    // Scroll chunk into view if in text mode
    if (readerType === 'text') {
      setTimeout(() => {
        if (docChunkRefs.current[clauseId]) {
          docChunkRefs.current[clauseId].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  };

  // Download PyMuPDF-annotated PDF containing selected risks
  const handleDownloadAnnotatedPdf = async () => {
    if (!report?.document_id) return;
    setDownloadingAnnotated(true);
    try {
      const blob = await fetchAnnotatedPdfBlob(report.document_id, selectedClauseIds);
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `annotated_${report.document_id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download annotated PDF:', err);
      alert('Failed to generate annotated PDF. Please try again.');
    } finally {
      setDownloadingAnnotated(false);
    }
  };

  const handleCopyClause = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const handlePrintReport = () => {
    window.print();
  };

  const SeverityChip = ({ level, className = '' }) => {
    const norm = (level || '').toUpperCase();
    if (norm === 'HIGH') {
      return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm shadow-rose-900/30 ${className}`}>
          <AlertTriangle className="w-3 h-3" /> HIGH RISK
        </span>
      );
    }
    if (norm === 'MEDIUM') {
      return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm shadow-amber-900/30 ${className}`}>
          <AlertTriangle className="w-3 h-3" /> MEDIUM RISK
        </span>
      );
    }
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-900/30 ${className}`}>
        <ShieldCheck className="w-3 h-3" /> LOW RISK
      </span>
    );
  };

  // Get selected clause object
  const activeClause = useMemo(() => {
    return clauses.find((c) => c.id === selectedClauseId) || null;
  }, [clauses, selectedClauseId]);

  // Count risks per page for page navigation sidebar
  const riskCountPerPage = useMemo(() => {
    const counts = {};
    clauses.forEach((clause) => {
      const page = clause.page_number || 1;
      counts[page] = (counts[page] || 0) + 1;
    });
    return counts;
  }, [clauses]);

  // Check matching clauses for text chunks
  const getMatchingClausesForChunk = (chunkText) => {
    if (!chunkText) return [];
    const normChunk = chunkText.toLowerCase().replace(/\s+/g, ' ');
    return clauses.filter((clause) => {
      const normClause = (clause.clause_text || '').toLowerCase().replace(/\s+/g, ' ');
      return normChunk.includes(normClause.substring(0, 45)) || normClause.includes(normChunk.substring(0, 45));
    });
  };

  return (
    <div className="space-y-4 animate-fadeIn max-w-full mx-auto print:p-0">
      
      {/* Top Bar Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3 print:hidden">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 text-xs font-semibold bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <FileText className="w-5 h-5 text-sky-400" /> Contract Risk Analysis
            </h1>
            <p className="text-[11px] text-slate-400 font-mono">
              Document ID: {report.document_id}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Reader Type Switcher: Interactive PDF vs Extracted Text */}
          {pdfBlob && viewMode === 'split' && (
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
              <button
                onClick={() => setReaderType('pdf')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition cursor-pointer ${
                  readerType === 'pdf'
                    ? 'bg-sky-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Render original PDF with interactive highlighted text"
              >
                <FileSearch className="w-3.5 h-3.5" /> PDF Highlighting
              </button>
              <button
                onClick={() => setReaderType('text')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition cursor-pointer ${
                  readerType === 'text'
                    ? 'bg-sky-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="View clean extracted document text"
              >
                <BookOpen className="w-3.5 h-3.5" /> Text Reader
              </button>
            </div>
          )}

          {/* Download Annotated PDF (PyMuPDF) */}
          <button
            onClick={handleDownloadAnnotatedPdf}
            disabled={downloadingAnnotated}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-amber-400 px-3 py-1.5 rounded-xl text-xs font-semibold border border-amber-500/30 transition cursor-pointer disabled:opacity-50"
            title="Download PDF with embedded PyMuPDF highlight annotations & comments"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{downloadingAnnotated ? 'Generating...' : 'Export Annotated PDF'}</span>
          </button>

          {/* Layout Mode Switcher */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
            <button
              onClick={() => setViewMode('split')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition cursor-pointer ${
                viewMode === 'split' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" /> Split Viewer
            </button>
            <button
              onClick={() => setViewMode('report_only')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition cursor-pointer ${
                viewMode === 'report_only' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" /> Report Only
            </button>
          </div>

          <button
            onClick={handlePrintReport}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-800 transition cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
        </div>
      </div>

      {/* Main Split Grid */}
      <div className={`grid grid-cols-1 ${viewMode === 'split' ? 'lg:grid-cols-12' : ''} gap-5`}>
        
        {/* LEFT PANEL: Interactive Document Viewer (PDF or Text) */}
        {viewMode === 'split' && (
          <div className="lg:col-span-7 flex gap-2.5" style={{ height: 'calc(100vh - 145px)' }}>

            {/* Page Navigation Strip */}
            <div className="w-14 shrink-0 flex flex-col gap-1.5 overflow-y-auto pr-1 py-1">
              {pageNumbers.map((pageNum) => (
                <button
                  key={pageNum}
                  onClick={() => setActivePage(pageNum)}
                  className={`relative flex flex-col items-center justify-center py-2 px-1 rounded-xl text-center transition-all duration-200 border cursor-pointer ${
                    activePage === pageNum
                      ? 'bg-sky-600/20 border-sky-500 text-sky-300 shadow-md ring-1 ring-sky-500/50'
                      : 'bg-slate-900/80 border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <span className="text-[8px] font-bold uppercase tracking-widest leading-none mb-0.5">Pg</span>
                  <span className="text-sm font-extrabold leading-none">{pageNum}</span>
                  {riskCountPerPage[pageNum] && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-rose-500 text-white text-[8px] font-bold flex items-center justify-center shadow">
                      {riskCountPerPage[pageNum]}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Interactive Document Display */}
            <div className="flex-1 h-full min-w-0">
              {readerType === 'pdf' && pdfBlob ? (
                /* 1. PDF Canvas Viewer with Interactive Highlights */
                <PdfViewer
                  pdfBlob={pdfBlob}
                  highlights={pdfHighlights}
                  activePage={activePage}
                  onPageChange={(p) => setActivePage(p)}
                  selectedClauseIds={selectedClauseIds}
                  activeClauseId={selectedClauseId}
                  selectedClauseId={selectedClauseId}
                  onSelectClause={handleSelectClause}
                  onDownloadAnnotated={handleDownloadAnnotatedPdf}
                  downloadingAnnotated={downloadingAnnotated}
                />
              ) : (
                /* 2. Clean Extracted Text Reader with Clickable Highlight Spans */
                <div className="h-full bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                  
                  {/* Header */}
                  <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3 shrink-0">
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-sky-400" />
                      <h3 className="font-bold text-xs text-slate-100">Document Text with Risk Highlighting</h3>
                      {activePage && (
                        <span className="text-[10px] bg-sky-500/10 text-sky-400 px-2 py-0.5 rounded-full font-bold border border-sky-500/20">
                          Page {activePage}
                        </span>
                      )}
                    </div>
                    <div className="relative w-44">
                      <Search className="absolute left-2.5 top-2 w-3 h-3 text-slate-500" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search text..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-7 pr-2 py-1 text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>

                  {/* Text Content */}
                  <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    {loadingChunks ? (
                      <div className="p-8 text-center text-slate-500">
                        <p className="animate-pulse">Loading decrypted document text...</p>
                      </div>
                    ) : activePage && pageGroups[activePage] ? (
                      pageGroups[activePage].map((chunk) => {
                        const matchingClauses = getMatchingClausesForChunk(chunk.chunk_text);
                        const hasMatch = matchingClauses.length > 0;
                        const isChunkSelected = matchingClauses.some((c) => c.id === selectedClauseId);
                        
                        const primaryMatch = matchingClauses[0];
                        const isHigh = matchingClauses.some((c) => c.risk_level?.toUpperCase() === 'HIGH');
                        const isMed = matchingClauses.some((c) => c.risk_level?.toUpperCase() === 'MEDIUM');

                        const filteredBySearch = searchTerm && !chunk.chunk_text.toLowerCase().includes(searchTerm.toLowerCase());
                        if (filteredBySearch) return null;

                        return (
                          <div
                            key={chunk._globalIndex}
                            ref={(el) => {
                              matchingClauses.forEach((mc) => {
                                docChunkRefs.current[mc.id] = el;
                              });
                            }}
                            className={`p-4 rounded-xl border transition-all duration-200 ${
                              isChunkSelected
                                ? isHigh
                                  ? 'bg-rose-950/40 border-rose-500 ring-2 ring-rose-500/40 shadow-xl'
                                  : 'bg-amber-950/40 border-amber-500 ring-2 ring-amber-500/40 shadow-xl'
                                : hasMatch
                                ? isHigh
                                  ? 'bg-rose-950/20 border-rose-500/40 hover:border-rose-500'
                                  : isMed
                                  ? 'bg-amber-950/20 border-amber-500/40 hover:border-amber-500'
                                  : 'bg-emerald-950/20 border-emerald-500/40'
                                : 'bg-slate-950/60 border-slate-800'
                            }`}
                          >
                            {/* Section Header with Clickable Risk Badge */}
                            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                Section {chunk._globalIndex + 1}
                              </span>
                              
                              {hasMatch && (
                                <div className="flex items-center gap-1.5">
                                  {matchingClauses.map((clause) => {
                                    const isClauseSelected = selectedClauseId === clause.id;
                                    const clauseIsHigh = clause.risk_level?.toUpperCase() === 'HIGH';
                                    const clauseIsMed = clause.risk_level?.toUpperCase() === 'MEDIUM';

                                    return (
                                      <button
                                        key={clause.id}
                                        onClick={() => handleSelectClause(clause.id)}
                                        className={`text-[9px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 transition cursor-pointer ${
                                          isClauseSelected
                                            ? 'bg-sky-500 text-white shadow ring-2 ring-sky-300'
                                            : clauseIsHigh
                                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
                                            : clauseIsMed
                                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                                        }`}
                                      >
                                        <AlertTriangle className="w-2.5 h-2.5" />
                                        <span>{clause.clause_type}</span>
                                        <span className="text-[8px] opacity-75">({isClauseSelected ? 'Selected' : 'Inspect'})</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            {/* Section Text - clicking anywhere on a risky section selects it */}
                            <div
                              onClick={() => {
                                if (hasMatch) handleSelectClause(primaryMatch.id);
                              }}
                              className={hasMatch ? 'cursor-pointer' : ''}
                            >
                              <p className={`text-xs leading-relaxed font-mono whitespace-pre-wrap ${
                                isChunkSelected
                                  ? 'text-slate-100 font-medium'
                                  : hasMatch
                                  ? 'text-slate-200'
                                  : 'text-slate-400'
                              }`}>
                                {chunk.chunk_text}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-8 text-center text-slate-500">
                        <p>Document text is not available.</p>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="px-4 py-2 bg-slate-950 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between shrink-0">
                    <span className="flex items-center gap-1 text-sky-400">
                      <MousePointerClick className="w-3.5 h-3.5" /> Click any highlighted section or badge to inspect risk details
                    </span>
                  </div>

                </div>
              )}
            </div>

          </div>
        )}

        {/* RIGHT PANEL: Streamlined Inspector & Future Extension Workspace */}
        <div className={viewMode === 'split' ? 'lg:col-span-5' : 'w-full'}>
          <div 
            className="space-y-4" 
            style={viewMode === 'split' ? { height: 'calc(100vh - 145px)', overflowY: 'auto' } : {}}
          >

            {/* 1. Collapsible Executive Summary Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-sky-400" />
                  <h2 className="text-sm font-bold text-slate-100">Executive Summary</h2>
                  <SeverityChip level={report.overall_risk} />
                  {report.composite_risk_score !== undefined && report.composite_risk_score !== null && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono border border-slate-700 font-semibold" title="Weighted Composite Risk Score">
                      Score: {report.composite_risk_score}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setSummaryExpanded(!summaryExpanded)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
                  title={summaryExpanded ? 'Collapse Summary' : 'Expand Summary'}
                >
                  {summaryExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>

              {summaryExpanded && (
                <div className="space-y-3 animate-fadeIn">
                  <p className="text-xs text-slate-300 leading-relaxed font-sans bg-slate-950 p-3 rounded-xl border border-slate-800/80">
                    {report.executive_summary}
                  </p>

                  {/* Key Entities Mini Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Object.entries(entities).map(([key, val]) => (
                      <div key={key} className="bg-slate-950 p-2 rounded-lg border border-slate-800/80">
                        <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider block">
                          {key.replace('_', ' ')}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-200 font-mono truncate block">
                          {Array.isArray(val) ? (val.length ? val.join(', ') : 'None') : (val || 'None')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 2. MULTI-RISK SELECTOR & CHECKLIST CARD (Select/Deselect reflects on PDF in real-time) */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-sky-500/20 border border-sky-500/40 flex items-center justify-center">
                    <CheckSquare className="w-3.5 h-3.5 text-sky-400" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-100">Document Risk Checklist</h3>
                    <p className="text-[10px] text-slate-500">Toggle risks to highlight on original PDF</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-300 font-bold border border-sky-500/20">
                    {selectedClauseIds.length}/{clauses.length} Active
                  </span>
                  <button
                    onClick={handleSelectAllRisks}
                    className="text-[10px] px-2 py-0.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 transition cursor-pointer font-medium"
                    title="Select all risks"
                  >
                    Select All
                  </button>
                  <button
                    onClick={handleDeselectAllRisks}
                    className="text-[10px] px-2 py-0.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-400 border border-slate-800 transition cursor-pointer font-medium"
                    title="Clear all selections"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Severity Quick Filters */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1">
                {['ALL', 'HIGH', 'MEDIUM', 'LOW'].map((sev) => {
                  const count = sev === 'ALL'
                    ? clauses.length
                    : clauses.filter((c) => (c.risk_level || '').toUpperCase() === sev).length;
                  return (
                    <button
                      key={sev}
                      onClick={() => setSelectedSeverity(sev)}
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg border transition cursor-pointer flex items-center gap-1 ${
                        selectedSeverity === sev
                          ? 'bg-sky-600 text-white border-sky-500 shadow-sm'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <span>{sev}</span>
                      <span className="text-[9px] opacity-75">({count})</span>
                    </button>
                  );
                })}
              </div>

              {/* Scrollable Risk Items */}
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {filteredClauses.length === 0 ? (
                  <p className="text-[11px] text-slate-500 text-center py-3">No risks match the selected filter.</p>
                ) : (
                  filteredClauses.map((clause) => {
                    const isChecked = selectedClauseIds.includes(clause.id);
                    const isInspected = selectedClauseId === clause.id;

                    return (
                      <div
                        key={clause.id}
                        onClick={() => handleSelectClause(clause.id)}
                        className={`p-2.5 rounded-xl border transition cursor-pointer flex items-center justify-between gap-2.5 ${
                          isInspected
                            ? 'bg-slate-800/90 border-sky-500 ring-1 ring-sky-400 shadow-md'
                            : isChecked
                            ? 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                            : 'bg-slate-950/30 border-slate-850 opacity-60 hover:opacity-100'
                        }`}
                      >
                        {/* Left: Checkbox */}
                        <div
                          onClick={(e) => handleToggleClauseSelect(clause.id, e)}
                          className="flex items-center justify-center cursor-pointer p-0.5 shrink-0"
                          title={isChecked ? 'Deselect to remove highlight from PDF' : 'Select to highlight on PDF'}
                        >
                          {isChecked ? (
                            <div className="w-4 h-4 rounded bg-sky-600 flex items-center justify-center text-white shadow">
                              <Check className="w-3 h-3" />
                            </div>
                          ) : (
                            <div className="w-4 h-4 rounded border border-slate-600 bg-slate-950 hover:border-sky-400" />
                          )}
                        </div>

                        {/* Center: Title & Excerpt Snippet */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                            <span className="text-xs font-bold text-slate-200 truncate">
                              {clause.clause_type}
                            </span>
                            <SeverityChip level={clause.risk_level} className="text-[9px] px-1.5 py-0" />
                          </div>
                          <p className="text-[10px] text-slate-400 truncate">
                            {clause.explanation || clause.clause_text}
                          </p>
                        </div>

                        {/* Right: Page Tag & Inspect Action */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                            Pg {clause.page_number || 1}
                          </span>
                          <span className={`text-[10px] font-bold ${isInspected ? 'text-sky-400' : 'text-slate-500'}`}>
                            {isInspected ? 'Inspecting' : 'Inspect'}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 3. ACTIVE RISK INSPECTOR & ACTIONABLE RECOMMENDATIONS */}
            {activeClause ? (
              <div className="bg-slate-900 border-2 border-sky-500/70 rounded-2xl p-4 shadow-2xl shadow-sky-950/40 space-y-3.5 animate-fadeIn glow-sky">
                {/* Header */}
                <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-sm font-extrabold text-slate-100 flex items-center gap-1.5">
                        <ShieldAlert className="w-4 h-4 text-rose-400" />
                        {activeClause.clause_type}
                      </span>
                      <SeverityChip level={activeClause.risk_level} />
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                      <span>Confidence: {Math.round(activeClause.confidence_score * 100)}%</span>
                      {activeClause.page_number && (
                        <span>• Found on Page {activeClause.page_number}</span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedClauseId(null)}
                    className="p-1 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                    title="Close Inspector"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Legal Risk Explanation Description */}
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-400" /> Legal Risk Assessment
                  </h4>
                  <p className="text-xs text-slate-200 leading-relaxed bg-slate-950 p-3 rounded-xl border border-slate-800">
                    {activeClause.explanation}
                  </p>
                </div>

                {/* Actionable Legal Counsel Recommendation */}
                {activeClause.recommendation && (
                  <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 space-y-1">
                    <div className="flex items-center gap-1.5 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> Recommended Action
                    </div>
                    <p className="text-xs text-emerald-200 leading-relaxed font-sans">
                      {activeClause.recommendation}
                    </p>
                  </div>
                )}

                {/* Quoted Source Excerpt */}
                {activeClause.clause_text && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Clause Excerpt in Document
                      </span>
                      <button
                        onClick={() => handleCopyClause(activeClause.clause_text)}
                        className="flex items-center gap-1 text-[10px] text-sky-400 hover:text-sky-300 transition cursor-pointer"
                      >
                        {copiedText ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        {copiedText ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <pre className="text-[11px] text-amber-300/90 bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono whitespace-pre-wrap max-h-24 overflow-y-auto">
                      "{activeClause.clause_text.trim()}"
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 shadow-xl">
                <div className="flex items-center gap-3 p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-slate-400 text-[11px]">
                  <MousePointerClick className="w-4 h-4 text-sky-400 shrink-0" />
                  <span>Click any risk card above or highlighted text on the PDF to inspect counsel guidance & AI counter-clauses.</span>
                </div>
              </div>
            )}

            {/* 3. FUTURE EXTENSION WORKSPACE (Utilizing the newly saved right-panel space) */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-sky-500/20 border border-sky-500/40 flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-100">AI Legal Copilot Workspace</h3>
                    <p className="text-[10px] text-slate-500">Reclaimed space for upcoming tools</p>
                  </div>
                </div>
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-300 font-bold border border-sky-500/20">
                  Ready for Extension
                </span>
              </div>

              {/* Interactive Tool Actions */}
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setCopilotAction('redline')}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between gap-1.5 ${
                      copilotAction === 'redline'
                        ? 'bg-sky-950/60 border-sky-500 ring-1 ring-sky-400'
                        : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <PenTool className="w-3.5 h-3.5 text-sky-400" />
                    <div>
                      <span className="text-[11px] font-bold text-slate-200 block">Draft Counter-Clause</span>
                      <span className="text-[9px] text-slate-400 block leading-tight">AI redline to mitigate liability</span>
                    </div>
                  </button>

                  <button
                    onClick={() => setCopilotAction('compliance')}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between gap-1.5 ${
                      copilotAction === 'compliance'
                        ? 'bg-sky-950/60 border-sky-500 ring-1 ring-sky-400'
                        : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <Compass className="w-3.5 h-3.5 text-emerald-400" />
                    <div>
                      <span className="text-[11px] font-bold text-slate-200 block">Jurisdiction Check</span>
                      <span className="text-[9px] text-slate-400 block leading-tight">Verify local state enforceability</span>
                    </div>
                  </button>
                </div>

                {/* Copilot Action Output Preview */}
                {copilotAction === 'redline' && (
                  <div className="p-3 bg-slate-950 rounded-xl border border-sky-500/30 text-xs text-slate-300 space-y-2 animate-fadeIn">
                    <div className="flex items-center justify-between text-sky-400 font-bold text-[10px]">
                      <span>⚡ Suggested Protective Amendment:</span>
                      <button onClick={() => setCopilotAction(null)} className="text-slate-500 hover:text-slate-300">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="font-mono text-[11px] text-emerald-300 bg-slate-900 p-2 rounded border border-slate-800 leading-relaxed">
                      "Notwithstanding anything to the contrary, termination without cause shall require a minimum of thirty (30) days prior written notice, and liability shall be limited to direct damages up to fees paid."
                    </p>
                    <button
                      onClick={() => handleCopyClause("Notwithstanding anything to the contrary, termination without cause shall require a minimum of thirty (30) days prior written notice, and liability shall be limited to direct damages up to fees paid.")}
                      className="text-[10px] text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" /> Copy amendment to clipboard
                    </button>
                  </div>
                )}

                {copilotAction === 'compliance' && (
                  <div className="p-3 bg-slate-950 rounded-xl border border-emerald-500/30 text-xs text-slate-300 space-y-1.5 animate-fadeIn">
                    <div className="flex items-center justify-between text-emerald-400 font-bold text-[10px]">
                      <span>⚖ Enforceability Analysis:</span>
                      <button onClick={() => setCopilotAction(null)} className="text-slate-500 hover:text-slate-300">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Non-compete and unilateral forfeiture clauses are subject to strict scrutiny under governing law. Indian Contract Act (Section 27) generally voids agreements in restraint of trade.
                    </p>
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
