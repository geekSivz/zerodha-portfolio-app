'use client';

import { useState, useEffect, useRef } from 'react';
import Holdings from '@/components/Holdings';
import Positions from '@/components/Positions';
import Margins from '@/components/Margins';
import CandlestickChart from '@/components/CandlestickChart';
import AuthModal from '@/components/AuthModal';

export default function Home() {
  const [activeTab, setActiveTab] = useState('charts'); // Charts is now default
  const [serverStatus, setServerStatus] = useState(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [backendOffline, setBackendOffline] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isLoadingAfterAuth, setIsLoadingAfterAuth] = useState(false);
  const holdingsRef = useRef(null);
  
  // Chart navigation state
  const [chartStock, setChartStock] = useState(null);
  const [previousTab, setPreviousTab] = useState(null);
  
  // Value visibility toggle
  const [showValues, setShowValues] = useState(false);

  const checkServerHealth = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      console.log('Checking backend server at: http://localhost:3001/api/health');
      
      const res = await fetch('http://localhost:3001/api/health', {
        signal: controller.signal,
        cache: 'no-store'
      });
      
      clearTimeout(timeoutId);
      
      if (!res.ok) {
        throw new Error(`Backend returned ${res.status}`);
      }
      
      const data = await res.json();
      console.log('Backend health:', data);
      
      setServerStatus(data);
      setIsCheckingAuth(false);
      setBackendOffline(false);
      
      // Auto-show auth modal if not authorized (only on first load)
      if (data.mcpConnected && !data.authorized && refreshKey === 0) {
        console.log('Not authorized - showing auth modal');
        setTimeout(() => setShowAuthModal(true), 500);
      }
      
      return data;
    } catch (err) {
      console.error('Backend health check failed:', err.message);
      setIsCheckingAuth(false);
      setBackendOffline(true);
      setServerStatus({ status: 'error', mcpConnected: false, authorized: false });
      return null;
    }
  };

  // Handle modal close - check auth and refresh data
  const handleModalClose = () => {
    console.log('Modal closed - waiting for MCP to authorize...');
    setShowAuthModal(false);
    setIsLoadingAfterAuth(true);
    
    // MCP needs time to process, show loader
    // Page will reload automatically from AuthModal
  };

  useEffect(() => {
    checkServerHealth();
    const forceStopLoading = setTimeout(() => setIsCheckingAuth(false), 5000);
    const interval = setInterval(checkServerHealth, 15000);
    
    return () => {
      clearInterval(interval);
      clearTimeout(forceStopLoading);
    };
  }, []);

  // Trigger modal on auth errors from child components
  useEffect(() => {
    const handleAuthError = () => {
      console.log('Auth error detected - showing modal');
      setShowAuthModal(true);
    };
    
    window.addEventListener('auth-error', handleAuthError);
    return () => window.removeEventListener('auth-error', handleAuthError);
  }, []);

  // Navigate to chart for a specific stock
  const openChart = (stock) => {
    console.log('Opening chart for:', stock);
    setPreviousTab(activeTab);
    setChartStock(stock);
    setActiveTab('charts');
  };

  // Go back from chart
  const handleBackFromChart = () => {
    setChartStock(null);
    if (previousTab) {
      setActiveTab(previousTab);
      setPreviousTab(null);
    }
  };

  const tabs = [
    { id: 'charts', label: 'Charts', sublabel: chartStock?.tradingsymbol || 'Live Market' },
    { id: 'holdings', label: 'Holdings', sublabel: 'Your Stocks' },
    { id: 'positions', label: 'Positions', sublabel: 'Active Trades' },
    { id: 'margins', label: 'Margins', sublabel: 'Balance' },
  ];

  if (isCheckingAuth || isLoadingAfterAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="relative mb-6">
            <div className="w-16 h-16 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin mx-auto"></div>
          </div>
          <h2 className="text-2xl font-normal text-gray-800 mb-2" style={{fontFamily: 'Poppins, sans-serif'}}>
            {isLoadingAfterAuth ? 'Loading Your Portfolio...' : 'Starting Dashboard'}
          </h2>
          <p className="text-gray-500 text-base font-light">
            {isLoadingAfterAuth ? 'MCP is authorizing, please wait...' : 'Connecting to backend...'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Clean Header */}
      <header className="bg-white border-b-2 border-blue-500 shadow-sm sticky top-0 z-30" style={{paddingLeft: '5%', paddingRight: '5%'}}>
        <div className="mx-auto py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 bg-blue-500 rounded-xl flex items-center justify-center shadow-sm">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-3xl font-normal text-gray-800" style={{fontFamily: 'Poppins, sans-serif'}}>
                  Zerodha Portfolio
                </h1>
                <p className="text-sm font-light text-gray-500">
                  Portfolio Management Dashboard
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {backendOffline ? (
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-red-400 bg-red-50 text-red-600">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  <span className="font-normal text-sm">Backend Offline</span>
                </div>
              ) : serverStatus && (
                <>
                  <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 ${
                    serverStatus.mcpConnected 
                      ? 'border-green-400 bg-green-50 text-green-700' 
                      : 'border-red-400 bg-red-50 text-red-600'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${serverStatus.mcpConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                    <span className="font-normal text-sm" style={{fontFamily: 'Poppins, sans-serif'}}>{serverStatus.mcpConnected ? 'Live' : 'Offline'}</span>
                  </div>
                  {serverStatus.mcpConnected && (
                    <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 ${
                      serverStatus.authorized 
                        ? 'border-blue-400 bg-blue-50 text-blue-700' 
                        : 'border-orange-400 bg-orange-50 text-orange-700'
                    }`}>
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        {serverStatus.authorized ? (
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        ) : (
                          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                        )}
                      </svg>
                      <span className="font-normal text-sm" style={{fontFamily: 'Poppins, sans-serif'}}>{serverStatus.authorized ? 'Authorized' : 'Locked'}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto py-2" style={{paddingLeft: '5%', paddingRight: '5%'}}>
        <div className="bg-white rounded-lg border-2 border-gray-200 overflow-hidden">
          <div className="bg-white border-b-2 border-gray-200 px-4 py-2">
            <nav className="flex gap-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 px-4 py-2 font-normal transition-all cursor-pointer ${
                    activeTab === tab.id
                      ? 'border-b-2 border-blue-500 bg-white text-blue-600'
                      : 'border-b-2 border-transparent text-gray-500 hover:border-gray-300 hover:bg-white'
                  }`}
                  style={{fontFamily: 'Poppins, sans-serif'}}
                >
                  <div className="text-center">
                    <div className="text-sm">{tab.label}</div>
                    <div className={`text-xs font-light ${activeTab === tab.id ? 'text-blue-500' : 'text-gray-400'}`}>
                      {tab.sublabel}
                    </div>
                  </div>
                </button>
              ))}
            </nav>
          </div>

          <div className="p-2">
            {backendOffline || !serverStatus?.mcpConnected ? (
              <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-6 mb-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-normal text-red-800 mb-2" style={{fontFamily: 'Poppins, sans-serif'}}>
                      Backend Server Offline
                    </h3>
                    <p className="text-red-700 font-light mb-3">
                      The backend server on port 3001 is not responding. Please start it to continue.
                    </p>
                    <div className="space-y-2">
                      <div className="inline-block bg-red-100 text-red-700 px-4 py-2 rounded-lg font-normal text-sm">
                        <code>Run: START-MANUAL.bat</code>
                      </div>
                      <p className="text-red-600 text-sm font-light mt-2">
                        Make sure both Backend and Frontend terminals are running.
                      </p>
                    </div>
                    <button
                      onClick={checkServerHealth}
                      className="mt-4 px-5 py-2 border-2 border-red-500 bg-white text-red-600 rounded-lg hover:bg-red-50 transition-all font-normal cursor-pointer"
                    >
                      Retry Connection
                    </button>
                  </div>
                </div>
              </div>
            ) : serverStatus?.mcpConnected && !serverStatus?.authorized ? (
              <div className="bg-orange-50 border-l-4 border-orange-500 rounded-lg p-6 mb-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-normal text-orange-800 mb-2" style={{fontFamily: 'Poppins, sans-serif'}}>
                      Zerodha Authorization Required
                    </h3>
                    <p className="text-orange-700 font-light mb-4">
                      Click below to authorize MCP access to your Zerodha account.
                    </p>
                    <button
                      onClick={() => setShowAuthModal(true)}
                      className="px-5 py-2 border-2 border-orange-500 bg-white text-orange-600 rounded-lg hover:bg-orange-50 transition-all font-normal cursor-pointer"
                      style={{fontFamily: 'Poppins, sans-serif'}}
                    >
                      🔓 Authorize Zerodha MCP
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Pass refreshKey to force re-render */}
            {activeTab === 'charts' && (
              <CandlestickChart 
                key={`charts-${refreshKey}`}
                initialStock={chartStock} 
                onBack={chartStock ? handleBackFromChart : null}
              />
            )}
            {activeTab === 'holdings' && (
              <Holdings 
                key={`holdings-${refreshKey}`} 
                onOpenChart={openChart}
                showValues={showValues}
                onToggleValues={() => setShowValues(!showValues)}
              />
            )}
            {activeTab === 'positions' && (
              <Positions 
                key={`positions-${refreshKey}`} 
                onOpenChart={openChart}
                showValues={showValues}
                onToggleValues={() => setShowValues(!showValues)}
              />
            )}
            {activeTab === 'margins' && <Margins key={`margins-${refreshKey}`} />}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-8 border-t-2 border-blue-500 bg-white" style={{paddingLeft: '5%', paddingRight: '5%'}}>
        <div className="mx-auto py-6">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-3">
              <span className="font-light text-gray-600">Powered by</span>
              <span className="px-3 py-1 border border-gray-300 text-gray-700 rounded-md font-normal">
                Kite MCP
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-light text-gray-600">Data from</span>
              <span className="px-3 py-1 border border-gray-300 text-gray-700 rounded-md font-normal">
                Zerodha
              </span>
            </div>
          </div>
        </div>
      </footer>

      {/* Auth Modal */}
      <AuthModal isOpen={showAuthModal} onClose={handleModalClose} />
    </div>
  );
}
