import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import AuthModal from './components/AuthModal';
import UploadSection from './components/UploadSection';
import Dashboard from './components/Dashboard';
import ReportViewer from './components/ReportViewer';
import SystemHealth from './components/SystemHealth';
import AdminPanel from './components/AdminPanel';
import { fetchUserProfile, fetchDocuments, logoutUser, loginUser } from './services/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [user, setUser] = useState(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);

  // Initialize & check user auth status
  const loadUser = async () => {
    const token = localStorage.getItem('legalbot_access_token');
    if (!token) {
      // Auto-authenticate with admin credentials for seamless dev testing
      try {
        await loginUser('admin@legalbot.com', 'password123');
        const profile = await fetchUserProfile();
        setUser(profile);
        loadDocuments();
      } catch (err) {
        setUser(null);
      }
      return;
    }

    try {
      const profile = await fetchUserProfile();
      setUser(profile);
      loadDocuments();
    } catch (err) {
      console.error('Failed to load user profile:', err);
      setUser(null);
    }
  };

  const loadDocuments = async () => {
    setLoadingDocs(true);
    try {
      const docs = await fetchDocuments();
      setDocuments(docs || []);
    } catch (err) {
      console.error('Failed to fetch document library:', err);
      setDocuments([]);
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    loadUser();
  }, []);

  const handleAuthSuccess = (loginData) => {
    loadUser();
  };

  const handleLogout = () => {
    logoutUser();
    setUser(null);
    setDocuments([]);
  };

  const handleAnalysisComplete = (report) => {
    setSelectedReport(report);
    setActiveTab('report');
    loadDocuments();
  };

  const handleSelectDocReport = (report) => {
    setSelectedReport(report);
    setActiveTab('report');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-sky-500/30">
      
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          if (tab !== 'report') setSelectedReport(null);
        }}
        user={user}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onLogout={handleLogout}
      />

      {/* Main App Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        
        {activeTab === 'dashboard' && (
          <Dashboard
            documents={documents}
            loading={loadingDocs}
            onSelectDocReport={handleSelectDocReport}
            onNavigateUpload={() => setActiveTab('upload')}
            onRefresh={loadDocuments}
          />
        )}

        {activeTab === 'upload' && (
          <UploadSection
            onAnalysisComplete={handleAnalysisComplete}
            onOpenAuth={() => setIsAuthModalOpen(true)}
            isAuthenticated={!!user}
          />
        )}

        {activeTab === 'report' && (
          <ReportViewer
            report={selectedReport}
            onBack={() => setActiveTab('dashboard')}
          />
        )}

        {activeTab === 'admin' && user && user.role === 'admin' && (
          <AdminPanel />
        )}

        {activeTab === 'diagnostics' && (
          <SystemHealth
            isAuthenticated={!!user}
            onOpenAuth={() => setIsAuthModalOpen(true)}
          />
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-500 font-mono">
        <p>LegalBot AI • Enterprise Private Legal Intelligence Engine • HTTPS Secured (TLS 1.3)</p>
      </footer>

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
      />

    </div>
  );
}
