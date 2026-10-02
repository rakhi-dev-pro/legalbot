import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  ChevronLeft, 
  ChevronRight, 
  Eye, 
  EyeOff, 
  Download, 
  AlertTriangle, 
  Sparkles,
  Layers,
  Loader2,
  FileWarning,
  X
} from 'lucide-react';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '3.11.174'}/pdf.worker.min.js`;
}

export default function PdfViewer({
  pdfBlob,
  highlights = [],
  activePage = 1,
  onPageChange,
  selectedClauseIds = [],
  activeClauseId = null,
  selectedClauseId = null, // backward compatibility
  onSelectClause,
  onDownloadAnnotated,
  downloadingAnnotated
}) {
  const currentActiveId = activeClauseId || selectedClauseId;

  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(activePage || 1);
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [renderError, setRenderError] = useState(null);
  const [showHighlights, setShowHighlights] = useState(true);
  const [activeDetailsClusterId, setActiveDetailsClusterId] = useState(null);

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const renderTaskRef = useRef(null);

  // Sync activePage prop
  useEffect(() => {
    if (activePage && Number(activePage) !== Number(currentPage)) {
      if (numPages === 0 || Number(activePage) <= numPages) {
        setCurrentPage(Number(activePage));
      }
    }
  }, [activePage, numPages]);

  // Load PDF Document from Blob
  useEffect(() => {
    if (!pdfBlob) return;

    let isMounted = true;
    setLoading(true);
    setRenderError(null);

    const loadPdf = async () => {
      try {
        const arrayBuffer = await pdfBlob.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const doc = await loadingTask.promise;
        
        if (isMounted) {
          setPdfDoc(doc);
          setNumPages(doc.numPages);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to load PDF via pdfjs:', err);
        if (isMounted) {
          setRenderError('Failed to parse PDF document. It may be corrupted or encrypted.');
          setLoading(false);
        }
      }
    };

    loadPdf();

    return () => {
      isMounted = false;
    };
  }, [pdfBlob]);

  // Render Page onto Canvas
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    let isCancelled = false;

    const renderPage = async () => {
      try {
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
        }

        const page = await pdfDoc.getPage(currentPage);
        if (isCancelled) return;

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        const task = page.render(renderContext);
        renderTaskRef.current = task;
        await task.promise;
      } catch (err) {
        if (err.name !== 'RenderingCancelledException') {
          console.error('PDF Page render error:', err);
        }
      }
    };

    renderPage();

    return () => {
      isCancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [pdfDoc, currentPage, scale]);

  const handlePageSwitch = (pageNum) => {
    if (pageNum >= 1 && pageNum <= numPages) {
      setCurrentPage(pageNum);
      if (onPageChange) onPageChange(pageNum);
    }
  };

  const handleZoomIn = () => setScale((prev) => Math.min(Math.round((prev + 0.1) * 10) / 10, 2.5));
  const handleZoomOut = () => setScale((prev) => Math.max(Math.round((prev - 0.1) * 10) / 10, 0.5));
  const handleZoomFit = () => setScale(1.0);

  // Filter highlights for current page and selectedClauseIds
  const pageHighlights = useMemo(() => {
    if (!highlights || !Array.isArray(highlights)) return [];
    const pageGroup = highlights.find((h) => Number(h.page_number) === Number(currentPage));
    if (!pageGroup || !Array.isArray(pageGroup.highlights)) return [];

    // If selectedClauseIds is passed, only show risks that are actively selected in right panel
    if (selectedClauseIds !== undefined && selectedClauseIds !== null) {
      const selSet = new Set((selectedClauseIds || []).map((id) => String(id).toLowerCase()));
      return pageGroup.highlights.filter((h) => selSet.has(String(h.clause_id).toLowerCase()));
    }
    return pageGroup.highlights;
  }, [highlights, currentPage, selectedClauseIds]);

  // Group overlapping highlights on the current page into paragraph clusters
  const highlightClusters = useMemo(() => {
    if (!pageHighlights.length) return [];

    const getBBox = (hl) => {
      let minX = 100, minY = 100, maxX = 0, maxY = 0;
      (hl.rects || []).forEach((r) => {
        minX = Math.min(minX, r.x);
        minY = Math.min(minY, r.y);
        maxX = Math.max(maxX, r.x + r.w);
        maxY = Math.max(maxY, r.y + r.h);
      });
      return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
    };

    const clusters = [];

    pageHighlights.forEach((hl) => {
      const bbox = getBBox(hl);

      // Match cluster ONLY if rects are in the exact same paragraph (significant vertical overlap)
      const matchingCluster = clusters.find((cluster) => {
        const cBBox = cluster.bbox;
        const verticalOverlap = Math.min(bbox.maxY, cBBox.maxY) - Math.max(bbox.minY, cBBox.minY);
        const minHeight = Math.min(bbox.h, cBBox.h);
        // Must overlap by at least 35% of paragraph height to be in the same paragraph
        return verticalOverlap > 0 && minHeight > 0 && (verticalOverlap / minHeight) > 0.35;
      });

      if (matchingCluster) {
        matchingCluster.highlights.push(hl);
        matchingCluster.bbox.minX = Math.min(matchingCluster.bbox.minX, bbox.minX);
        matchingCluster.bbox.minY = Math.min(matchingCluster.bbox.minY, bbox.minY);
        matchingCluster.bbox.maxX = Math.max(matchingCluster.bbox.maxX, bbox.maxX);
        matchingCluster.bbox.maxY = Math.max(matchingCluster.bbox.maxY, bbox.maxY);

        // Merge rects so the whole paragraph is represented without duplicate lines
        (hl.rects || []).forEach((newR) => {
          const exists = matchingCluster.rects.some(
            (er) => Math.abs(er.y - newR.y) < 1.0 && Math.abs(er.x - newR.x) < 2.0
          );
          if (!exists) {
            matchingCluster.rects.push(newR);
          }
        });
      } else {
        clusters.push({
          id: `cluster-${hl.clause_id}`,
          bbox: { ...bbox },
          rects: [...(hl.rects || [])],
          highlights: [hl]
        });
      }
    });

    return clusters;
  }, [pageHighlights]);

  return (
    <div className="flex flex-col h-full bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
      
      {/* PDF Controls Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-900/90 backdrop-blur border-b border-slate-800 shrink-0 select-none">
        
        {/* Page Nav */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => handlePageSwitch(currentPage - 1)}
            disabled={currentPage <= 1}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer"
            title="Previous Page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          
          <div className="flex items-center gap-1 text-xs font-mono text-slate-300 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
            <span>Pg</span>
            <span className="font-bold text-sky-400">{currentPage}</span>
            <span className="text-slate-600">/</span>
            <span>{numPages || 1}</span>
          </div>

          <button
            onClick={() => handlePageSwitch(currentPage + 1)}
            disabled={currentPage >= numPages}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer"
            title="Next Page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Quick Page Indicator with Risk Count */}
          {pageHighlights.length > 0 && (
            <span className="ml-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1 animate-pulse">
              <AlertTriangle className="w-3 h-3" />
              {pageHighlights.length} selected risk{pageHighlights.length > 1 ? 's' : ''} on this page
            </span>
          )}
        </div>

        {/* Zoom & View Controls */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center bg-slate-950 rounded-lg border border-slate-800 p-0.5">
            <button
              onClick={handleZoomOut}
              className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-mono text-slate-400 px-1.5">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleZoomFit}
              className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition cursor-pointer border-l border-slate-800 ml-0.5"
              title="Reset Zoom"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Toggle Highlights */}
          <button
            onClick={() => setShowHighlights(!showHighlights)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
              showHighlights
                ? 'bg-sky-600/20 border-sky-500/40 text-sky-300'
                : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
            }`}
            title="Toggle risk highlights on PDF"
          >
            {showHighlights ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span className="text-[11px] hidden sm:inline">Highlights</span>
          </button>

          {/* Download Annotated PDF (PyMuPDF) */}
          {onDownloadAnnotated && (
            <button
              onClick={onDownloadAnnotated}
              disabled={downloadingAnnotated}
              className="flex items-center gap-1 bg-slate-950 hover:bg-slate-800 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer disabled:opacity-50"
              title="Download PDF with embedded PyMuPDF highlight annotations"
            >
              {downloadingAnnotated ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span className="text-[11px] hidden md:inline">Annotated PDF</span>
            </button>
          )}
        </div>

      </div>

      {/* PDF Viewport & Canvas Area */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-x-auto overflow-y-auto p-4 bg-slate-950/70 select-none relative pdf-viewport"
      >
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/80 z-20">
            <Loader2 className="w-7 h-7 text-sky-400 animate-spin" />
            <p className="text-xs text-slate-400 font-medium">Decrypting & rendering PDF pages...</p>
          </div>
        )}

        {renderError && (
          <div className="flex flex-col items-center justify-center p-8 text-center text-rose-400 space-y-2">
            <FileWarning className="w-10 h-10 opacity-70" />
            <p className="text-sm font-semibold">{renderError}</p>
          </div>
        )}

        {/* Outer wrapper to center when small, and allow full horizontal scrolling without clipping when wide */}
        <div className="min-w-full w-max flex justify-center items-start">
          {/* Canvas wrapper with exact dimensions for highlight overlay */}
          <div className="relative shadow-2xl rounded-lg overflow-hidden border border-slate-800 shrink-0">
          
          <canvas ref={canvasRef} className="block bg-white" />

          {/* Interactive Highlight Layer */}
          {showHighlights && !loading && !renderError && (
            <div className="absolute inset-0 pointer-events-auto">
              {highlightClusters.map((cluster) => {
                const activeClauseInCluster = cluster.highlights.find((h) => h.clause_id === currentActiveId);
                const isClusterActive = Boolean(activeClauseInCluster);

                // Determine risk color:
                // If a risk in this cluster is actively selected in the right panel, use that specific risk's level!
                // Otherwise, use the highest risk level among active risks in this paragraph.
                const activeRiskLevel = activeClauseInCluster ? (activeClauseInCluster.risk_level || 'Medium').toUpperCase() : null;
                const hasHigh = cluster.highlights.some((h) => h.risk_level?.toUpperCase() === 'HIGH');
                const hasMed = cluster.highlights.some((h) => h.risk_level?.toUpperCase() === 'MEDIUM');
                const dominantRisk = hasHigh ? 'HIGH' : (hasMed ? 'MEDIUM' : 'LOW');
                const effectiveRisk = activeRiskLevel || dominantRisk;

                const isDetailsOpen = activeDetailsClusterId === cluster.id;
                const isNearTop = cluster.bbox.minY < 28;

                return (
                  <React.Fragment key={cluster.id}>
                    {/* 1. Title Badges Row: ONLY the Title of the risk is shown as the annotation above the paragraph */}
                    <div 
                      style={{
                        top: `${Math.max(0.4, cluster.bbox.minY - 3.2)}%`,
                        left: `${cluster.bbox.minX}%`,
                      }}
                      className="absolute flex items-center gap-1.5 z-30 pointer-events-auto"
                    >
                      {cluster.highlights.map((hl) => {
                        const isHigh = hl.risk_level?.toUpperCase() === 'HIGH';
                        const isMed = hl.risk_level?.toUpperCase() === 'MEDIUM';
                        const isClauseSelected = currentActiveId === hl.clause_id;

                        return (
                          <button
                            key={hl.clause_id}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onSelectClause) onSelectClause(hl.clause_id);
                              // Toggle details popover on click
                              setActiveDetailsClusterId((prev) => (prev === cluster.id ? null : cluster.id));
                            }}
                            className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider shadow-md border flex items-center gap-1 cursor-pointer transition-all duration-150 select-none ${
                              isClauseSelected
                                ? isHigh
                                  ? 'bg-rose-600 text-white border-rose-300 ring-2 ring-rose-400 shadow-rose-950/60 scale-105'
                                  : isMed
                                  ? 'bg-amber-600 text-white border-amber-300 ring-2 ring-amber-400 shadow-amber-950/60 scale-105'
                                  : 'bg-emerald-600 text-white border-emerald-300 ring-2 ring-emerald-400 shadow-emerald-950/60 scale-105'
                                : isHigh
                                ? 'bg-rose-950/95 text-rose-300 border-rose-500/70 hover:bg-rose-900 hover:border-rose-400'
                                : isMed
                                ? 'bg-amber-950/95 text-amber-300 border-amber-500/70 hover:bg-amber-900 hover:border-amber-400'
                                : 'bg-emerald-950/95 text-emerald-300 border-emerald-500/70 hover:bg-emerald-900 hover:border-emerald-400'
                            }`}
                            title={`Click to view details for ${hl.clause_type} (${hl.risk_level} Risk)`}
                          >
                            <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                            <span className="max-w-[150px] truncate">{hl.clause_type}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* 2. Highlight Rectangles: Full paragraph highlighted with dynamic color based on selected risk */}
                    {(cluster.rects || []).map((rect, rIdx) => {
                      const isFallback = rect.is_fallback_banner;

                      return (
                        <div
                          key={`${cluster.id}-rect-${rIdx}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            const targetHl = activeClauseInCluster || cluster.highlights[0];
                            if (onSelectClause) onSelectClause(targetHl.clause_id);
                            setActiveDetailsClusterId((prev) => (prev === cluster.id ? null : cluster.id));
                          }}
                          style={{
                            left: `${rect.x}%`,
                            top: `${rect.y}%`,
                            width: `${rect.w}%`,
                            height: `${rect.h}%`,
                            mixBlendMode: 'multiply',
                          }}
                          className={`absolute rounded transition-all duration-200 cursor-pointer ${
                            isFallback
                              ? 'border border-dashed border-amber-500 bg-amber-400/20 text-[9px] text-slate-800 px-2 flex items-center font-sans font-medium'
                              : isClusterActive
                              ? effectiveRisk === 'HIGH'
                                ? 'bg-rose-500/28 border-b-2 border-rose-600 ring-2 ring-rose-400/60 z-20'
                                : effectiveRisk === 'MEDIUM'
                                ? 'bg-amber-500/28 border-b-2 border-amber-600 ring-2 ring-amber-400/60 z-20'
                                : 'bg-emerald-500/28 border-b-2 border-emerald-600 ring-2 ring-emerald-400/60 z-20'
                              : effectiveRisk === 'HIGH'
                              ? 'bg-rose-500/15 hover:bg-rose-500/26 border-b border-rose-500/50 z-10'
                              : effectiveRisk === 'MEDIUM'
                              ? 'bg-amber-500/15 hover:bg-amber-500/26 border-b border-amber-500/50 z-10'
                              : 'bg-emerald-500/15 hover:bg-emerald-500/26 border-b border-emerald-500/50 z-10'
                          }`}
                        >
                          {isFallback && (
                            <span className="truncate">
                              📌 Page-level match: {cluster.highlights[0]?.clause_type} ({cluster.highlights[0]?.risk_level} Risk)
                            </span>
                          )}
                        </div>
                      );
                    })}

                    {/* 3. Clicked Annotation Details Popover: Shown ONLY when explicitly clicked */}
                    {isDetailsOpen && (
                      <div 
                        style={{
                          left: `${Math.min(Math.max(cluster.bbox.minX, 2), 58)}%`,
                          top: isNearTop 
                            ? `${cluster.bbox.maxY + 1.2}%` 
                            : `${cluster.bbox.minY - 1.2}%`,
                        }}
                        className={`absolute ${
                          isNearTop ? '' : '-translate-y-full mb-2'
                        } w-84 max-w-[360px] p-3.5 bg-slate-900/98 backdrop-blur-md border border-slate-700/90 rounded-xl shadow-2xl text-left pointer-events-auto z-50 animate-fadeIn space-y-2.5`}
                      >
                        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                            {cluster.highlights.length > 1
                              ? `${cluster.highlights.length} Risks in this Paragraph`
                              : 'Risk Details'}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveDetailsClusterId(null);
                            }}
                            className="text-slate-400 hover:text-slate-200 p-0.5 rounded hover:bg-slate-800 cursor-pointer transition"
                            title="Close details"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                          {cluster.highlights.map((hl) => {
                            const isHigh = hl.risk_level?.toUpperCase() === 'HIGH';
                            const isMed = hl.risk_level?.toUpperCase() === 'MEDIUM';
                            const isClauseSelected = currentActiveId === hl.clause_id;

                            return (
                              <div
                                key={hl.clause_id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onSelectClause) onSelectClause(hl.clause_id);
                                }}
                                className={`p-2.5 rounded-lg border transition cursor-pointer ${
                                  isClauseSelected
                                    ? 'bg-slate-800/90 border-sky-500 ring-1 ring-sky-400 shadow-md'
                                    : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1 mb-1">
                                  <span className="text-[11px] font-bold text-slate-200 truncate">
                                    {hl.clause_type}
                                  </span>
                                  <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${
                                    isHigh ? 'bg-rose-500/30 text-rose-300' : isMed ? 'bg-amber-500/30 text-amber-300' : 'bg-emerald-500/30 text-emerald-300'
                                  }`}>
                                    {hl.risk_level} Risk
                                  </span>
                                </div>
                                <p className="text-[10px] text-slate-300 line-clamp-3 leading-relaxed mb-1.5">
                                  {hl.explanation}
                                </p>
                                {hl.recommendation && (
                                  <p className="text-[9px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded p-1 line-clamp-2">
                                    💡 {hl.recommendation}
                                  </p>
                                )}
                                <div className="mt-1.5 flex items-center justify-between text-[9px]">
                                  <span className="text-sky-400 font-semibold">
                                    {isClauseSelected ? '✓ Inspected in right panel' : '👉 Click to inspect'}
                                  </span>
                                  {hl.confidence_score && (
                                    <span className="text-slate-500 font-mono">
                                      Conf: {Math.round(hl.confidence_score * 100)}%
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )}

          </div>
        </div>

      </div>

      {/* Reader Guidance Footer */}
      <div className="px-4 py-2 bg-slate-900/70 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between shrink-0">
        <span className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-sky-400" />
          <span>Click any <strong>highlighted risk badge</strong> to inspect risk description & recommendations</span>
        </span>
        <span className="text-slate-500 font-mono text-[10px]">
          Powered by PyMuPDF (fitz) & React PDF.js
        </span>
      </div>

    </div>
  );
}
