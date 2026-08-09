import React, { useState, useEffect } from 'react';
import {
  Settings, Users, BarChart3, Shield, Plus, Pencil, Trash2, Save, X,
  ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Crown, UserCog,
  FileText, AlertTriangle, CheckCircle2, Clock, TrendingUp, Loader2
} from 'lucide-react';
import {
  fetchAdminRules, createAdminRule, updateAdminRule, deleteAdminRule,
  fetchAdminUsers, updateUserRole, toggleUserActive, fetchAdminStats
} from '../services/api';

const TABS = [
  { id: 'stats', label: 'Analytics', icon: BarChart3 },
  { id: 'rules', label: 'Risk Rules', icon: Shield },
  { id: 'users', label: 'Users', icon: Users },
];

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState('stats');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Stats
  const [stats, setStats] = useState(null);
  // Rules
  const [rules, setRules] = useState([]);
  const [editingRule, setEditingRule] = useState(null);
  const [showNewRuleForm, setShowNewRuleForm] = useState(false);
  const [newRule, setNewRule] = useState({
    category: '', default_risk_level: 'Medium', confidence_threshold: 0.75, weight: 1.0, description: '', is_active: true
  });
  // Users
  const [users, setUsers] = useState([]);

  useEffect(() => {
    if (activeTab === 'stats') loadStats();
    if (activeTab === 'rules') loadRules();
    if (activeTab === 'users') loadUsers();
  }, [activeTab]);

  const loadStats = async () => {
    setLoading(true); setError(null);
    try { setStats(await fetchAdminStats()); } catch (e) { setError(e.response?.data?.detail || 'Failed to load stats'); }
    finally { setLoading(false); }
  };

  const loadRules = async () => {
    setLoading(true); setError(null);
    try { setRules(await fetchAdminRules()); } catch (e) { setError(e.response?.data?.detail || 'Failed to load rules'); }
    finally { setLoading(false); }
  };

  const loadUsers = async () => {
    setLoading(true); setError(null);
    try { setUsers(await fetchAdminUsers()); } catch (e) { setError(e.response?.data?.detail || 'Failed to load users'); }
    finally { setLoading(false); }
  };

  const handleSaveRule = async (ruleId, updates) => {
    try {
      await updateAdminRule(ruleId, updates);
      setEditingRule(null);
      loadRules();
    } catch (e) { setError(e.response?.data?.detail || 'Failed to update rule'); }
  };

  const handleCreateRule = async () => {
    try {
      await createAdminRule(newRule);
      setShowNewRuleForm(false);
      setNewRule({ category: '', default_risk_level: 'Medium', confidence_threshold: 0.75, weight: 1.0, description: '', is_active: true });
      loadRules();
    } catch (e) { setError(e.response?.data?.detail || 'Failed to create rule'); }
  };

  const handleDeleteRule = async (ruleId) => {
    if (!window.confirm('Are you sure you want to delete this risk rule?')) return;
    try { await deleteAdminRule(ruleId); loadRules(); }
    catch (e) { setError(e.response?.data?.detail || 'Failed to delete rule'); }
  };

  const handleRoleChange = async (userId, newRole) => {
    try { await updateUserRole(userId, newRole); loadUsers(); }
    catch (e) { setError(e.response?.data?.detail || 'Failed to update role'); }
  };

  const handleToggleActive = async (userId) => {
    try { await toggleUserActive(userId); loadUsers(); }
    catch (e) { setError(e.response?.data?.detail || 'Failed to toggle user status'); }
  };

  const riskColor = (level) => {
    if (level === 'High') return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
    if (level === 'Medium') return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Admin Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-rose-400 to-violet-400">
            Admin Control Panel
          </h1>
          <p className="text-sm text-slate-400 mt-1">Manage risk rules, users, and monitor system analytics</p>
        </div>
        <div className="p-3 bg-gradient-to-tr from-amber-600/20 to-rose-600/20 rounded-xl border border-amber-500/20">
          <Settings className="w-6 h-6 text-amber-400 animate-spin-slow" />
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 bg-slate-900/90 p-1.5 rounded-xl border border-slate-800 w-fit">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
              activeTab === tab.id
                ? 'bg-gradient-to-r from-amber-600 to-rose-600 text-white shadow-md shadow-amber-900/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-sm">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-rose-400 hover:text-rose-200"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
        </div>
      )}

      {/* ====== ANALYTICS TAB ====== */}
      {activeTab === 'stats' && stats && !loading && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Users', value: stats.total_users, icon: Users, color: 'sky' },
              { label: 'Documents', value: stats.total_documents, icon: FileText, color: 'indigo' },
              { label: 'Analyses Done', value: stats.completed_analyses, icon: CheckCircle2, color: 'emerald' },
              { label: 'Avg Time', value: stats.avg_processing_time_seconds ? `${stats.avg_processing_time_seconds}s` : 'N/A', icon: Clock, color: 'amber' },
            ].map((kpi, i) => (
              <div key={i} className={`relative overflow-hidden p-5 rounded-2xl border border-${kpi.color}-500/20 bg-gradient-to-br from-${kpi.color}-500/5 to-transparent`}>
                <div className={`absolute top-3 right-3 p-2 bg-${kpi.color}-500/10 rounded-lg`}>
                  <kpi.icon className={`w-5 h-5 text-${kpi.color}-400`} />
                </div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{kpi.label}</p>
                <p className={`text-3xl font-extrabold text-${kpi.color}-300 mt-2`}>{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Risk Distribution */}
          <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/60">
            <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-400" /> Risk Distribution
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

          {/* Secondary Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 text-center">
              <p className="text-xs text-slate-400">Active Users</p>
              <p className="text-2xl font-bold text-sky-300 mt-1">{stats.active_users}</p>
            </div>
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 text-center">
              <p className="text-xs text-slate-400">Failed Analyses</p>
              <p className="text-2xl font-bold text-rose-300 mt-1">{stats.failed_analyses}</p>
            </div>
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 text-center">
              <p className="text-xs text-slate-400">Total Risk Clauses</p>
              <p className="text-2xl font-bold text-amber-300 mt-1">{stats.total_risk_clauses}</p>
            </div>
          </div>
        </div>
      )}

      {/* ====== RISK RULES TAB ====== */}
      {activeTab === 'rules' && !loading && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-200">Risk Classification Rules ({rules.length})</h3>
            <button
              onClick={() => setShowNewRuleForm(!showNewRuleForm)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg text-xs font-semibold hover:from-emerald-500 hover:to-teal-500 transition shadow-lg shadow-emerald-900/30"
            >
              <Plus className="w-4 h-4" /> Add Rule
            </button>
          </div>

          {/* New Rule Form */}
          {showNewRuleForm && (
            <div className="p-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 space-y-4">
              <h4 className="text-sm font-semibold text-emerald-300">Create New Risk Rule</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Category Name</label>
                  <input
                    type="text" value={newRule.category}
                    onChange={e => setNewRule({ ...newRule, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                    placeholder="e.g. Non-Disclosure Breach"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Risk Level</label>
                  <select
                    value={newRule.default_risk_level}
                    onChange={e => setNewRule({ ...newRule, default_risk_level: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Confidence Threshold</label>
                  <input
                    type="number" step="0.05" min="0" max="1" value={newRule.confidence_threshold}
                    onChange={e => setNewRule({ ...newRule, confidence_threshold: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Weight</label>
                  <input
                    type="number" step="0.1" min="0" max="5" value={newRule.weight}
                    onChange={e => setNewRule({ ...newRule, weight: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Description</label>
                <textarea
                  value={newRule.description}
                  onChange={e => setNewRule({ ...newRule, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                  rows={2} placeholder="Describe when this rule should trigger..."
                />
              </div>
              <div className="flex items-center gap-3">
                <button onClick={handleCreateRule} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-500 transition">
                  <Save className="w-4 h-4" /> Create Rule
                </button>
                <button onClick={() => setShowNewRuleForm(false)} className="text-xs text-slate-400 hover:text-slate-200 transition">Cancel</button>
              </div>
            </div>
          )}

          {/* Rules Table */}
          <div className="rounded-2xl border border-slate-800 overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-900/80 border-b border-slate-800">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Category</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Risk Level</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Confidence</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Weight</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {rules.map(rule => (
                  <tr key={rule.id} className="hover:bg-slate-800/30 transition">
                    <td className="px-4 py-3">
                      {editingRule === rule.id ? (
                        <input
                          type="text" defaultValue={rule.category} id={`cat-${rule.id}`}
                          className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-sm text-slate-200 w-full"
                        />
                      ) : (
                        <span className="text-sm font-medium text-slate-200">{rule.category}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingRule === rule.id ? (
                        <select defaultValue={rule.default_risk_level} id={`rl-${rule.id}`}
                          className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-sm text-slate-200">
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
                    <td className="px-4 py-3 text-sm text-slate-300 font-mono">
                      {editingRule === rule.id ? (
                        <input type="number" step="0.05" defaultValue={rule.confidence_threshold} id={`ct-${rule.id}`}
                          className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-sm text-slate-200 w-20" />
                      ) : (
                        rule.confidence_threshold
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300 font-mono">
                      {editingRule === rule.id ? (
                        <input type="number" step="0.1" defaultValue={rule.weight} id={`wt-${rule.id}`}
                          className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-sm text-slate-200 w-20" />
                      ) : (
                        rule.weight
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleSaveRule(rule.id, { is_active: !rule.is_active })}
                        className="transition"
                        title={rule.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {rule.is_active ? (
                          <ToggleRight className="w-6 h-6 text-emerald-400" />
                        ) : (
                          <ToggleLeft className="w-6 h-6 text-slate-500" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {editingRule === rule.id ? (
                          <>
                            <button
                              onClick={() => {
                                const updates = {
                                  category: document.getElementById(`cat-${rule.id}`).value,
                                  default_risk_level: document.getElementById(`rl-${rule.id}`).value,
                                  confidence_threshold: parseFloat(document.getElementById(`ct-${rule.id}`).value),
                                  weight: parseFloat(document.getElementById(`wt-${rule.id}`).value),
                                };
                                handleSaveRule(rule.id, updates);
                              }}
                              className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition" title="Save"
                            >
                              <Save className="w-4 h-4" />
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
            {rules.length === 0 && (
              <div className="text-center py-12 text-slate-500 text-sm">No risk rules configured.</div>
            )}
          </div>
        </div>
      )}

      {/* ====== USERS TAB ====== */}
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
            {users.length === 0 && (
              <div className="text-center py-12 text-slate-500 text-sm">No users found.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
