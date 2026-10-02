import React, { useState, useEffect } from 'react';
import {
  Settings, Users, BarChart3, Shield, Plus, Pencil, Trash2, Save, X,
  ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Crown, UserCog,
  FileText, AlertTriangle, CheckCircle2, Clock, TrendingUp, Loader2,
  RefreshCw, Play, Sparkles, Filter, Search, Sliders, Check
} from 'lucide-react';
import {
  fetchAdminRules, createAdminRule, updateAdminRule, deleteAdminRule,
  fetchAdminUsers, updateUserRole, toggleUserActive, fetchAdminStats,
  fetchAdminDocuments, reanalyzeAdminDocument, reanalyzeAllAdminDocuments,
  testAdminRuleMatch
} from '../services/api';

const TABS = [
  { id: 'stats', label: 'Analytics', icon: BarChart3 },
  { id: 'rules', label: 'Risk Rules & Thresholds', icon: Shield },
  { id: 'docs', label: 'Documents & Re-analysis', icon: FileText },
  { id: 'users', label: 'Users & Roles', icon: Users },
];

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState('stats');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Stats
  const [stats, setStats] = useState(null);

  // Rules
  const [rules, setRules] = useState([]);
  const [editingRule, setEditingRule] = useState(null);
  const [showNewRuleForm, setShowNewRuleForm] = useState(false);
  const [newRule, setNewRule] = useState({
    category: '',
    default_risk_level: 'Medium',
    confidence_threshold: 0.75,
    weight: 1.0,
    description: '',
    keywords: '',
    is_active: true
  });

  // Rule Tester / Simulator
  const [showTester, setShowTester] = useState(false);
  const [testText, setTestText] = useState('');
  const [testKeywords, setTestKeywords] = useState('');
  const [testResults, setTestResults] = useState(null);
  const [testingMatch, setTestingMatch] = useState(false);

  // Documents & Re-analysis
  const [documents, setDocuments] = useState([]);
  const [reanalyzingDocId, setReanalyzingDocId] = useState(null);
  const [reanalyzingAll, setReanalyzingAll] = useState(false);
  const [docSearch, setDocSearch] = useState('');

  // Users
  const [users, setUsers] = useState([]);

  useEffect(() => {
    if (activeTab === 'stats') loadStats();
    if (activeTab === 'rules') loadRules();
    if (activeTab === 'docs') loadDocuments();
    if (activeTab === 'users') loadUsers();
  }, [activeTab]);

  const loadStats = async () => {
    setLoading(true); setError(null);
    try { setStats(await fetchAdminStats()); }
    catch (e) { setError(e.response?.data?.detail || 'Failed to load stats'); }
    finally { setLoading(false); }
  };

  const loadRules = async () => {
    setLoading(true); setError(null);
    try { setRules(await fetchAdminRules()); }
    catch (e) { setError(e.response?.data?.detail || 'Failed to load rules'); }
    finally { setLoading(false); }
  };

  const loadDocuments = async () => {
    setLoading(true); setError(null);
    try { setDocuments(await fetchAdminDocuments()); }
    catch (e) { setError(e.response?.data?.detail || 'Failed to load documents'); }
    finally { setLoading(false); }
  };

  const loadUsers = async () => {
    setLoading(true); setError(null);
    try { setUsers(await fetchAdminUsers()); }
    catch (e) { setError(e.response?.data?.detail || 'Failed to load users'); }
    finally { setLoading(false); }
  };

  const showNotification = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 5000);
  };

  const handleSaveRule = async (ruleId, updates) => {
    try {
      await updateAdminRule(ruleId, updates);
      setEditingRule(null);
      showNotification('Risk rule updated successfully.');
      loadRules();
    } catch (e) { setError(e.response?.data?.detail || 'Failed to update rule'); }
  };

  const handleCreateRule = async () => {
    if (!newRule.category.trim()) {
      setError('Please provide a category name.');
      return;
    }
    try {
      await createAdminRule(newRule);
      setShowNewRuleForm(false);
      setNewRule({
        category: '', default_risk_level: 'Medium', confidence_threshold: 0.75,
        weight: 1.0, description: '', keywords: '', is_active: true
      });
      showNotification(`Created new risk category "${newRule.category}".`);
      loadRules();
    } catch (e) { setError(e.response?.data?.detail || 'Failed to create rule'); }
  };

  const handleDeleteRule = async (ruleId) => {
    if (!window.confirm('Are you sure you want to delete this risk rule?')) return;
    try {
      await deleteAdminRule(ruleId);
      showNotification('Risk rule removed.');
      loadRules();
    } catch (e) { setError(e.response?.data?.detail || 'Failed to delete rule'); }
  };

  const handleTestRuleMatch = async () => {
    if (!testText.trim()) return;
    setTestingMatch(true); setError(null);
    try {
      const res = await testAdminRuleMatch(testText, testKeywords);
      setTestResults(res);
    } catch (e) {
      setError(e.response?.data?.detail || 'Rule simulation failed');
    } finally {
      setTestingMatch(false);
    }
  };

  const handleReanalyzeDocument = async (docId, filename) => {
    setReanalyzingDocId(docId); setError(null);
    try {
      await reanalyzeAdminDocument(docId);
      showNotification(`Re-analysis dispatched for "${filename}". Highlights will update automatically.`);
      setTimeout(() => loadDocuments(), 2000);
    } catch (e) {
      setError(e.response?.data?.detail || `Failed to re-analyze ${filename}`);
    } finally {
      setReanalyzingDocId(null);
    }
  };

  const handleReanalyzeAll = async () => {
    if (!window.confirm('Re-analyze all documents with current rules configuration? This may take several minutes.')) return;
    setReanalyzingAll(true); setError(null);
    try {
      const res = await reanalyzeAllAdminDocuments();
      showNotification(res.message || 'Queued all documents for background re-analysis.');
      setTimeout(() => loadDocuments(), 2500);
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to queue batch re-analysis');
    } finally {
      setReanalyzingAll(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await updateUserRole(userId, newRole);
      showNotification(`Updated user role to ${newRole}.`);
      loadUsers();
    } catch (e) { setError(e.response?.data?.detail || 'Failed to update role'); }
  };

  const handleToggleActive = async (userId) => {
    try {
      await toggleUserActive(userId);
      showNotification('Updated user status.');
      loadUsers();
    } catch (e) { setError(e.response?.data?.detail || 'Failed to toggle user status'); }
  };

  const riskColor = (level) => {
    if (level === 'High') return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
    if (level === 'Medium') return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
  };

  const filteredDocs = documents.filter(d =>
    d.original_filename?.toLowerCase().includes(docSearch.toLowerCase()) ||
    d.user_email?.toLowerCase().includes(docSearch.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Admin Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-rose-400 to-violet-400">
            Admin Control Panel
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Dynamic risk rule configuration, AI threshold tuning, and document portfolio management
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-tr from-amber-600/20 to-rose-600/20 rounded-xl border border-amber-500/20">
            <Settings className="w-6 h-6 text-amber-400 animate-spin-slow" />
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap items-center gap-1.5 bg-slate-900/90 p-1.5 rounded-xl border border-slate-800 w-fit">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
              activeTab === tab.id
                ? 'bg-gradient-to-r from-amber-600 to-rose-600 text-white shadow-md shadow-amber-900/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </div>

      {/* Feedback Banners */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-sm animate-fade-in">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-rose-400 hover:text-rose-200"><X className="w-4 h-4" /></button>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-sm animate-fade-in">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="ml-auto text-emerald-400 hover:text-emerald-200"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Loading Indicator */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
        </div>
      )}

      {/* ====== TAB 1: ANALYTICS ====== */}
      {activeTab === 'stats' && stats && !loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Users', value: stats.total_users, icon: Users, color: 'sky' },
              { label: 'Documents Ingested', value: stats.total_documents, icon: FileText, color: 'indigo' },
              { label: 'Completed Analyses', value: stats.completed_analyses, icon: CheckCircle2, color: 'emerald' },
              { label: 'Avg Time / Doc', value: stats.avg_processing_time_seconds ? `${stats.avg_processing_time_seconds}s` : 'N/A', icon: Clock, color: 'amber' },
            ].map((kpi, i) => (
              <div key={i} className="relative overflow-hidden p-5 rounded-2xl border border-slate-800 bg-slate-900/60 shadow-lg">
                <div className="absolute top-3 right-3 p-2 bg-slate-800/80 rounded-lg">
                  <kpi.icon className="w-5 h-5 text-amber-400" />
                </div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{kpi.label}</p>
                <p className="text-3xl font-extrabold text-slate-100 mt-2">{kpi.value}</p>
              </div>
            ))}
          </div>

          <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/60 shadow-lg">
            <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-400" /> Contract Risk Distribution
            </h3>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'High Risk', count: stats.high_risk_documents, pct: stats.completed_analyses ? Math.round((stats.high_risk_documents / stats.completed_analyses) * 100) : 0, color: 'rose' },
                { label: 'Medium Risk', count: stats.medium_risk_documents, pct: stats.completed_analyses ? Math.round((stats.medium_risk_documents / stats.completed_analyses) * 100) : 0, color: 'amber' },
                { label: 'Low Risk', count: stats.low_risk_documents, pct: stats.completed_analyses ? Math.round((stats.low_risk_documents / stats.completed_analyses) * 100) : 0, color: 'emerald' },
              ].map((item, i) => (
                <div key={i} className="text-center">
                  <div className={`mx-auto w-16 h-16 rounded-full border-4 border-${item.color}-500/40 flex items-center justify-center mb-2`}>
                    <span className={`text-lg font-bold text-${item.color}-400`}>{item.pct}%</span>
                  </div>
                  <p className="text-xs text-slate-400 font-medium">{item.label}</p>
                  <p className={`text-sm font-bold text-${item.color}-300`}>{item.count} docs</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-1 h-3 rounded-full overflow-hidden bg-slate-800">
              {stats.completed_analyses > 0 && (
                <>
                  <div className="bg-rose-500 transition-all" style={{ width: `${(stats.high_risk_documents / stats.completed_analyses) * 100}%` }} />
                  <div className="bg-amber-500 transition-all" style={{ width: `${(stats.medium_risk_documents / stats.completed_analyses) * 100}%` }} />
                  <div className="bg-emerald-500 transition-all" style={{ width: `${(stats.low_risk_documents / stats.completed_analyses) * 100}%` }} />
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ====== TAB 2: RISK RULES & DYNAMIC THRESHOLDS ====== */}
      {activeTab === 'rules' && !loading && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-200">
                Risk Classification Rules ({rules.length})
              </h3>
              <p className="text-xs text-slate-400">
                Configure rule category weights, custom trigger keywords, and minimum confidence thresholds
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowTester(!showTester)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold border transition ${
                  showTester
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                {showTester ? 'Hide Rule Simulator' : 'Test Rule Matching'}
              </button>
              <button
                onClick={() => setShowNewRuleForm(!showNewRuleForm)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg text-xs font-semibold hover:from-emerald-500 hover:to-teal-500 transition shadow-lg shadow-emerald-900/30"
              >
                <Plus className="w-4 h-4" /> Add Custom Rule
              </button>
            </div>
          </div>

          {/* Rule Match Simulator Drawer */}
          {showTester && (
            <div className="p-5 rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/5 via-slate-900 to-slate-900 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                  <h4 className="text-sm font-bold text-amber-300">Live Rule Matching Simulator</h4>
                </div>
                <span className="text-[11px] text-slate-400">Evaluates active regex patterns & custom keywords</span>
              </div>
              <div className="space-y-3">
                <textarea
                  value={testText}
                  onChange={e => setTestText(e.target.value)}
                  placeholder="Paste any contract clause or paragraph here to test which risk categories trigger (e.g., 'Your employment may be terminated by either party with 30 days notice...')..."
                  className="w-full h-24 px-3.5 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-amber-500 placeholder-slate-500"
                />
                <div className="flex items-center justify-between gap-4">
                  <input
                    type="text"
                    value={testKeywords}
                    onChange={e => setTestKeywords(e.target.value)}
                    placeholder="Optional test keywords (comma-separated)..."
                    className="flex-1 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-amber-500 placeholder-slate-500"
                  />
                  <button
                    onClick={handleTestRuleMatch}
                    disabled={testingMatch || !testText.trim()}
                    className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-amber-600 to-rose-600 text-white rounded-lg text-xs font-bold hover:from-amber-500 hover:to-rose-500 disabled:opacity-50 transition shadow-md shadow-amber-900/30"
                  >
                    {testingMatch ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                    Simulate Match
                  </button>
                </div>
              </div>

              {testResults && (
                <div className="mt-4 pt-4 border-t border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300">
                      Simulation Results ({testResults.length} Matched Categories)
                    </span>
                  </div>
                  {testResults.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No active risk rules matched this text excerpt.</p>
                  ) : (
                    <div className="grid gap-2.5">
                      {testResults.map((m, idx) => (
                        <div key={idx} className="p-3 rounded-xl border border-slate-800 bg-slate-800/50 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-bold text-slate-100">{m.category}</span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${riskColor(m.risk_level)}`}>
                                {m.risk_level}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-700/80 text-slate-300 font-mono">
                                Evidence: {m.evidence_type}
                              </span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                                m.passed_threshold ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              }`}>
                                Conf: {m.confidence_score} (Req: {m.confidence_threshold}) {m.passed_threshold ? '✓ PASS' : '✗ FILTERED'}
                              </span>
                            </div>
                            <p className="text-slate-400 italic line-clamp-1">"{m.snippet}"</p>
                          </div>
                          <div className="text-right flex-shrink-0 text-slate-400 font-mono text-[11px]">
                            Weight: {m.weight}x
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* New Rule Form */}
          {showNewRuleForm && (
            <div className="p-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 space-y-4 shadow-xl">
              <h4 className="text-sm font-semibold text-emerald-300 flex items-center gap-2">
                <Plus className="w-4 h-4" /> Create Custom Risk Category
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Category Name *</label>
                  <input
                    type="text" value={newRule.category}
                    onChange={e => setNewRule({ ...newRule, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                    placeholder="e.g. Unilateral Termination, Data Privacy"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Default Risk Level</label>
                  <select
                    value={newRule.default_risk_level}
                    onChange={e => setNewRule({ ...newRule, default_risk_level: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="High">High (Multiplier 3.0x)</option>
                    <option value="Medium">Medium (Multiplier 2.0x)</option>
                    <option value="Low">Low (Multiplier 1.0x)</option>
                  </select>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-slate-400">Confidence Threshold</label>
                    <span className="text-xs font-mono font-bold text-amber-400">{newRule.confidence_threshold}</span>
                  </div>
                  <input
                    type="range" min="0.50" max="0.95" step="0.01" value={newRule.confidence_threshold}
                    onChange={e => setNewRule({ ...newRule, confidence_threshold: parseFloat(e.target.value) })}
                    className="w-full accent-amber-500"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>0.50 (Permissive)</span>
                    <span>0.75 (Balanced)</span>
                    <span>0.95 (Strict)</span>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-slate-400">Rule Weight</label>
                    <span className="text-xs font-mono font-bold text-sky-400">{newRule.weight}x</span>
                  </div>
                  <input
                    type="range" min="0.5" max="3.0" step="0.1" value={newRule.weight}
                    onChange={e => setNewRule({ ...newRule, weight: parseFloat(e.target.value) })}
                    className="w-full accent-sky-500"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>0.5x (Minor)</span>
                    <span>1.5x (Standard)</span>
                    <span>3.0x (Critical)</span>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Custom Trigger Keywords / Multi-Word Phrases (comma-separated)</label>
                <input
                  type="text" value={newRule.keywords}
                  onChange={e => setNewRule({ ...newRule, keywords: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 placeholder-slate-500"
                  placeholder="e.g. 30 days notice, in lieu thereof, terminate employment, without cause"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Legal Description & Rationale</label>
                <textarea
                  value={newRule.description}
                  onChange={e => setNewRule({ ...newRule, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                  rows={2} placeholder="Explain what legal risks this rule safeguards against..."
                />
              </div>
              <div className="flex items-center gap-3">
                <button onClick={handleCreateRule} className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-500 transition shadow-lg shadow-emerald-900/40">
                  <Save className="w-4 h-4" /> Save & Activate Rule
                </button>
                <button onClick={() => setShowNewRuleForm(false)} className="text-xs text-slate-400 hover:text-slate-200 transition">Cancel</button>
              </div>
            </div>
          )}

          {/* Rules Table */}
          <div className="rounded-2xl border border-slate-800 overflow-hidden bg-slate-900/60 shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-900 border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    <th className="px-4 py-3.5">Category</th>
                    <th className="px-4 py-3.5">Risk Level</th>
                    <th className="px-4 py-3.5">Confidence Req</th>
                    <th className="px-4 py-3.5">Weight Multiplier</th>
                    <th className="px-4 py-3.5">Trigger Keywords</th>
                    <th className="px-4 py-3.5">Active</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {rules.map(rule => (
                    <tr key={rule.id} className="hover:bg-slate-800/30 transition">
                      <td className="px-4 py-3.5">
                        {editingRule === rule.id ? (
                          <input
                            type="text" defaultValue={rule.category} id={`cat-${rule.id}`}
                            className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs text-slate-200 w-full"
                          />
                        ) : (
                          <div>
                            <span className="font-semibold text-slate-200">{rule.category}</span>
                            {rule.description && (
                              <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">{rule.description}</p>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {editingRule === rule.id ? (
                          <select defaultValue={rule.default_risk_level} id={`rl-${rule.id}`}
                            className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs text-slate-200">
                            <option value="High">High</option>
                            <option value="Medium">Medium</option>
                            <option value="Low">Low</option>
                          </select>
                        ) : (
                          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${riskColor(rule.default_risk_level)}`}>
                            {rule.default_risk_level}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-mono">
                        {editingRule === rule.id ? (
                          <input type="number" step="0.01" min="0.5" max="0.95" defaultValue={rule.confidence_threshold} id={`ct-${rule.id}`}
                            className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs text-slate-200 w-20" />
                        ) : (
                          <span className="text-amber-400 font-semibold">{rule.confidence_threshold}</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-mono">
                        {editingRule === rule.id ? (
                          <input type="number" step="0.1" min="0.5" max="3.0" defaultValue={rule.weight} id={`wt-${rule.id}`}
                            className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs text-slate-200 w-20" />
                        ) : (
                          <span className="text-sky-400 font-semibold">{rule.weight}x</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 max-w-xs">
                        {editingRule === rule.id ? (
                          <input type="text" defaultValue={rule.keywords || ''} id={`kw-${rule.id}`}
                            placeholder="comma-separated phrases..."
                            className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs text-slate-200 w-full placeholder-slate-500" />
                        ) : (
                          <span className="text-slate-400 text-[11px] font-mono line-clamp-1">
                            {rule.keywords || <span className="text-slate-600 italic">Built-in NLP definitions</span>}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <button
                          onClick={() => handleSaveRule(rule.id, { is_active: !rule.is_active })}
                          className="transition"
                          title={rule.is_active ? 'Click to deactivate' : 'Click to activate'}
                        >
                          {rule.is_active ? (
                            <ToggleRight className="w-6 h-6 text-emerald-400" />
                          ) : (
                            <ToggleLeft className="w-6 h-6 text-slate-600" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {editingRule === rule.id ? (
                            <>
                              <button
                                onClick={() => {
                                  const updates = {
                                    category: document.getElementById(`cat-${rule.id}`).value,
                                    default_risk_level: document.getElementById(`rl-${rule.id}`).value,
                                    confidence_threshold: parseFloat(document.getElementById(`ct-${rule.id}`).value),
                                    weight: parseFloat(document.getElementById(`wt-${rule.id}`).value),
                                    keywords: document.getElementById(`kw-${rule.id}`).value,
                                  };
                                  handleSaveRule(rule.id, updates);
                                }}
                                className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition" title="Save"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button onClick={() => setEditingRule(null)} className="p-1.5 text-slate-400 hover:bg-slate-800 rounded-lg transition" title="Cancel">
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => setEditingRule(rule.id)} className="p-1.5 text-sky-400 hover:bg-sky-500/10 rounded-lg transition" title="Edit">
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDeleteRule(rule.id)} className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded-lg transition" title="Delete">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ====== TAB 3: DOCUMENTS & RE-ANALYSIS ====== */}
      {activeTab === 'docs' && !loading && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-200">
                Document Portfolio & Re-Analysis ({filteredDocs.length})
              </h3>
              <p className="text-xs text-slate-400">
                Inspect processed contracts and re-run AI risk extraction with current dynamic weights and rules
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={docSearch}
                  onChange={e => setDocSearch(e.target.value)}
                  placeholder="Filter documents or users..."
                  className="pl-9 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-amber-500 placeholder-slate-500 w-56"
                />
              </div>
              <button
                onClick={handleReanalyzeAll}
                disabled={reanalyzingAll}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-600 to-rose-600 text-white rounded-lg text-xs font-semibold hover:from-amber-500 hover:to-rose-500 disabled:opacity-50 transition shadow-md shadow-amber-900/30"
              >
                {reanalyzingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Re-analyze All Documents
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 overflow-hidden bg-slate-900/60 shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-900 border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    <th className="px-4 py-3.5">Document</th>
                    <th className="px-4 py-3.5">Owner</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5">Overall Risk</th>
                    <th className="px-4 py-3.5">Composite Score</th>
                    <th className="px-4 py-3.5">Risks Found</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {filteredDocs.map(doc => {
                    const isReanalyzing = reanalyzingDocId === doc.id;
                    return (
                      <tr key={doc.id} className="hover:bg-slate-800/30 transition">
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <FileText className="w-4 h-4 text-amber-400 flex-shrink-0" />
                            <div>
                              <span className="font-semibold text-slate-200 line-clamp-1">{doc.original_filename}</span>
                              <span className="text-[10px] text-slate-500 font-mono">ID: {doc.id.substring(0, 8)}...</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-slate-400 font-mono">
                          {doc.user_email}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            doc.status === 'completed' ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30' :
                            doc.status === 'processing' ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30' :
                            doc.status === 'failed' ? 'bg-rose-500/10 text-rose-300 border border-rose-500/30' :
                            'bg-slate-800 text-slate-400'
                          }`}>
                            {doc.status === 'processing' && <Loader2 className="w-3 h-3 animate-spin" />}
                            {doc.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          {doc.overall_risk ? (
                            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${riskColor(doc.overall_risk)}`}>
                              {doc.overall_risk}
                            </span>
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 font-mono font-bold text-slate-200">
                          {doc.composite_risk_score !== null && doc.composite_risk_score !== undefined
                            ? doc.composite_risk_score
                            : '-'}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-slate-300">
                          {doc.total_risks_found} risks
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button
                            onClick={() => handleReanalyzeDocument(doc.id, doc.original_filename)}
                            disabled={isReanalyzing || doc.status === 'processing'}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition disabled:opacity-50"
                            title="Re-analyze document with current rules"
                          >
                            {isReanalyzing ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                            ) : (
                              <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                            )}
                            Re-analyze
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredDocs.length === 0 && (
                <div className="text-center py-12 text-slate-500 text-sm">
                  No documents found.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ====== TAB 4: USERS & ROLES ====== */}
      {activeTab === 'users' && !loading && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-200">Registered Users ({users.length})</h3>
          <div className="grid gap-3">
            {users.map(usr => (
              <div key={usr.id} className="flex items-center justify-between p-4 rounded-2xl border border-slate-800 bg-slate-900/60 hover:border-slate-700 transition">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shadow-md ${
                    usr.role === 'admin'
                      ? 'bg-gradient-to-tr from-amber-500 to-rose-500 text-white'
                      : 'bg-gradient-to-tr from-sky-500 to-indigo-500 text-white'
                  }`}>
                    {usr.role === 'admin' ? <Crown className="w-5 h-5" /> : <Users className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-200">{usr.full_name || usr.email}</p>
                    <p className="text-xs text-slate-400 font-mono">{usr.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <p className="text-xs text-slate-400">Documents</p>
                    <p className="text-sm font-bold text-sky-300">{usr.document_count}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-400">Role</p>
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                      usr.role === 'admin' ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' : 'text-sky-400 bg-sky-500/10 border-sky-500/30'
                    }`}>{usr.role}</span>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-400">Status</p>
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                      usr.is_active ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' : 'text-rose-400 bg-rose-500/10 border-rose-500/30'
                    }`}>{usr.is_active ? 'Active' : 'Inactive'}</span>
                  </div>
                  <div className="flex items-center gap-2 pl-4 border-l border-slate-800">
                    <button
                      onClick={() => handleRoleChange(usr.id, usr.role === 'admin' ? 'user' : 'admin')}
                      className="p-1.5 text-amber-400 hover:bg-amber-500/10 rounded-lg transition"
                      title={usr.role === 'admin' ? 'Demote to user' : 'Promote to admin'}
                    >
                      <UserCog className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleToggleActive(usr.id)}
                      className={`p-1.5 rounded-lg transition ${usr.is_active ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-rose-400 hover:bg-rose-500/10'}`}
                      title={usr.is_active ? 'Deactivate' : 'Activate'}
                    >
                      {usr.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
