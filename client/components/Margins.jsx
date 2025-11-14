'use client';

import { useState, useEffect } from 'react';

export default function Margins() {
  const [margins, setMargins] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchMargins();
    
    // Auto-refresh every 30 seconds for live market updates
    const refreshInterval = setInterval(() => {
      console.log('🔄 Auto-refreshing margins (live update)...');
      fetchMargins();
    }, 30000);
    
    return () => clearInterval(refreshInterval);
  }, []);

  const fetchMargins = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('http://localhost:3001/api/account/margins');
      const data = await response.json();
      
      if (data.needsAuth || !response.ok || response.status === 401) {
        setError(data.message || 'Authorization required. Please authorize above.');
        setMargins(null);
        return;
      }
      
      if (data.success && data.data?.content) {
        const content = data.data.content;
        
        // Check if MCP returned an error
        if (data.data.isError) {
          const errorText = content[0]?.text || 'Unknown error';
          console.error('MCP error:', errorText);
          
          if (errorText.includes('Failed to execute') || errorText.includes('auth')) {
            setError('Authorization required. Please authorize above.');
            window.dispatchEvent(new Event('auth-error'));
          } else {
            setError(errorText);
          }
          setMargins(null);
          return;
        }
        
        // Parse the response - MCP returns JSON string in content[0].text
        console.log('Parsing margins content:', content);
        
        if (Array.isArray(content) && content.length > 0) {
          const firstItem = content[0];
          
          // Check if it's a text type with stringified JSON
          if (firstItem.type === 'text' && firstItem.text) {
            const text = firstItem.text;
            console.log('Raw margins text:', text.substring(0, 200) + '...');
            
            try {
              // Parse the JSON string
              const parsed = JSON.parse(text);
              console.log('Parsed margins:', parsed);
              setMargins(parsed);
              console.log('✅ Margins set');
            } catch (parseError) {
              console.error('JSON parse error:', parseError);
              
              // Check if it's an auth error message
              if (text.includes('log in') || text.includes('Authorization') || text.includes('Failed to execute')) {
                setError('Please authorize above.');
                window.dispatchEvent(new Event('auth-error'));
              } else {
                setError('Failed to parse margins data: ' + parseError.message);
              }
            }
          } else if (typeof firstItem === 'object') {
            // Direct object
            setMargins(firstItem);
          } else {
            console.error('Unexpected content format:', firstItem);
            setError('Unexpected data format');
          }
        } else if (typeof content === 'string') {
          // Content is directly a string
          try {
            const parsed = JSON.parse(content);
            setMargins(parsed);
          } catch {
            setError('Invalid JSON string');
          }
        } else if (typeof content === 'object') {
          // Direct object
          setMargins(content);
        } else {
          console.log('No margins data in response');
          setMargins(null);
        }
      } else {
        console.log('No content in response');
        setMargins(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="w-14 h-14 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-blue-600 font-normal text-base" style={{fontFamily: 'Poppins, sans-serif'}}>
            Loading margins...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-normal text-red-800 mb-2" style={{fontFamily: 'Poppins, sans-serif'}}>
              Unable to Load Margins
            </h3>
            <p className="text-red-700 font-light mb-4">{error}</p>
            <button
              onClick={fetchMargins}
              className="px-5 py-2 border-2 border-red-500 bg-white text-red-600 rounded-lg hover:bg-red-50 transition-all font-normal cursor-pointer"
              style={{fontFamily: 'Poppins, sans-serif'}}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!margins || !margins.equity) {
    return (
      <div className="text-center py-20">
        <div className="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6 border-2 border-blue-200">
          <svg className="w-12 h-12 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
        </div>
        <h3 className="text-xl font-normal text-gray-700 mb-2" style={{fontFamily: 'Poppins, sans-serif'}}>
          No Margin Data
        </h3>
        <p className="text-gray-500 font-light">Unable to fetch information</p>
      </div>
    );
  }

  const equity = margins.equity;
  const available = equity.available || {};
  const utilised = equity.utilised || {};

  return (
    <div className="space-y-4">
      {/* Hero Balance Card - No Border */}
      <div className="bg-white p-4">
        <div className="flex items-center gap-4 mb-3">
          <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-gray-600 text-xs font-light uppercase mb-1">Available Balance</p>
            <p className="text-2xl font-normal text-blue-600" style={{fontFamily: 'Poppins, sans-serif'}}>
              ₹{(available.live_balance || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="flex gap-2">
            <div className="px-3 py-2 border-b-2 border-blue-500">
              <p className="text-gray-600 text-xs font-light uppercase">Status</p>
              <p className="text-gray-800 font-normal text-sm" style={{fontFamily: 'Poppins, sans-serif'}}>
                Active
              </p>
            </div>
            <div className="px-3 py-2 border-b-2 border-blue-500">
              <p className="text-gray-600 text-xs font-light uppercase">Type</p>
              <p className="text-gray-800 font-normal text-sm" style={{fontFamily: 'Poppins, sans-serif'}}>
                Equity
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Detail Cards - Border Bottom for Tabs */}
      <div className="grid grid-cols-2 gap-4">
        {/* Available Funds */}
        <div className="bg-white">
          <div className="p-3 border-b-2 border-blue-500">
            <h4 className="text-base font-normal text-blue-600 flex items-center gap-2" style={{fontFamily: 'Poppins, sans-serif'}}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Available Funds
            </h4>
          </div>
          <div className="p-4 space-y-2">
            {[
              { label: 'Cash', value: available.cash || 0 },
              { label: 'Opening Balance', value: available.opening_balance || 0 },
              { label: 'Live Balance', value: available.live_balance || 0 },
              { label: 'Collateral', value: available.collateral || 0 },
            ].map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 border-b border-gray-100">
                <span className="font-normal text-gray-700 text-sm">
                  {item.label}
                </span>
                <span className="font-normal text-blue-600 text-sm" style={{fontFamily: 'Poppins, sans-serif'}}>
                  ₹{item.value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Utilised Funds */}
        <div className="bg-white">
          <div className="p-3 border-b-2 border-blue-500">
            <h4 className="text-base font-normal text-blue-600 flex items-center gap-2" style={{fontFamily: 'Poppins, sans-serif'}}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Utilised Funds
            </h4>
          </div>
          <div className="p-4 space-y-2">
            {[
              { label: 'Debits', value: utilised.debits || 0 },
              { label: 'Exposure', value: utilised.exposure || 0 },
              { label: 'M2M Realised', value: utilised.m2m_realised || 0, colored: true },
              { label: 'M2M Unrealised', value: utilised.m2m_unrealised || 0, colored: true },
            ].map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 border-b border-gray-100">
                <span className="font-normal text-gray-700 text-sm">
                  {item.label}
                </span>
                <span className={`font-normal text-sm ${
                  item.colored 
                    ? (item.value >= 0 ? 'text-green-600' : 'text-red-600')
                    : 'text-blue-600'
                }`} style={{fontFamily: 'Poppins, sans-serif'}}>
                  {item.colored && item.value >= 0 ? '+₹' : item.colored && item.value < 0 ? '-₹' : '₹'}{Math.abs(item.value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={fetchMargins}
          className="px-5 py-2 border-2 border-blue-500 bg-white text-blue-600 rounded-lg hover:bg-blue-50 transition-all font-normal cursor-pointer"
          style={{fontFamily: 'Poppins, sans-serif'}}
        >
          🔄 Refresh
        </button>
      </div>
    </div>
  );
}
