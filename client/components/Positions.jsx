'use client';

import { useState, useEffect } from 'react';

export default function Positions({ onOpenChart, showValues = false, onToggleValues }) {
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  useEffect(() => {
    fetchPositions();
    
    // Auto-refresh every 30 seconds for live market updates
    const refreshInterval = setInterval(() => {
      console.log('🔄 Auto-refreshing positions (live update)...');
      fetchPositions();
    }, 30000);
    
    return () => clearInterval(refreshInterval);
  }, []);

  const fetchPositions = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('http://localhost:3001/api/portfolio/positions');
      const data = await response.json();
      
      if (data.needsAuth || !response.ok || response.status === 401) {
        setError(data.message || 'Authorization required. Please authorize above.');
        setPositions([]);
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
          setPositions([]);
          return;
        }
        
        // Parse the response - MCP returns JSON string in content[0].text
        console.log('Parsing positions content:', content);
        
        if (Array.isArray(content) && content.length > 0) {
          const firstItem = content[0];
          
          // Check if it's a text type with stringified JSON
          if (firstItem.type === 'text' && firstItem.text) {
            const text = firstItem.text;
            console.log('Raw positions text:', text.substring(0, 200) + '...');
            
            try {
              // Parse the JSON string
              const parsed = JSON.parse(text);
              console.log('Parsed positions:', parsed);
              
              if (Array.isArray(parsed)) {
                setPositions(parsed);
                console.log('✅ Positions set:', parsed.length, 'items');
              } else if (parsed.data && Array.isArray(parsed.data)) {
                setPositions(parsed.data);
                console.log('✅ Positions set from .data:', parsed.data.length, 'items');
              } else {
                console.error('Parsed data is not an array:', parsed);
                setError('Invalid data format - expected array');
              }
            } catch (parseError) {
              console.error('JSON parse error:', parseError);
              
              // Check if it's an auth error message
              if (text.includes('log in') || text.includes('Authorization') || text.includes('Failed to execute')) {
                setError('Please authorize above.');
                window.dispatchEvent(new Event('auth-error'));
              } else {
                setError('Failed to parse positions data: ' + parseError.message);
              }
            }
          } else if (Array.isArray(firstItem)) {
            // Direct array
            setPositions(content);
          } else {
            console.error('Unexpected content format:', firstItem);
            setError('Unexpected data format');
          }
        } else if (typeof content === 'string') {
          // Content is directly a string
          try {
            const parsed = JSON.parse(content);
            setPositions(Array.isArray(parsed) ? parsed : []);
          } catch {
            setError('Invalid JSON string');
          }
        } else {
          console.log('No positions data in response');
          setPositions([]);
        }
      } else {
        console.log('No content in response');
        setPositions([]);
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
            Loading positions...
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
              Unable to Load Positions
            </h3>
            <p className="text-red-700 font-light mb-4">{error}</p>
            <button
              onClick={fetchPositions}
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

  if (positions.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6 border-2 border-blue-200">
          <svg className="w-12 h-12 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-xl font-normal text-gray-700 mb-2" style={{fontFamily: 'Poppins, sans-serif'}}>
          No Open Positions
        </h3>
        <p className="text-gray-500 font-light">No active trades today</p>
      </div>
    );
  }

  // Filter positions based on search
  const filteredPositions = positions.filter(position =>
    position.tradingsymbol?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Sort positions
  const sortedPositions = [...filteredPositions].sort((a, b) => {
    if (!sortConfig.key) return 0;
    
    let aVal, bVal;
    if (sortConfig.key === 'symbol') {
      aVal = a.tradingsymbol || '';
      bVal = b.tradingsymbol || '';
    } else if (sortConfig.key === 'product') {
      aVal = a.product || '';
      bVal = b.product || '';
    } else if (sortConfig.key === 'quantity') {
      aVal = a.quantity || 0;
      bVal = b.quantity || 0;
    } else if (sortConfig.key === 'avgPrice') {
      aVal = a.average_price || 0;
      bVal = b.average_price || 0;
    } else if (sortConfig.key === 'ltp') {
      aVal = a.last_price || 0;
      bVal = b.last_price || 0;
    } else if (sortConfig.key === 'pnl') {
      aVal = a.pnl || 0;
      bVal = b.pnl || 0;
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

  const totalPnL = positions.reduce((sum, p) => sum + (p.pnl || 0), 0);

  return (
    <div className="space-y-4">
      {/* Summary Card - No Border */}
      <div className="bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-600 text-xs font-light uppercase mb-2">TODAY'S P&L</p>
            <p className={`text-2xl font-normal mb-1 ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`} style={{fontFamily: 'Poppins, sans-serif'}}>
              {showValues ? (totalPnL >= 0 ? '+₹' : '-₹') + Math.abs(totalPnL).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '***'}
            </p>
            <p className="text-gray-600 text-sm font-light">{positions.length} Active Position(s)</p>
          </div>
          <div className="px-4 py-2 border-b-2 border-blue-500">
            <p className="text-gray-600 text-xs font-light uppercase mb-1">STATUS</p>
            <p className={`text-base font-normal ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`} style={{fontFamily: 'Poppins, sans-serif'}}>
              {totalPnL >= 0 ? '✓ Profit' : '✗ Loss'}
            </p>
          </div>
        </div>
      </div>

      {/* Search Bar and Toggle */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search positions..."
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
          Showing {sortedPositions.length} of {positions.length} positions
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
                <th onClick={() => handleSort('product')} className="px-4 py-2 text-left text-xs font-normal uppercase text-white cursor-pointer hover:bg-blue-600">
                  <div className="flex items-center gap-1">
                    Product
                    {sortConfig.key === 'product' && (
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
                <th onClick={() => handleSort('pnl')} className="px-4 py-2 text-right text-xs font-normal uppercase text-white cursor-pointer hover:bg-blue-600">
                  <div className="flex items-center justify-end gap-1">
                    P&L
                    {sortConfig.key === 'pnl' && (
                      <span className="text-xs">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedPositions.map((position, index) => {
                const pnl = position.pnl || 0;
                const avgPrice = position.average_price || 0;
                const lastPrice = position.last_price || 0;
                const qty = position.quantity || 0;

                return (
                  <tr key={index} className="hover:bg-blue-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white font-normal text-sm">
                          {(position.tradingsymbol || 'N/A').charAt(0)}
                        </div>
                        <div>
                          <div className="font-normal text-gray-800 text-sm" style={{fontFamily: 'Poppins, sans-serif'}}>
                            {position.tradingsymbol || 'N/A'}
                          </div>
                          {position.exchange && (
                            <div className="text-xs text-gray-500 font-light">{position.exchange}</div>
                          )}
                        </div>
                        {onOpenChart && (
                          <button
                            onClick={() => onOpenChart({
                              instrument_token: position.instrument_token,
                              tradingsymbol: position.tradingsymbol,
                              name: position.tradingsymbol,
                              exchange: position.exchange || 'NSE'
                            })}
                            className="inline-flex items-center justify-center p-1 hover:bg-blue-50 rounded transition-colors cursor-pointer flex-shrink-0 ml-1"
                            title={`Click to view chart of ${position.tradingsymbol}`}
                          >
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="rgba(59, 130, 246, 0.8)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3,18 7,14 11,16 15,10 19,12 23,6" />
                              <polyline points="19,6 23,6 23,10" fill="rgba(59, 130, 246, 0.8)" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 bg-blue-100 text-blue-600 rounded-md text-xs font-normal">
                        {position.product || 'N/A'}
                      </span>
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
                    <td className="px-4 py-3 text-right">
                      <span className={`font-normal text-sm ${pnl >= 0 ? 'text-green-600' : 'text-red-600'}`} style={{fontFamily: 'Poppins, sans-serif'}}>
                        {showValues ? (pnl >= 0 ? '+₹' : '-₹') + Math.abs(pnl).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '***'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 border-t-2 border-gray-200">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <div>
            <p className="text-xs font-light text-gray-500 uppercase">Total</p>
            <p className="text-base font-normal text-gray-800" style={{fontFamily: 'Poppins, sans-serif'}}>
              {positions.length} Positions
            </p>
          </div>
        </div>
        <button
          onClick={fetchPositions}
          className="px-5 py-2 border-2 border-blue-500 bg-white text-blue-600 rounded-lg hover:bg-blue-50 transition-all font-normal cursor-pointer"
          style={{fontFamily: 'Poppins, sans-serif'}}
        >
          🔄 Refresh
        </button>
      </div>
    </div>
  );
}
