'use client';

import { useState, useEffect } from 'react';

export default function Holdings({ onOpenChart, showValues = false, onToggleValues }) {
  const [holdings, setHoldings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  useEffect(() => {
    fetchHoldings();
    
    // Auto-refresh every 30 seconds for live market updates
    const refreshInterval = setInterval(() => {
      console.log('🔄 Auto-refreshing holdings (live update)...');
      fetchHoldings();
    }, 30000);
    
    return () => clearInterval(refreshInterval);
  }, []);

  const fetchHoldings = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      console.log('Fetching holdings from: http://localhost:3001/api/portfolio/holdings');
      
      const response = await fetch('http://localhost:3001/api/portfolio/holdings', {
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(timeoutId);
      
      console.log('Holdings response status:', response.status);
      
      const data = await response.json();
      console.log('Holdings data:', data);

      if (data.needsAuth || data.error === 'Authorization required' || response.status === 401) {
        setError('Authorization required. Please click "Authorize Now" button above.');
        setHoldings([]);
        // Trigger auth modal
        window.dispatchEvent(new Event('auth-error'));
        return;
      }

      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch holdings');
      }
      
      if (data.success && data.data?.content) {
        const content = data.data.content;
        
        // Check if MCP returned an error
        if (data.data.isError) {
          const errorText = content[0]?.text || 'Unknown error';
          console.error('MCP error:', errorText);
          
          if (errorText.includes('Failed to execute') || errorText.includes('auth')) {
            setError('Authorization required. Please authorize via Cursor AI or click the button above.');
            window.dispatchEvent(new Event('auth-error'));
          } else {
            setError(errorText);
          }
          setHoldings([]);
          return;
        }
        
        // Parse the response - MCP returns JSON string in content[0].text
        console.log('Parsing holdings content:', content);
        
        if (Array.isArray(content) && content.length > 0) {
          const firstItem = content[0];
          
          // Check if it's a text type with stringified JSON
          if (firstItem.type === 'text' && firstItem.text) {
            const text = firstItem.text;
            console.log('Raw holdings text:', text.substring(0, 200) + '...');
            
            try {
              // Parse the JSON string
              const parsed = JSON.parse(text);
              console.log('Parsed holdings:', parsed);
              
              if (Array.isArray(parsed)) {
                setHoldings(parsed);
                console.log('✅ Holdings set:', parsed.length, 'items');
              } else if (parsed.data && Array.isArray(parsed.data)) {
                setHoldings(parsed.data);
                console.log('✅ Holdings set from .data:', parsed.data.length, 'items');
              } else {
                console.error('Parsed data is not an array:', parsed);
                setError('Invalid data format - expected array');
              }
            } catch (parseError) {
              console.error('JSON parse error:', parseError);
              
              // Check if it's an auth error message
              if (text.includes('log in') || text.includes('Authorization') || text.includes('Failed to execute')) {
                setError('Please authorize via Cursor AI or click the Authorize button above.');
                window.dispatchEvent(new Event('auth-error'));
              } else {
                setError('Failed to parse holdings data: ' + parseError.message);
              }
            }
          } else if (Array.isArray(firstItem)) {
            // Direct array
            setHoldings(content);
          } else {
            console.error('Unexpected content format:', firstItem);
            setError('Unexpected data format');
          }
        } else if (typeof content === 'string') {
          // Content is directly a string
          try {
            const parsed = JSON.parse(content);
            setHoldings(Array.isArray(parsed) ? parsed : []);
          } catch {
            setError('Invalid JSON string');
          }
        } else {
          console.log('No holdings data in response');
          setHoldings([]);
        }
      } else {
        console.log('No content in response');
        setHoldings([]);
      }
    } catch (err) {
      console.error('Holdings fetch error:', err);
      if (err.name === 'AbortError') {
        setError('Request timed out. Please check your connection and authorization.');
      } else if (err.message.includes('fetch')) {
        setError('Cannot connect to backend server. Make sure it is running on port 3001.');
      } else {
        setError(err.message);
      }
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
            Loading holdings...
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
              Unable to Load Holdings
            </h3>
            <p className="text-red-700 font-light mb-4">{error}</p>
            <button
              onClick={fetchHoldings}
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

  if (holdings.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6 border-2 border-blue-200">
          <svg className="w-12 h-12 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        </div>
        <h3 className="text-xl font-normal text-gray-700 mb-2" style={{fontFamily: 'Poppins, sans-serif'}}>
          No Holdings Found
        </h3>
        <p className="text-gray-500 font-light">Your portfolio is empty</p>
      </div>
    );
  }

  // Filter holdings based on search
  const filteredHoldings = holdings.filter(holding =>
    holding.tradingsymbol?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Sort holdings
  const sortedHoldings = [...filteredHoldings].sort((a, b) => {
    if (!sortConfig.key) return 0;
    
    let aVal, bVal;
    if (sortConfig.key === 'symbol') {
      aVal = a.tradingsymbol || '';
      bVal = b.tradingsymbol || '';
    } else if (sortConfig.key === 'quantity') {
      aVal = a.quantity || 0;
      bVal = b.quantity || 0;
    } else if (sortConfig.key === 'avgPrice') {
      aVal = a.average_price || 0;
      bVal = b.average_price || 0;
    } else if (sortConfig.key === 'ltp') {
      aVal = a.last_price || 0;
      bVal = b.last_price || 0;
    } else if (sortConfig.key === 'value') {
      aVal = (a.last_price || 0) * (a.quantity || 0);
      bVal = (b.last_price || 0) * (b.quantity || 0);
    } else if (sortConfig.key === 'pnl') {
      aVal = ((a.last_price || 0) - (a.average_price || 0)) * (a.quantity || 0);
      bVal = ((b.last_price || 0) - (b.average_price || 0)) * (b.quantity || 0);
    } else if (sortConfig.key === 'returns') {
      aVal = a.average_price > 0 ? (((a.last_price || 0) - (a.average_price || 0)) / (a.average_price || 0)) * 100 : 0;
      bVal = b.average_price > 0 ? (((b.last_price || 0) - (b.average_price || 0)) / (b.average_price || 0)) * 100 : 0;
    }
    
    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSort = (key) => {
    setSortConfig({
      key,
      direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc'
    });
  };

  const totalInvestment = holdings.reduce((sum, h) => sum + ((h.average_price || 0) * (h.quantity || 0)), 0);
  const currentValue = holdings.reduce((sum, h) => sum + ((h.last_price || 0) * (h.quantity || 0)), 0);
  const totalPnL = currentValue - totalInvestment;
  const totalPnLPercentage = totalInvestment > 0 ? (totalPnL / totalInvestment) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Summary Cards - No Borders */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white p-3">
          <div className="flex items-center gacd p-2 mb-1">
            <div className="w-4 h-4 text-blue-500 font-bold flex items-center justify-center" style={{fontFamily: 'Poppins, sans-serif', fontSize: '16px'}}>
              ₹
            </div>
            <p className="text-gray-600 text-xs font-light uppercase">Investment</p>
          </div>
          <p className="text-lg font-normal text-blue-600" style={{fontFamily: 'Poppins, sans-serif'}}>
            {showValues ? `₹${totalInvestment.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '***'}
          </p>
        </div>

        <div className="bg-white p-3">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <p className="text-gray-600 text-xs font-light uppercase">Current Value</p>
          </div>
          <p className="text-lg font-normal text-blue-600" style={{fontFamily: 'Poppins, sans-serif'}}>
            {showValues ? `₹${currentValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '***'}
          </p>
        </div>

        <div className="bg-white p-3">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={totalPnL >= 0 ? "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" : "M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"} />
            </svg>
            <p className="text-gray-600 text-xs font-light uppercase">Total P&L</p>
          </div>
          <p className={`text-lg font-normal ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`} style={{fontFamily: 'Poppins, sans-serif'}}>
            {showValues ? (totalPnL >= 0 ? '+₹' : '-₹') + Math.abs(totalPnL).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '***'}
          </p>
        </div>

        <div className="bg-white p-3">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="text-gray-600 text-xs font-light uppercase">Returns</p>
          </div>
          <p className={`text-lg font-normal ${totalPnLPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`} style={{fontFamily: 'Poppins, sans-serif'}}>
            {showValues ? (totalPnLPercentage >= 0 ? '+' : '') + totalPnLPercentage.toFixed(2) + '%' : '***'}
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search stocks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none text-sm"
              style={{fontFamily: 'Poppins, sans-serif'}}
            />
          </div>
        </div>
        
        {/* Toggle Values Visibility */}
        {onToggleValues && (
          <button
            onClick={onToggleValues}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors cursor-pointer"
            style={{fontFamily: 'Poppins, sans-serif'}}
            title={showValues ? 'Hide values' : 'Show values'}
          >
            <span className="text-lg">{showValues ? '👁️' : '👁️‍🗨️'}</span>
            <span className="text-sm font-medium">{showValues ? 'Hide Values' : 'Show Values'}</span>
          </button>
        )}
        
        <div className="text-sm text-gray-600">
          Showing {sortedHoldings.length} of {holdings.length} holdings
        </div>
      </div>

      {/* Table with Sorting */}
      <div className="bg-white rounded-lg border-2 border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-blue-500">
                <th onClick={() => handleSort('symbol')} className="px-4 py-2 text-left text-xs font-normal uppercase text-white cursor-pointer hover:bg-blue-600">
                  <div className="flex items-center gap-1">
                    Stock
                    {sortConfig.key === 'symbol' && (
                      <span className="text-xs">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th onClick={() => handleSort('quantity')} className="px-4 py-2 text-right text-xs font-normal uppercase text-white cursor-pointer hover:bg-blue-600">
                  <div className="flex items-center justify-end gap-1">
                    Qty
                    {sortConfig.key === 'quantity' && (
                      <span className="text-xs">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th onClick={() => handleSort('avgPrice')} className="px-4 py-2 text-right text-xs font-normal uppercase text-white cursor-pointer hover:bg-blue-600">
                  <div className="flex items-center justify-end gap-1">
                    Avg Price
                    {sortConfig.key === 'avgPrice' && (
                      <span className="text-xs">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th onClick={() => handleSort('ltp')} className="px-4 py-2 text-right text-xs font-normal uppercase text-white cursor-pointer hover:bg-blue-600">
                  <div className="flex items-center justify-end gap-1">
                    LTP
                    {sortConfig.key === 'ltp' && (
                      <span className="text-xs">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th onClick={() => handleSort('value')} className="px-4 py-2 text-right text-xs font-normal uppercase text-white cursor-pointer hover:bg-blue-600">
                  <div className="flex items-center justify-end gap-1">
                    Value
                    {sortConfig.key === 'value' && (
                      <span className="text-xs">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th onClick={() => handleSort('pnl')} className="px-4 py-2 text-right text-xs font-normal uppercase text-white cursor-pointer hover:bg-blue-600">
                  <div className="flex items-center justify-end gap-1">
                    P&L
                    {sortConfig.key === 'pnl' && (
                      <span className="text-xs">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
                <th onClick={() => handleSort('returns')} className="px-4 py-2 text-right text-xs font-normal uppercase text-white cursor-pointer hover:bg-blue-600">
                  <div className="flex items-center justify-end gap-1">
                    Returns
                    {sortConfig.key === 'returns' && (
                      <span className="text-xs">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedHoldings.map((holding, index) => {
                const avgPrice = holding.average_price || 0;
                const lastPrice = holding.last_price || 0;
                const qty = holding.quantity || 0;
                const pnl = (lastPrice - avgPrice) * qty;
                const pnlPercentage = avgPrice > 0 ? ((lastPrice - avgPrice) / avgPrice) * 100 : 0;

                return (
                  <tr key={index} className="hover:bg-blue-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white font-normal text-sm">
                          {(holding.tradingsymbol || 'N/A').charAt(0)}
                        </div>
                        <span className="font-normal text-gray-800 text-sm" style={{fontFamily: 'Poppins, sans-serif'}}>
                          {holding.tradingsymbol || 'N/A'}
                        </span>
                        {onOpenChart && (
                          <button
                            onClick={() => onOpenChart({
                              instrument_token: holding.instrument_token,
                              tradingsymbol: holding.tradingsymbol,
                              name: holding.tradingsymbol,
                              exchange: holding.exchange || 'NSE'
                            })}
                            className="inline-flex items-center justify-center p-1 hover:bg-blue-50 rounded transition-colors cursor-pointer ml-1"
                            title={`Click to view chart of ${holding.tradingsymbol}`}
                          >
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="rgba(59, 130, 246, 0.8)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3,18 7,14 11,16 15,10 19,12 23,6" />
                              <polyline points="19,6 23,6 23,10" fill="rgba(59, 130, 246, 0.8)" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-normal text-gray-700 text-sm">
                        {qty}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600 font-light text-sm">
                      {showValues ? `₹${avgPrice.toFixed(2)}` : '***'}
                    </td>
                    <td className="px-4 py-3 text-right text-blue-600 font-normal text-sm" style={{fontFamily: 'Poppins, sans-serif'}}>
                      {showValues ? `₹${lastPrice.toFixed(2)}` : '***'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-800 font-normal text-sm" style={{fontFamily: 'Poppins, sans-serif'}}>
                      {showValues ? `₹${(lastPrice * qty).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '***'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-normal text-sm ${pnl >= 0 ? 'text-green-600' : 'text-red-600'}`} style={{fontFamily: 'Poppins, sans-serif'}}>
                        {showValues ? (pnl >= 0 ? '+₹' : '-₹') + Math.abs(pnl).toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '***'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-normal text-sm ${pnlPercentage >= 0 ? 'text-green-600' : 'text-red-600'}`} style={{fontFamily: 'Poppins, sans-serif'}}>
                        {showValues ? (pnlPercentage >= 0 ? '+' : '') + pnlPercentage.toFixed(2) + '%' : '***'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t-2 border-gray-200">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <div>
            <p className="text-xs font-light text-gray-500 uppercase">Total</p>
            <p className="text-base font-normal text-gray-800" style={{fontFamily: 'Poppins, sans-serif'}}>
              {holdings.length} Holdings
            </p>
          </div>
        </div>
        <button
          onClick={fetchHoldings}
          className="px-5 py-2 border-2 border-blue-500 bg-white text-blue-600 rounded-lg hover:bg-blue-50 transition-all font-normal cursor-pointer"
          style={{fontFamily: 'Poppins, sans-serif'}}
        >
          🔄 Refresh
        </button>
      </div>
    </div>
  );
}
