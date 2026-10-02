import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, Sparkles, CheckCircle2, AlertCircle, RefreshCw, ArrowRight, ShieldAlert, Cpu } from 'lucide-react';
import { uploadDocument, triggerDocumentAnalysis, fetchDocumentReport } from '../services/api';

export default function UploadSection({ onAnalysisComplete, onOpenAuth, isAuthenticated }) {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [processingState, setProcessingState] = useState(''); // 'uploading' | 'analyzing' | 'completed' | 'error'
  const [progressText, setProgressText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      validateAndSetFile(droppedFile);
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (selectedFile) => {
    setErrorMsg('');
    const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'];
    if (!validTypes.includes(selectedFile.type) && !selectedFile.name.endsWith('.pdf') && !selectedFile.name.endsWith('.docx')) {
      setErrorMsg('Invalid file format. Please upload a PDF or DOCX legal document.');
      return;
    }
    if (selectedFile.size > 25 * 1024 * 1024) {
      setErrorMsg('File size exceeds maximum limit of 25MB.');
      return;
    }
    setFile(selectedFile);
  };

  const processFileUpload = async (targetFile) => {
    if (!isAuthenticated) {
      onOpenAuth();
      return;
    }

    setUploading(true);
    setErrorMsg('');
    setProcessingState('uploading');
    setProgressText('Encrypting & Uploading Document Payload to LegalBot Storage...');

    try {
      // 1. Upload file
      const uploadedDoc = await uploadDocument(targetFile);
      const docId = uploadedDoc.id;

      // 2. Trigger AI Analysis
      setProcessingState('analyzing');
      setProgressText('Dispatching IBM Granite local LLM risk analysis & entity extraction pipeline...');
      await triggerDocumentAnalysis(docId);

      // 3. Poll for results
      let retries = 0;
      const maxRetries = 180; // Allow up to 360 seconds for complete local CPU AI analysis
      let finalReport = null;

      while (retries < maxRetries) {
        retries++;
        const elapsedSec = retries * 2;
        setProgressText(`Analyzing contract with local AI engine... (${elapsedSec}s elapsed)`);
        await new Promise((res) => setTimeout(res, 2000));

        try {
          const report = await fetchDocumentReport(docId);
          if (report && report.executive_summary) {
            finalReport = report;
            break;
          }
        } catch (pollErr) {
          // Status 202 expected while processing in background
          if (pollErr.response && pollErr.response.status === 202) {
            continue;
          }
        }
      }

      if (finalReport) {
        setProcessingState('completed');
        setProgressText('✅ AI Legal Analysis Completed!');
        setTimeout(() => {
          onAnalysisComplete(finalReport);
        }, 800);
      } else {
        throw new Error('AI Analysis is taking longer than expected. Please check your Dashboard to view the report once ready.');
      }
    } catch (err) {
      console.error('Pipeline error:', err);
      setProcessingState('error');
      setErrorMsg(err.response?.data?.detail || err.message || 'An error occurred during analysis.');
    } finally {
      setUploading(false);
    }
  };

  // Helper to load sample PDF directly from sample dataset
  const handleLoadSampleDocument = async () => {
    if (!isAuthenticated) {
      onOpenAuth();
      return;
    }

    setUploading(true);
    setErrorMsg('');
    setProcessingState('uploading');
    setProgressText('Loading Sample Offer Letter Contract...');

    try {
      // Create sample synthetic blob payload matching sample document
      const sampleContent = `%PDF-1.4
1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj
2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj
3 0 obj <</Type /Page /Parent 2 0 R /Resources <<>> /Contents 4 0 R>> endobj
4 0 obj <</Length 350>> stream
BT /F1 12 Tf 50 700 Td (OFFER LETTER FOR AI BACKEND ENGINEER. Deepanshu Yadav is extended an offer at $120,000 per year.) ET
BT /F1 10 Tf 50 670 Td (1. Termination: At-Will employment. Company reserves right to terminate without cause.) ET
BT /F1 10 Tf 50 640 Td (2. Non-Compete: Employee agrees not to engage in competing business for 12 months after termination.) ET
BT /F1 10 Tf 50 610 Td (3. Security Deposit: Landlord/Employer holds right of full forfeiture upon breach.) ET
endstream endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000192 00000 n 
trailer <</Size 5 /Root 1 0 R>>
startxref
590
%%EOF`;
      const blob = new Blob([sampleContent], { type: 'application/pdf' });
      const sampleFile = new File([blob], 'Deepanshu - Offer Letter AI Backend Engineer.pdf', { type: 'application/pdf' });
      setFile(sampleFile);
      await processFileUpload(sampleFile);
    } catch (err) {
      setErrorMsg('Failed to load sample document.');
      setUploading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn">
      
      {/* Title Banner */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20 mb-2">
          <Sparkles className="w-3.5 h-3.5" /> Powered by Local IBM Granite 4.1 3B GGUF Model
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-100">
          Upload Legal Contract for Risk Analysis
        </h1>
        <p className="text-slate-400 text-xs sm:text-sm max-w-2xl mx-auto">
          Private, containerized zero-shot clause extraction, entity recognition, and risk scoring. No data leaves your secure local infrastructure.
        </p>
      </div>

      {/* Main Upload Dropzone */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl glow-sky">
        
        {!isAuthenticated && (
          <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between text-amber-300 text-xs">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 shrink-0" />
              <span>Authentication required to process legal contract uploads.</span>
            </div>
            <button
              onClick={onOpenAuth}
              className="bg-amber-500 text-slate-950 font-bold px-3 py-1.5 rounded-lg hover:bg-amber-400 transition cursor-pointer"
            >
              Sign In
            </button>
          </div>
        )}

        <form onDragEnter={handleDrag} onSubmit={(e) => e.preventDefault()}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.doc"
            onChange={handleChange}
            className="hidden"
          />

          <div
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-10 text-center transition cursor-pointer flex flex-col items-center justify-center gap-4 ${
              dragActive
                ? 'border-sky-400 bg-sky-500/10 scale-[1.01]'
                : 'border-slate-800 hover:border-slate-700 bg-slate-950/60'
            }`}
          >
            <div className="p-4 bg-gradient-to-tr from-sky-500/20 to-indigo-500/20 text-sky-400 rounded-2xl border border-sky-500/30">
              <UploadCloud className="w-10 h-10 animate-bounce" />
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-200">
                {file ? file.name : 'Click to select or drag and drop legal document'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Supports PDF and DOCX files (Up to 25 MB)
              </p>
            </div>

            {file && (
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-800 text-sky-400 rounded-lg text-xs font-mono border border-slate-700">
                <FileText className="w-3.5 h-3.5" /> {(file.size / 1024).toFixed(1)} KB
              </div>
            )}
          </div>
        </form>

        {/* Action Buttons */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          
          {/* Quick-load Sample Document Button */}
          <button
            type="button"
            onClick={handleLoadSampleDocument}
            disabled={uploading}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-amber-300 px-4 py-2.5 rounded-xl text-xs font-semibold border border-slate-700 transition cursor-pointer disabled:opacity-50"
          >
            <FileText className="w-4 h-4 text-amber-400" />
            <span>Load Sample Offer Letter PDF</span>
          </button>

          {/* Trigger Analysis Button */}
          <button
            type="button"
            onClick={() => file && processFileUpload(file)}
            disabled={!file || uploading}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-semibold py-2.5 px-6 rounded-xl text-xs shadow-lg shadow-sky-900/40 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {uploading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Running AI Pipeline...</span>
              </>
            ) : (
              <>
                <Cpu className="w-4 h-4" />
                <span>Start AI Risk Analysis</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>

        {/* Progress & Status Box */}
        {uploading && (
          <div className="mt-6 p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-sky-400 flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                {processingState === 'uploading' ? 'Uploading Payload' : 'llama.cpp Local Inference active'}
              </span>
              <span className="text-slate-500 font-mono">Status: {processingState.toUpperCase()}</span>
            </div>
            <p className="text-xs text-slate-300 font-mono">{progressText}</p>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div className="bg-gradient-to-r from-sky-500 to-indigo-500 h-full w-3/4 animate-pulse"></div>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {errorMsg && (
          <div className="mt-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
            <div>
              <p className="font-semibold">Analysis Failure</p>
              <p className="text-slate-300 font-mono mt-0.5">{errorMsg}</p>
            </div>
          </div>
        )}

      </div>

      {/* Enterprise Privacy Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-4 rounded-xl border border-slate-800 flex items-start gap-3">
          <div className="p-2 bg-sky-500/10 text-sky-400 rounded-lg shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-200">100% On-Premise Privacy</h4>
            <p className="text-[11px] text-slate-400 mt-1">Zero cloud API calls. Contracts remain inside your docker network.</p>
          </div>
        </div>

        <div className="glass-card p-4 rounded-xl border border-slate-800 flex items-start gap-3">
          <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-200">Granite 4.1 3B AI Model</h4>
            <p className="text-[11px] text-slate-400 mt-1">IBM quantized GGUF served via llama.cpp for high-precision legal extraction.</p>
          </div>
        </div>

        <div className="glass-card p-4 rounded-xl border border-slate-800 flex items-start gap-3">
          <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-200">pgvector Semantic Search</h4>
            <p className="text-[11px] text-slate-400 mt-1">PostgreSQL 17 HNSW index vector search across legal risk categories.</p>
          </div>
        </div>
      </div>

    </div>
  );
}
