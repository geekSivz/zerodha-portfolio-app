'use client';

import { useState, useEffect, useRef } from 'react';

export default function CandlestickChart({ initialStock, onBack }) {
  const [chartData, setChartData] = useState([]);
  const [timeframe, setTimeframe] = useState('day');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeIndicators, setActiveIndicators] = useState(['sma20', 'ema20', 'rsi', 'macd']);
  const [visibleCandles, setVisibleCandles] = useState(100); // Number of candles to show
  const [panOffset, setPanOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, offset: 0 });
  const [chartType, setChartType] = useState('candlestick');
  const [showVolume, setShowVolume] = useState(true);
  const [showPriceChannel, setShowPriceChannel] = useState(true); // Toggle to show/hide channel
  const [crosshair, setCrosshair] = useState(null);
  const [hoveredCandle, setHoveredCandle] = useState(null);
  const [drawingMode, setDrawingMode] = useState(null);
  const [drawings, setDrawings] = useState([]);
  const dragAnimationRef = useRef(null);
  const canvasRef = useRef(null);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [dataRange, setDataRange] = useState({ days: 100 });
  const [lastCandleTime, setLastCandleTime] = useState(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreData, setHasMoreData] = useState(true);
  const [oldestDataDate, setOldestDataDate] = useState(null);

  // Stock selection states
  const [selectedStock, setSelectedStock] = useState(initialStock || null);
  const [stockSearch, setStockSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef(null);

  // Candle timer state
  const [candleTimer, setCandleTimer] = useState('');
  
  // Live price state - DECLARE EARLY
  const [livePrice, setLivePrice] = useState(null);
  const [priceChange, setPriceChange] = useState(null);

  // Set initial stock if passed as prop
  useEffect(() => {
    if (initialStock) {
      setSelectedStock(initialStock);
      setChartData([]);
    }
  }, [initialStock]);

  // Check authorization when component mounts or stock is selected
  useEffect(() => {
    if (!selectedStock) return;

    const checkAuth = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/health', { cache: 'no-store' });
        const data = await response.json();
        
        if (data.mcpConnected && !data.authorized) {
          console.log('⚠️ Not authorized for charts - triggering auth modal');
          window.dispatchEvent(new Event('auth-error'));
        }
      } catch (error) {
        console.error('Error checking auth for charts:', error);
      }
    };

    checkAuth();
  }, [selectedStock]);

  // Fetch live price for selected stock
  useEffect(() => {
    if (!selectedStock?.instrument_token) return;

    const fetchLivePrice = async () => {
      try {
        const response = await fetch(
          `http://localhost:3001/api/market/quote/${selectedStock.instrument_token}`,
          { cache: 'no-store' }
        );
        
        if (response.ok) {
          const result = await response.json();
          console.log('💰 Quote API response:', result);
          
          if (result.data?.last_price) {
            setLivePrice(result.data.last_price);
            console.log('✅ Updated live price:', result.data.last_price);
          } else {
            console.warn('⚠️ No last_price in quote response');
          }
        } else {
          console.warn('⚠️ Quote API failed:', response.status);
        }
      } catch (error) {
        console.warn('Could not fetch live price:', error.message);
      }
    };

    // Fetch immediately
    fetchLivePrice();

    // Refresh every 5 seconds
    const priceInterval = setInterval(fetchLivePrice, 5000);

    return () => clearInterval(priceInterval);
  }, [selectedStock?.instrument_token]);

  // Calculate price change when we have both live price and chart data
  useEffect(() => {
    if (!chartData.length) {
      setPriceChange(null);
      return;
    }

    // Use live price or latest candle close
    const currentPrice = livePrice || chartData[chartData.length - 1]?.close;
    const firstCandle = chartData[0];
    
    if (currentPrice && firstCandle) {
      const change = ((currentPrice - firstCandle.close) / firstCandle.close) * 100;
      setPriceChange(change);
      console.log(`📊 Price change calculated: ${change.toFixed(2)}% (from ₹${firstCandle.close} to ₹${currentPrice})`);
    }
  }, [livePrice, chartData]);

  // Search instruments from Zerodha MCP
  const searchInstruments = async (query) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(`http://localhost:3001/api/instruments/search?q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error('Search failed');
      
      const data = await response.json();
      setSearchResults(data.instruments || []);
    } catch (error) {
      console.error('Instrument search error:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (stockSearch) {
      searchTimeoutRef.current = setTimeout(() => {
        searchInstruments(stockSearch);
      }, 300);
    } else {
      setSearchResults([]);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [stockSearch]);

  // Live candle timer
  useEffect(() => {
    if (!chartData.length || !selectedStock) {
      setCandleTimer('--:--');
      return;
    }

    const updateTimer = () => {
      const now = new Date();
      const latestCandle = chartData[chartData.length - 1];
      if (!latestCandle) {
        setCandleTimer('--:--');
        return;
      }

      const candleStart = new Date(latestCandle.date);
      
      // Calculate candle duration based on timeframe
      let candleDurationMs = 0;
      if (timeframe === 'minute') candleDurationMs = 60 * 1000;
      else if (timeframe === '3minute') candleDurationMs = 3 * 60 * 1000;
      else if (timeframe === '5minute') candleDurationMs = 5 * 60 * 1000;
      else if (timeframe === '10minute') candleDurationMs = 10 * 60 * 1000;
      else if (timeframe === '15minute') candleDurationMs = 15 * 60 * 1000;
      else if (timeframe === '30minute') candleDurationMs = 30 * 60 * 1000;
      else if (timeframe === '45minute') candleDurationMs = 45 * 60 * 1000;
      else if (timeframe === '60minute') candleDurationMs = 60 * 60 * 1000;
      else if (timeframe === '240minute') candleDurationMs = 240 * 60 * 1000;
      else if (timeframe === 'day') candleDurationMs = 24 * 60 * 60 * 1000;
      else if (timeframe === 'week') candleDurationMs = 7 * 24 * 60 * 60 * 1000;
      else if (timeframe === 'month') candleDurationMs = 30 * 24 * 60 * 60 * 1000;
      
      const candleEnd = new Date(candleStart.getTime() + candleDurationMs);
      const remaining = candleEnd - now;
      
      console.log(`⏱️ Timer update - Remaining: ${remaining}ms, Candle: ${latestCandle.date}`);
      
      if (remaining > 0) {
        // For longer timeframes (4h, daily, weekly, monthly), show hours
        if (timeframe === '240minute' || timeframe === 'day' || timeframe === 'week' || timeframe === 'month') {
          const hours = Math.floor(remaining / 3600000);
          const minutes = Math.floor((remaining % 3600000) / 60000);
          setCandleTimer(`${hours}h ${minutes}m`);
        } else {
          const minutes = Math.floor(remaining / 60000);
          const seconds = Math.floor((remaining % 60000) / 1000);
          setCandleTimer(`${minutes}:${seconds.toString().padStart(2, '0')}`);
        }
      } else {
        setCandleTimer('Updating...');
      }
    };

    updateTimer();
    const timerInterval = setInterval(updateTimer, 1000); // Update every second

    return () => clearInterval(timerInterval);
  }, [chartData, timeframe, selectedStock]);

  // Timeframe configurations
  const timeframes = [
    { value: 'minute', label: '1m', defaultDays: 1, maxDays: 3 },
    { value: '3minute', label: '3m', defaultDays: 2, maxDays: 5 },
    { value: '5minute', label: '5m', defaultDays: 3, maxDays: 7 },
    { value: '10minute', label: '10m', defaultDays: 5, maxDays: 10 },
    { value: '15minute', label: '15m', defaultDays: 7, maxDays: 15 },
    { value: '30minute', label: '30m', defaultDays: 10, maxDays: 30 },
    { value: '45minute', label: '45m', defaultDays: 15, maxDays: 45 },
    { value: '60minute', label: '1h', defaultDays: 20, maxDays: 60 },
    { value: '240minute', label: '4h', defaultDays: 60, maxDays: 180 },
    { value: 'day', label: '1D', defaultDays: 100, maxDays: 365 },
    { value: 'week', label: '1W', defaultDays: 365, maxDays: 1825 },
    { value: 'month', label: '1M', defaultDays: 730, maxDays: 3650 }
  ];

  // Available indicators (TradingView-like)
  const indicators = [
    { id: 'sma20', name: 'SMA(20)', color: '#3b82f6', category: 'trend' },
    { id: 'sma50', name: 'SMA(50)', color: '#f59e0b', category: 'trend' },
    { id: 'ema20', name: 'EMA(20)', color: '#8b5cf6', category: 'trend' },
    { id: 'bb', name: 'Bollinger Bands', color: '#10b981', category: 'volatility' },
    { id: 'rsi', name: 'RSI(14)', color: '#f59e0b', category: 'momentum' },
    { id: 'macd', name: 'MACD', color: '#3b82f6', category: 'momentum' },
    { id: 'volume', name: 'Volume', color: '#6b7280', category: 'volume' }
  ];

  const toggleIndicator = (indicatorId) => {
    setActiveIndicators(prev => 
      prev.includes(indicatorId) 
        ? prev.filter(id => id !== indicatorId)
        : [...prev, indicatorId]
    );
  };

  // Fetch chart data from backend
  const fetchChartData = async (silent = false) => {
    if (!selectedStock) {
      console.log('⚠️ No stock selected');
      return;
    }

    try {
      if (!silent) {
        setLoading(true);
      }
      setError(null);

      // Calculate date range - use dataRange.days for dynamic loading
      const toDate = new Date();
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - dataRange.days);
      
      console.log(`📡 Fetching chart data (silent: ${silent})...`);

      const from = fromDate.toISOString().split('T')[0] + ' 00:00:00';
      const to = toDate.toISOString().split('T')[0] + ' 23:59:59';

      console.log('📊 Fetching historical data:', { 
        stock: selectedStock.tradingsymbol, 
        token: selectedStock.instrument_token,
        timeframe, 
        from, 
        to, 
        days: dataRange.days 
      });

      const response = await fetch(
        `http://localhost:3001/api/market/historical/${selectedStock.instrument_token}?interval=${timeframe}&from=${from}&to=${to}`,
        { cache: 'no-store' } // Prevent caching for live updates
      );

      console.log('📡 Response status:', response.status, response.statusText);

      if (response.status === 401) {
        window.dispatchEvent(new Event('auth-error'));
        throw new Error('Authorization required. Please login to Zerodha.');
      }

      if (!response.ok) {
        console.error('🚨 Response NOT OK! Status:', response.status, response.statusText);
        let errorData = {};
        let errorText = '';
        
        try {
          errorText = await response.text();
          console.log('📦 Raw error response text (length:', errorText.length, '):', errorText.substring(0, 500));
          
          if (errorText.trim()) {
            errorData = JSON.parse(errorText);
            console.log('📦 Parsed error data:', errorData);
            console.log('📦 Error data keys:', Object.keys(errorData));
          } else {
            console.error('❌ Empty error response from backend!');
            throw new Error(`Backend returned empty error response (${response.status})`);
          }
        } catch (parseError) {
          console.error('❌ Could not parse error response:', parseError.message);
          console.error('Raw text was:', errorText.substring(0, 500));
          throw new Error(`Failed to fetch chart data: ${response.status} ${response.statusText}. Raw response: ${errorText.substring(0, 200)}`);
        }
        
        // Check if errorData is empty object
        if (Object.keys(errorData).length === 0) {
          console.error('❌ Error data is empty object!');
          throw new Error(`Backend returned empty error object (${response.status}). This might be an MCP connection issue.`);
        }
        
        console.error('❌ Chart API error:', errorData);
        
        // If it's an authorization error, trigger the auth modal
        if (errorData.needsAuth || errorData.error?.includes('authorization') || errorData.mcpError?.includes('authorization')) {
          window.dispatchEvent(new Event('auth-error'));
          throw new Error('Authorization required. Please login to Zerodha.');
        }
        
        throw new Error(errorData.message || errorData.error || errorData.mcpError || `Failed to fetch chart data: ${JSON.stringify(errorData).substring(0, 200)}`);
      }

      const result = await response.json();
      
      console.log('📦 API Response (full):', JSON.stringify(result, null, 2).substring(0, 1000));
      console.log('📦 Response keys:', Object.keys(result || {}));
      console.log('📦 Response.success:', result?.success);
      console.log('📦 Response.data:', result?.data ? 'exists' : 'missing');
      console.log('📦 Response.data type:', Array.isArray(result?.data) ? 'array' : typeof result?.data);
      
      // Handle different response formats
      let candles = [];
      
      if (result.success && result.data && Array.isArray(result.data.candles)) {
        // Format 1: { success: true, data: { candles: [...] } }
        console.log('✅ Using Format 1: result.data.candles');
        candles = result.data.candles;
      } else if (result.data && Array.isArray(result.data)) {
        // Format 2: { data: [...] }
        console.log('✅ Using Format 2: result.data (array)');
        candles = result.data;
      } else if (Array.isArray(result.candles)) {
        // Format 3: { candles: [...] }
        console.log('✅ Using Format 3: result.candles');
        candles = result.candles;
      } else if (Array.isArray(result)) {
        // Format 4: [...]
        console.log('✅ Using Format 4: result (direct array)');
        candles = result;
      } else {
        console.error('❌ Invalid response format!');
        console.error('Full result:', result);
        console.error('Result type:', typeof result);
        console.error('Is array?', Array.isArray(result));
        console.error('Result keys:', Object.keys(result || {}));
        
        throw new Error(`Invalid data format from API. Got empty or malformed response. Keys: ${Object.keys(result || {}).join(', ') || 'none'}`);
      }

      if (!candles || candles.length === 0) {
        console.warn('⚠️ No candles in response');
        if (!silent) {
          setError('No data available for this instrument and timeframe');
        }
        return;
      }

      // Map candles to standard format
      const formattedCandles = candles.map(c => ({
        date: c.date || c.timestamp,
        open: parseFloat(c.open),
        high: parseFloat(c.high),
        low: parseFloat(c.low),
        close: parseFloat(c.close),
        volume: parseInt(c.volume) || 0
      }));

      console.log(`✅ Received ${formattedCandles.length} candles`);

      // For live updates (silent = true), smartly update or append
      if (silent && chartData.length > 0) {
        const latestExisting = chartData[chartData.length - 1];
        const latestNew = formattedCandles[formattedCandles.length - 1];
        
        // Check if the latest candle is from the same time period
        const existingTime = new Date(latestExisting.date).getTime();
        const newTime = new Date(latestNew.date).getTime();
        
        if (existingTime === newTime) {
          // Update the last candle (it's still forming)
          console.log('🔄 Updating forming candle:', latestNew);
          setChartData(prev => [...prev.slice(0, -1), latestNew]);
        } else if (newTime > existingTime) {
          // New candle has started, append it
          console.log('➕ New candle formed, appending:', latestNew);
          setChartData(prev => [...prev, latestNew]);
        } else {
          // Time went backwards or same, just replace all data
          console.log('🔄 Replacing all data');
          setChartData(formattedCandles);
        }
      } else {
        // Initial load or manual refresh
        setChartData(formattedCandles);
        if (formattedCandles.length > 0) {
          setOldestDataDate(new Date(formattedCandles[0].date));
        }
      }

      setLastUpdate(new Date());

    } catch (err) {
      console.error('Chart data fetch error:', err);
      if (!silent) {
        setError(err.message || 'Failed to load chart data');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  // Load older data for infinite scroll
  const loadOlderData = async () => {
    if (isLoadingMore || !hasMoreData || !selectedStock) return;

    setIsLoadingMore(true);
    try {
      const currentConfig = timeframes.find(tf => tf.value === timeframe);
      if (!currentConfig) return;

      // Increase the data range
      const newDays = Math.min(dataRange.days + Math.floor(dataRange.days * 0.5), currentConfig.maxDays);
      
      if (newDays === dataRange.days) {
        // Already at max
        setHasMoreData(false);
        return;
      }

      console.log(`📡 Loading older data: ${dataRange.days} → ${newDays} days`);

      const toDate = new Date();
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - newDays);

      const from = fromDate.toISOString().split('T')[0] + ' 00:00:00';
      const to = toDate.toISOString().split('T')[0] + ' 23:59:59';

      const response = await fetch(
        `http://localhost:3001/api/market/historical/${selectedStock.instrument_token}?interval=${timeframe}&from=${from}&to=${to}`,
        { cache: 'no-store' }
      );

      if (!response.ok) throw new Error('Failed to load older data');

      const result = await response.json();
      
      // Handle different response formats
      let candles = [];
      
      if (result.success && result.data && Array.isArray(result.data.candles)) {
        candles = result.data.candles;
      } else if (result.data && Array.isArray(result.data)) {
        candles = result.data;
      } else if (Array.isArray(result.candles)) {
        candles = result.candles;
      } else if (Array.isArray(result)) {
        candles = result;
      } else {
        throw new Error('Invalid data format');
      }

      const newCandles = candles.map(c => ({
        date: c.date || c.timestamp,
        open: parseFloat(c.open),
        high: parseFloat(c.high),
        low: parseFloat(c.low),
        close: parseFloat(c.close),
        volume: parseInt(c.volume) || 0
      }));

      console.log(`✅ Loaded ${newCandles.length} candles (was ${chartData.length})`);

      // Calculate how many new candles were added
      const oldDataLength = chartData.length;
      setChartData(newCandles);
      setDataRange({ days: newDays });

      // Adjust pan offset to maintain current view position
      const newDataAdded = newCandles.length - oldDataLength;
      if (newDataAdded > 0) {
        setPanOffset(prev => prev + newDataAdded);
      }

      if (newDays >= currentConfig.maxDays) {
        setHasMoreData(false);
      }

    } catch (err) {
      console.error('Load older data error:', err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Effect: Auto-refresh based on timeframe with live candle formation
  useEffect(() => {
    if (!selectedStock) return;
    
    fetchChartData();
    setPanOffset(0);
    setVisibleCandles(100); // Reset visible candles
    setHasMoreData(true); // Reset infinite scroll state
    
    // Auto-refresh based on timeframe - AGGRESSIVE for live candle formation
    const refreshTime = timeframe === 'minute' ? 3000 :  // 3s for 1m (shows candle forming!)
                       timeframe === '3minute' ? 5000 :  // 5s for 3m
                       timeframe === '5minute' ? 8000 :  // 8s for 5m
                       timeframe === '10minute' ? 10000 : // 10s for 10m
                       timeframe === '15minute' ? 15000 : // 15s for 15m
                       timeframe === '30minute' ? 20000 : // 20s for 30m
                       timeframe === '45minute' ? 25000 : // 25s for 45m
                       timeframe === '60minute' ? 30000 : // 30s for 1h
                       timeframe === '240minute' ? 60000 : // 60s for 4h
                       timeframe === 'day' ? 45000 :     // 45s for daily
                       timeframe === 'week' ? 120000 :   // 2min for weekly
                       180000; // 3min for monthly
    
    console.log(`🔄 Live candle refresh: ${refreshTime/1000}s for ${timeframe}`);
    
    const refreshInterval = setInterval(() => {
      console.log('🔴 LIVE UPDATE: Fetching latest candle data...');
      fetchChartData(true); // Silent refresh - updates current candle or appends new one
    }, refreshTime);
    
    return () => clearInterval(refreshInterval);
  }, [timeframe, dataRange.days, selectedStock?.instrument_token]);

  // Reset data range when timeframe changes
  useEffect(() => {
    const config = timeframes.find(tf => tf.value === timeframe);
    if (config) {
      setDataRange({ days: config.defaultDays });
      setHasMoreData(true);
    }
  }, [timeframe]);

  // Technical indicator calculations
  const calculateSMA = (data, period) => {
    const sma = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        sma.push(null);
      } else {
        const sum = data.slice(i - period + 1, i + 1).reduce((acc, candle) => acc + candle.close, 0);
        sma.push(sum / period);
      }
    }
    return sma;
  };

  const calculateEMA = (data, period) => {
    const ema = [];
    const multiplier = 2 / (period + 1);
    let previousEMA = null;

    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        ema.push(null);
      } else if (i === period - 1) {
        const sum = data.slice(0, period).reduce((acc, candle) => acc + candle.close, 0);
        previousEMA = sum / period;
        ema.push(previousEMA);
      } else {
        const currentEMA = (data[i].close - previousEMA) * multiplier + previousEMA;
        ema.push(currentEMA);
        previousEMA = currentEMA;
      }
    }
    return ema;
  };

  const calculateBollingerBands = (data, period, stdDev) => {
    const sma = calculateSMA(data, period);
    const upper = [];
    const lower = [];
    const middle = [...sma];

    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        upper.push(null);
        lower.push(null);
      } else {
        const slice = data.slice(i - period + 1, i + 1);
        const mean = sma[i];
        const squaredDiffs = slice.map(candle => Math.pow(candle.close - mean, 2));
        const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / period;
        const standardDeviation = Math.sqrt(variance);
        
        upper.push(mean + (standardDeviation * stdDev));
        lower.push(mean - (standardDeviation * stdDev));
      }
    }

    return { upper, middle, lower };
  };

  const calculateRSI = (data, period = 14) => {
    const rsi = [];
    const changes = [];
    
    for (let i = 1; i < data.length; i++) {
      changes.push(data[i].close - data[i - 1].close);
    }

    for (let i = 0; i < data.length; i++) {
      if (i < period) {
        rsi.push(null);
      } else {
        const recentChanges = changes.slice(i - period, i);
        const gains = recentChanges.filter(c => c > 0);
        const losses = recentChanges.filter(c => c < 0).map(Math.abs);
        
        const avgGain = gains.length ? gains.reduce((a, b) => a + b, 0) / period : 0;
        const avgLoss = losses.length ? losses.reduce((a, b) => a + b, 0) / period : 0;
        
        if (avgLoss === 0) {
          rsi.push(100);
        } else {
          const rs = avgGain / avgLoss;
          rsi.push(100 - (100 / (1 + rs)));
        }
      }
    }

    return rsi;
  };

  const calculateMACD = (data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) => {
    const fastEMA = calculateEMA(data, fastPeriod);
    const slowEMA = calculateEMA(data, slowPeriod);
    
    const macdLine = fastEMA.map((fast, i) => {
      if (fast === null || slowEMA[i] === null) return null;
      return fast - slowEMA[i];
    });

    // Calculate signal line (EMA of MACD line)
    const signalLine = [];
    const validMACDValues = macdLine.filter(v => v !== null);
    const multiplier = 2 / (signalPeriod + 1);
    let previousSignal = null;

    for (let i = 0; i < macdLine.length; i++) {
      if (macdLine[i] === null || i < slowPeriod + signalPeriod - 2) {
        signalLine.push(null);
      } else if (previousSignal === null) {
        const validSlice = macdLine.slice(i - signalPeriod + 1, i + 1).filter(v => v !== null);
        if (validSlice.length === signalPeriod) {
          previousSignal = validSlice.reduce((a, b) => a + b, 0) / signalPeriod;
          signalLine.push(previousSignal);
        } else {
          signalLine.push(null);
        }
      } else {
        const currentSignal = (macdLine[i] - previousSignal) * multiplier + previousSignal;
        signalLine.push(currentSignal);
        previousSignal = currentSignal;
      }
    }

    const histogram = macdLine.map((macd, i) => {
      if (macd === null || signalLine[i] === null) return null;
      return macd - signalLine[i];
    });

    return { macdLine, signalLine, histogram };
  };

  // Detect Swing Low (BUY signal)
  // Middle candle low is NOT breached by previous and next candle
  const detectSwingLow = (data, index) => {
    if (index === 0 || index === data.length - 1) return false;
    
    const prevCandle = data[index - 1];
    const currentCandle = data[index];
    const nextCandle = data[index + 1];
    
    // Current candle has the lowest low (swing low point)
    return currentCandle.low < prevCandle.low && currentCandle.low < nextCandle.low;
  };

  // Detect Swing High (SELL signal)
  // Middle candle high is NOT breached by previous and next candle
  const detectSwingHigh = (data, index) => {
    if (index === 0 || index === data.length - 1) return false;
    
    const prevCandle = data[index - 1];
    const currentCandle = data[index];
    const nextCandle = data[index + 1];
    
    // Current candle has the highest high (swing high point)
    return currentCandle.high > prevCandle.high && currentCandle.high > nextCandle.high;
  };

  // Get filtered alternating signals (BUY -> SELL -> BUY -> SELL...)
  const getAlternatingSignals = (data) => {
    const signals = [];
    let lastSignalType = null;
    
    for (let i = 1; i < data.length - 1; i++) {
      const isBuy = detectSwingLow(data, i);
      const isSell = detectSwingHigh(data, i);
      
      // Only add signal if it alternates with the last one
      if (isBuy && lastSignalType !== 'BUY') {
        signals.push({ index: i, type: 'BUY', price: data[i].low });
        lastSignalType = 'BUY';
      } else if (isSell && lastSignalType !== 'SELL') {
        signals.push({ index: i, type: 'SELL', price: data[i].high });
        lastSignalType = 'SELL';
      }
    }
    
    return signals;
  };

  // Calculate price channel (upper, lower, and mid lines) for current view
  const calculatePriceChannel = (data, startIdx) => {
    if (data.length < 10) return null;

    // Find significant highs and lows in the visible data
    const highs = [];
    const lows = [];

    for (let i = 0; i < data.length; i++) {
      // Look at a window around this candle
      const windowSize = Math.min(5, Math.floor(data.length / 10));
      const start = Math.max(0, i - windowSize);
      const end = Math.min(data.length - 1, i + windowSize);
      
      const window = data.slice(start, end + 1);
      const maxHigh = Math.max(...window.map(c => c.high));
      const minLow = Math.min(...window.map(c => c.low));
      
      // If current candle is a local high
      if (data[i].high === maxHigh) {
        highs.push({ 
          index: startIdx + i,  // Global index in chartData
          localIndex: i,         // Local index in visible data
          price: data[i].high 
        });
      }
      
      // If current candle is a local low
      if (data[i].low === minLow) {
        lows.push({ 
          index: startIdx + i,   // Global index in chartData
          localIndex: i,          // Local index in visible data
          price: data[i].low 
        });
      }
    }

    // Select significant highs and lows for trendline (more points for longer views)
    const numPoints = Math.min(5, Math.max(3, Math.floor(data.length / 20)));
    const recentHighs = highs.slice(-numPoints);
    const recentLows = lows.slice(-numPoints);

    if (recentHighs.length < 2 || recentLows.length < 2) return null;

    // Calculate linear regression for upper line (highs)
    const upperSlope = (recentHighs[recentHighs.length - 1].price - recentHighs[0].price) / 
                       (recentHighs[recentHighs.length - 1].index - recentHighs[0].index);
    const upperIntercept = recentHighs[0].price - upperSlope * recentHighs[0].index;

    // Calculate linear regression for lower line (lows)
    const lowerSlope = (recentLows[recentLows.length - 1].price - recentLows[0].price) / 
                       (recentLows[recentLows.length - 1].index - recentLows[0].index);
    const lowerIntercept = recentLows[0].price - lowerSlope * recentLows[0].index;

    // Store as formula so we can extend the lines beyond current view
    return {
      upperSlope,
      upperIntercept,
      lowerSlope,
      lowerIntercept,
      highs: recentHighs,
      lows: recentLows,
      startIndex: startIdx,
      endIndex: startIdx + data.length - 1
    };
  };


  // Mouse event handlers for drag/pan
  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, offset: panOffset });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    
    // Cancel previous animation frame
    if (dragAnimationRef.current) {
      cancelAnimationFrame(dragAnimationRef.current);
    }
    
    // Use requestAnimationFrame for smooth 60fps dragging
    dragAnimationRef.current = requestAnimationFrame(() => {
      const deltaX = e.clientX - dragStart.x;
      // MUST match renderChart chartWidth calculation: width(1600) - left(60) - right(90) = 1450
      const chartWidth = 1450; 
      const pixelsPerCandle = chartWidth / visibleCandles;
      const candlesMoved = deltaX / pixelsPerCandle;
      
      // Natural drag: When you drag the chart RIGHT, you're pulling newer data into view
      // When you drag LEFT, you're pulling older data into view
      // So we SUBTRACT the movement from offset
      const newOffset = Math.round(dragStart.offset - candlesMoved);
      const clampedOffset = Math.max(0, Math.min(chartData.length - visibleCandles, newOffset));
      
      setPanOffset(clampedOffset);
      
      // DON'T auto-load during drag - only pan the view
      // Scroll/zoom will trigger data loading when needed
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Prevent browser zoom on Ctrl+Scroll
    if (e.ctrlKey) {
      return;
    }
    
    const zoomFactor = e.deltaY < 0 ? 0.9 : 1.1; // Scroll up = zoom in (fewer candles), down = zoom out
    const newVisibleCandles = Math.round(visibleCandles * zoomFactor);
    const clampedCandles = Math.max(20, Math.min(500, newVisibleCandles));
    
    setVisibleCandles(clampedCandles);
    
    // Check if we need to load more data (when zooming out near the edge)
    if (clampedCandles > chartData.length * 0.9 && hasMoreData) {
      loadOlderData();
    }
  };

  const handleMouseMoveChart = (e) => {
    if (isDragging) {
      handleMouseMove(e);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const padding = { top: 50, right: 90, bottom: 100, left: 60 };
    const chartWidth = 1600 - padding.left - padding.right;
    
    // Only show crosshair within chart bounds
    if (x >= padding.left && x <= rect.width - padding.right && 
        y >= padding.top && y <= rect.height - padding.bottom) {
      setCrosshair({ x, y });
      
      // Find which candle is hovered
      const startIndex = Math.max(0, chartData.length - visibleCandles - panOffset);
      const endIndex = Math.min(chartData.length, startIndex + visibleCandles);
      const visibleData = chartData.slice(startIndex, endIndex);
      const candleIndex = Math.floor(((x - padding.left) / chartWidth) * visibleData.length);
      
      if (candleIndex >= 0 && candleIndex < visibleData.length) {
        setHoveredCandle(visibleData[candleIndex]);
      }
    } else {
      setCrosshair(null);
      setHoveredCandle(null);
    }
  };

  // Render candlestick chart
  const renderChart = () => {
    if (!chartData.length) return null;

    // Fixed dimensions - all elements must use these consistently
    const width = 1600;
    const height = 650;
    const padding = { top: 50, right: 90, bottom: 100, left: 60 };
    const chartWidth = width - padding.left - padding.right; // 1450px actual chart area
    const chartHeight = height - padding.top - padding.bottom;

    // Calculate visible range - show exactly visibleCandles
    const startIndex = Math.max(0, chartData.length - visibleCandles - panOffset);
    const endIndex = Math.min(chartData.length, startIndex + visibleCandles);
    const visibleData = chartData.slice(startIndex, endIndex);

    if (visibleData.length === 0) return null;

    // Price range
    const prices = visibleData.flatMap(c => [c.high, c.low]);
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    const priceRange = maxPrice - minPrice;
    const pricePadding = priceRange * 0.1;

    const scaleY = (price) => {
      return padding.top + ((maxPrice + pricePadding - price) / (priceRange + 2 * pricePadding)) * chartHeight;
    };

    const scaleX = (index) => {
      return padding.left + (index / visibleData.length) * chartWidth;
    };

    const candleWidth = Math.max(1, chartWidth / visibleData.length * 0.8);

    // Calculate indicators on FULL dataset first for continuity
    // Then extract visible portion - this ensures smooth extension when loading more data
    let sma20 = null, sma50 = null, ema20 = null, bb = null, rsi = null, macd = null;
    
    if (activeIndicators.includes('sma20')) {
      const fullSMA20 = calculateSMA(chartData, 20);
      sma20 = fullSMA20.slice(startIndex, endIndex);
    }
    if (activeIndicators.includes('sma50')) {
      const fullSMA50 = calculateSMA(chartData, 50);
      sma50 = fullSMA50.slice(startIndex, endIndex);
    }
    if (activeIndicators.includes('ema20')) {
      const fullEMA20 = calculateEMA(chartData, 20);
      ema20 = fullEMA20.slice(startIndex, endIndex);
    }
    if (activeIndicators.includes('bb')) {
      const fullBB = calculateBollingerBands(chartData, 20, 2);
      bb = {
        upper: fullBB.upper.slice(startIndex, endIndex),
        middle: fullBB.middle.slice(startIndex, endIndex),
        lower: fullBB.lower.slice(startIndex, endIndex)
      };
    }
    
    // RSI and MACD use visible data (for separate panels)
    if (activeIndicators.includes('rsi')) rsi = calculateRSI(visibleData, 14);
    if (activeIndicators.includes('macd')) macd = calculateMACD(visibleData, 12, 26, 9);

    return (
      <svg 
        width={width} 
        height={height} 
        className="cursor-grab active:cursor-grabbing transition-transform"
        style={{ 
          userSelect: 'none',
          background: 'transparent',
          touchAction: 'none',
          willChange: 'transform'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMoveChart}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { handleMouseUp(); setCrosshair(null); setHoveredCandle(null); }}
        onWheel={handleWheel}
      >
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padding.top + ratio * chartHeight;
          const price = maxPrice + pricePadding - ratio * (priceRange + 2 * pricePadding);
          return (
            <g key={ratio}>
              <line 
                x1={padding.left} 
                y1={y} 
                x2={width - padding.right} 
                y2={y} 
                stroke="rgba(200, 200, 200, 0.3)" 
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <text 
                x={width - padding.right + 5} 
                y={y + 4} 
                fontSize="11" 
                fill="#6b7280"
                fontFamily="Poppins, sans-serif"
              >
                ₹{price.toFixed(2)}
              </text>
            </g>
          );
        })}

        {/* Bollinger Bands */}
        {bb && (
          <>
            <polyline
              points={bb.upper.map((val, i) => val ? `${scaleX(i) + candleWidth/2},${scaleY(val)}` : null).filter(p => p).join(' ')}
              fill="none"
              stroke="#10b981"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              opacity="0.5"
            />
            <polyline
              points={bb.lower.map((val, i) => val ? `${scaleX(i) + candleWidth/2},${scaleY(val)}` : null).filter(p => p).join(' ')}
              fill="none"
              stroke="#10b981"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              opacity="0.5"
            />
            <polygon
              points={[
                ...bb.upper.map((val, i) => val ? `${scaleX(i) + candleWidth/2},${scaleY(val)}` : null).filter(p => p),
                ...bb.lower.map((val, i) => val ? `${scaleX(i) + candleWidth/2},${scaleY(val)}` : null).filter(p => p).reverse()
              ].join(' ')}
              fill="#10b981"
              opacity="0.05"
            />
          </>
        )}

        {/* Candlesticks */}
        {chartType === 'candlestick' && visibleData.map((candle, index) => {
          const x = scaleX(index);
          const openY = scaleY(candle.open);
          const closeY = scaleY(candle.close);
          const highY = scaleY(candle.high);
          const lowY = scaleY(candle.low);
          const isBullish = candle.close >= candle.open;
          const color = isBullish ? '#10b981' : '#ef4444';
          const bodyHeight = Math.abs(closeY - openY) || 1;

          return (
            <g key={index}>
              <line x1={x + candleWidth/2} y1={highY} x2={x + candleWidth/2} y2={lowY} stroke={color} strokeWidth="1.5" opacity="0.8" />
              <rect
                x={x}
                y={Math.min(openY, closeY)}
                width={candleWidth}
                height={bodyHeight}
                fill={color}
                opacity="0.9"
                rx="1"
              />
            </g>
          );
        })}

        {/* Alternating BUY/SELL Signals */}
        {(() => {
          if (chartType !== 'candlestick') return null;
          
          // Get all alternating signals from full dataset
          const allSignals = getAlternatingSignals(chartData);
          
          // Filter to only show signals in visible range
          const visibleSignals = allSignals.filter(signal => {
            const visibleIndex = signal.index - startIndex;
            return visibleIndex >= 0 && visibleIndex < visibleData.length;
          });
          
          console.log(`📊 Showing ${visibleSignals.length} alternating signals (${allSignals.length} total)`);
          
          return visibleSignals.map((signal) => {
            const visibleIndex = signal.index - startIndex;
            const candle = visibleData[visibleIndex];
            const x = scaleX(visibleIndex);
            
            if (signal.type === 'BUY') {
              const lowY = scaleY(candle.low);
              return (
                <g key={`signal-${signal.index}`}>
                  {/* Green arrow pointing UP */}
                  <polygon
                    points={`${x + candleWidth/2},${lowY + 35} ${x + candleWidth/2 - 8},${lowY + 50} ${x + candleWidth/2 + 8},${lowY + 50}`}
                    fill="#10b981"
                    stroke="#064e3b"
                    strokeWidth="2"
                    opacity="0.95"
                  />
                  {/* BUY label */}
                  <rect
                    x={x + candleWidth/2 - 18}
                    y={lowY + 52}
                    width="36"
                    height="16"
                    fill="#10b981"
                    rx="3"
                    opacity="0.95"
                  />
                  <text
                    x={x + candleWidth/2}
                    y={lowY + 63}
                    fontSize="10"
                    fill="white"
                    fontWeight="bold"
                    textAnchor="middle"
                    fontFamily="Poppins, sans-serif"
                  >
                    BUY
                  </text>
                </g>
              );
            } else {
              // SELL signal
              const highY = scaleY(candle.high);
              return (
                <g key={`signal-${signal.index}`}>
                  {/* Red arrow pointing DOWN */}
                  <polygon
                    points={`${x + candleWidth/2},${highY - 35} ${x + candleWidth/2 - 8},${highY - 50} ${x + candleWidth/2 + 8},${highY - 50}`}
                    fill="#ef4444"
                    stroke="#7f1d1d"
                    strokeWidth="2"
                    opacity="0.95"
                  />
                  {/* SELL label */}
                  <rect
                    x={x + candleWidth/2 - 18}
                    y={highY - 68}
                    width="36"
                    height="16"
                    fill="#ef4444"
                    rx="3"
                    opacity="0.95"
                  />
                  <text
                    x={x + candleWidth/2}
                    y={highY - 57}
                    fontSize="10"
                    fill="white"
                    fontWeight="bold"
                    textAnchor="middle"
                    fontFamily="Poppins, sans-serif"
                  >
                    SELL
                  </text>
                </g>
              );
            }
          });
        })()}

        {chartType === 'line' && (
          <polyline
            points={visibleData.map((candle, i) => `${scaleX(i) + candleWidth/2},${scaleY(candle.close)}`).join(' ')}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {chartType === 'bar' && visibleData.map((candle, index) => {
          const x = scaleX(index);
          const openY = scaleY(candle.open);
          const closeY = scaleY(candle.close);
          const isBullish = candle.close >= candle.open;
          const color = isBullish ? '#10b981' : '#ef4444';
          const barHeight = Math.abs(closeY - openY) || 1;

          return (
            <rect
              key={index}
              x={x}
              y={Math.min(openY, closeY)}
              width={candleWidth}
              height={barHeight}
              fill={color}
              opacity="0.8"
            />
          );
        })}

        {/* RSI Overbought/Oversold Indicators on Chart */}
        {(() => {
          const rsiData = calculateRSI(visibleData, 14);
          return visibleData.map((candle, i) => {
            const rsi = rsiData[i];
            if (!rsi) return null;
            
            const x = scaleX(i);
            const isOverbought = rsi > 70;
            const isOversold = rsi < 30;
            
            if (!isOverbought && !isOversold) return null;
            
            return (
              <g key={`rsi-indicator-${i}`}>
                {/* Small circle indicator at top/bottom of candle */}
                <circle
                  cx={x + candleWidth / 2}
                  cy={isOverbought ? scaleY(candle.high) - 8 : scaleY(candle.low) + 8}
                  r="4"
                  fill={isOverbought ? '#ef4444' : '#10b981'}
                  stroke="white"
                  strokeWidth="1.5"
                  opacity="0.9"
                />
                {/* Tooltip badge */}
                <g opacity="0" className="hover-visible">
                  <rect
                    x={x + candleWidth / 2 - 35}
                    y={isOverbought ? scaleY(candle.high) - 30 : scaleY(candle.low) + 15}
                    width="70"
                    height="18"
                    fill={isOverbought ? '#ef4444' : '#10b981'}
                    rx="3"
                    opacity="0.95"
                  />
                  <text
                    x={x + candleWidth / 2}
                    y={isOverbought ? scaleY(candle.high) - 17 : scaleY(candle.low) + 28}
                    fontSize="9"
                    fill="white"
                    fontWeight="bold"
                    textAnchor="middle"
                    fontFamily="Poppins, sans-serif"
                  >
                    {isOverbought ? 'OVERBOUGHT' : 'OVERSOLD'} {Math.round(rsi)}
                  </text>
                </g>
              </g>
            );
          });
        })()}

        {/* Price Channel (Upper, Mid, Lower lines) - Auto-updates with zoom/pan */}
        {showPriceChannel && (() => {
          // Calculate channel from current visible view
          const channel = calculatePriceChannel(visibleData, startIndex);
          if (!channel) return null;
          
          // Generate channel lines for visible range using the formulas
          const upperLine = visibleData.map((candle, i) => {
            const globalIdx = startIndex + i;
            return channel.upperSlope * globalIdx + channel.upperIntercept;
          });
          
          const lowerLine = visibleData.map((candle, i) => {
            const globalIdx = startIndex + i;
            return channel.lowerSlope * globalIdx + channel.lowerIntercept;
          });
          
          const midLine = visibleData.map((candle, i) => {
            return (upperLine[i] + lowerLine[i]) / 2;
          });
          
          return (
            <g>
              {/* Upper channel line (resistance) */}
              <polyline
                points={upperLine.map((val, i) => `${scaleX(i) + candleWidth/2},${scaleY(val)}`).join(' ')}
                fill="none"
                stroke="#ef4444"
                strokeWidth="2.5"
                strokeDasharray="8 4"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.85"
              />
              {/* Label for upper line */}
              <text
                x={scaleX(visibleData.length - 1) + candleWidth + 5}
                y={scaleY(upperLine[upperLine.length - 1]) - 5}
                fontSize="11"
                fill="#ef4444"
                fontWeight="700"
                fontFamily="Poppins, sans-serif"
              >
                RESISTANCE
              </text>
              
              {/* Mid channel line */}
              <polyline
                points={midLine.map((val, i) => `${scaleX(i) + candleWidth/2},${scaleY(val)}`).join(' ')}
                fill="none"
                stroke="#6366f1"
                strokeWidth="2"
                strokeDasharray="6 3"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.7"
              />
              {/* Label for mid line */}
              <text
                x={scaleX(visibleData.length - 1) + candleWidth + 5}
                y={scaleY(midLine[midLine.length - 1]) + 4}
                fontSize="10"
                fill="#6366f1"
                fontWeight="600"
                fontFamily="Poppins, sans-serif"
              >
                MID
              </text>
              
              {/* Lower channel line (support) */}
              <polyline
                points={lowerLine.map((val, i) => `${scaleX(i) + candleWidth/2},${scaleY(val)}`).join(' ')}
                fill="none"
                stroke="#10b981"
                strokeWidth="2.5"
                strokeDasharray="8 4"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.85"
              />
              {/* Label for lower line */}
              <text
                x={scaleX(visibleData.length - 1) + candleWidth + 5}
                y={scaleY(lowerLine[lowerLine.length - 1]) + 14}
                fontSize="11"
                fill="#10b981"
                fontWeight="700"
                fontFamily="Poppins, sans-serif"
              >
                SUPPORT
              </text>
              
              {/* Channel fill for visualization */}
              <polygon
                points={[
                  ...upperLine.map((val, i) => `${scaleX(i) + candleWidth/2},${scaleY(val)}`),
                  ...lowerLine.map((val, i) => `${scaleX(i) + candleWidth/2},${scaleY(val)}`).reverse()
                ].join(' ')}
                fill="#6366f1"
                opacity="0.12"
              />
              
              {/* Mark key highs and lows with dots */}
              {channel.highs.map((high, idx) => {
                const visibleIndex = high.localIndex;
                if (visibleIndex < 0 || visibleIndex >= visibleData.length) return null;
                return (
                  <circle
                    key={`high-${idx}`}
                    cx={scaleX(visibleIndex) + candleWidth / 2}
                    cy={scaleY(high.price)}
                    r="6"
                    fill="#ef4444"
                    stroke="white"
                    strokeWidth="2.5"
                    opacity="0.9"
                  />
                );
              })}
              
              {channel.lows.map((low, idx) => {
                const visibleIndex = low.localIndex;
                if (visibleIndex < 0 || visibleIndex >= visibleData.length) return null;
                return (
                  <circle
                    key={`low-${idx}`}
                    cx={scaleX(visibleIndex) + candleWidth / 2}
                    cy={scaleY(low.price)}
                    r="6"
                    fill="#10b981"
                    stroke="white"
                    strokeWidth="2.5"
                    opacity="0.9"
                  />
                );
              })}
            </g>
          );
        })()}

        {/* Moving averages with smooth lines */}
        {sma20 && (
          <polyline
            points={sma20.map((val, i) => val ? `${scaleX(i) + candleWidth/2},${scaleY(val)}` : null).filter(p => p).join(' ')}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transition: 'all 0.3s ease' }}
          />
        )}
        {sma50 && (
          <polyline
            points={sma50.map((val, i) => val ? `${scaleX(i) + candleWidth/2},${scaleY(val)}` : null).filter(p => p).join(' ')}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transition: 'all 0.3s ease' }}
          />
        )}
        {ema20 && (
          <polyline
            points={ema20.map((val, i) => val ? `${scaleX(i) + candleWidth/2},${scaleY(val)}` : null).filter(p => p).join(' ')}
            fill="none"
            stroke="#8b5cf6"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transition: 'all 0.3s ease' }}
          />
        )}

        {/* X-axis labels */}
        {visibleData.filter((_, i) => i % Math.ceil(visibleData.length / 10) === 0).map((candle, idx) => {
          const i = idx * Math.ceil(visibleData.length / 10);
          const x = scaleX(i);
          const date = new Date(candle.date);
          const label = timeframe === 'day' 
            ? date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
            : date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
          
          return (
            <text
              key={i}
              x={x}
              y={height - padding.bottom + 25}
              fontSize="11"
              fill="#6b7280"
              textAnchor="middle"
              fontFamily="Poppins, sans-serif"
            >
              {label}
            </text>
          );
        })}

        {/* Chart title */}
        <text
          x={padding.left}
          y={padding.top - 15}
          fontSize="16"
          fill="#1f2937"
          fontFamily="Poppins, sans-serif"
          fontWeight="normal"
        >
          NIFTY 50 - {timeframes.find(tf => tf.value === timeframe)?.label} • Showing {visibleData.length} of {chartData.length} candles
        </text>

        {/* Volume bars at bottom */}
        {showVolume && (() => {
          const volumes = visibleData.map(c => c.volume || 0).filter(v => v > 0);
          if (volumes.length === 0) return null;
          
          const maxVol = Math.max(...volumes);
          const volHeight = 40;

          return visibleData.map((candle, index) => {
            const x = scaleX(index);
            const vol = candle.volume || 0;
            const barHeight = (vol / maxVol) * volHeight;
            const isBullish = candle.close >= candle.open;

            if (!barHeight || isNaN(barHeight)) return null;

            return (
              <rect
                key={`vol-${index}`}
                x={x}
                y={height - padding.bottom + 10 - barHeight}
                width={candleWidth}
                height={barHeight}
                fill={isBullish ? 'rgba(16, 185, 129, 0.6)' : 'rgba(239, 68, 68, 0.6)'}
                opacity="0.7"
              />
            );
          });
        })()}

        {/* Crosshair */}
        {crosshair && (
          <>
            <line x1={crosshair.x} y1={padding.top} x2={crosshair.x} y2={height - padding.bottom} stroke="#3b82f6" strokeWidth="1" strokeDasharray="4 4" opacity="0.5" />
            <line x1={padding.left} y1={crosshair.y} x2={width - padding.right} y2={crosshair.y} stroke="#3b82f6" strokeWidth="1" strokeDasharray="4 4" opacity="0.5" />
          </>
        )}

        {/* Hovered candle info tooltip */}
        {hoveredCandle && (
          <g>
            <rect x={padding.left + 10} y={padding.top + 10} width="250" height="100" fill="rgba(0,0,0,0.85)" rx="5" />
            <text x={padding.left + 20} y={padding.top + 30} fontSize="12" fill="#ffffff" fontFamily="Poppins, sans-serif" fontWeight="600">
              {new Date(hoveredCandle.date).toLocaleString('en-IN')}
            </text>
            <text x={padding.left + 20} y={padding.top + 50} fontSize="11" fill="#10b981" fontFamily="Poppins, sans-serif">O: ₹{hoveredCandle.open.toFixed(2)}</text>
            <text x={padding.left + 130} y={padding.top + 50} fontSize="11" fill="#22c55e" fontFamily="Poppins, sans-serif">H: ₹{hoveredCandle.high.toFixed(2)}</text>
            <text x={padding.left + 20} y={padding.top + 70} fontSize="11" fill="#ef4444" fontFamily="Poppins, sans-serif">L: ₹{hoveredCandle.low.toFixed(2)}</text>
            <text x={padding.left + 130} y={padding.top + 70} fontSize="11" fill="#3b82f6" fontFamily="Poppins, sans-serif">C: ₹{hoveredCandle.close.toFixed(2)}</text>
            <text x={padding.left + 20} y={padding.top + 90} fontSize="11" fill="#9ca3af" fontFamily="Poppins, sans-serif">Vol: {(hoveredCandle.volume || 0).toLocaleString()}</text>
            <text x={padding.left + 130} y={padding.top + 90} fontSize="11" fill={hoveredCandle.close >= hoveredCandle.open ? '#10b981' : '#ef4444'} fontFamily="Poppins, sans-serif">
              {((hoveredCandle.close - hoveredCandle.open) / hoveredCandle.open * 100).toFixed(2)}%
            </text>
          </g>
        )}
      </svg>
    );
  };

  // No stock selected welcome screen
  if (!selectedStock) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-xl shadow-lg border-2 border-blue-200 p-12 text-center">
            <div className="mb-6">
              <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-12 h-12 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h2 className="text-3xl font-bold text-gray-800 mb-2">Welcome to Charts</h2>
              <p className="text-gray-600 text-lg">Search for a stock or option to view its chart</p>
            </div>
            
            <div className="max-w-md mx-auto">
              <input
                type="text"
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                placeholder="Search stocks or options (e.g., TCS, NIFTY25NOV24000PE)..."
                className="w-full px-4 py-3 border-2 border-blue-300 rounded-lg focus:outline-none focus:border-blue-500 text-lg"
              />
              
              {isSearching && (
                <div className="mt-4 text-blue-600">
                  <div className="inline-block w-6 h-6 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className="ml-2">Searching...</span>
                </div>
              )}
              
              {searchResults.length > 0 && (
                <div className="mt-4 max-h-96 overflow-y-auto bg-white border-2 border-blue-200 rounded-lg shadow-lg">
                  {searchResults.map((instrument) => (
                    <button
                      key={instrument.instrument_token}
                      onClick={() => {
                        setSelectedStock(instrument);
                        setStockSearch('');
                        setSearchResults([]);
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border-b border-gray-100"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1">
                          <div className="font-semibold text-gray-800">{instrument.tradingsymbol}</div>
                          <div className="text-sm text-gray-600">
                            {instrument.exchange} • {instrument.name || instrument.tradingsymbol}
                          </div>
                        </div>
                        {(instrument.instrument_type === 'CE' || instrument.instrument_type === 'PE' || instrument.instrument_type === 'FUT') && (
                          <div className="flex flex-col items-end gap-1">
                            <span className={`text-xs px-2 py-1 rounded font-semibold ${
                              instrument.instrument_type === 'CE' ? 'bg-green-100 text-green-700' :
                              instrument.instrument_type === 'PE' ? 'bg-red-100 text-red-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {instrument.instrument_type}
                            </span>
                            {instrument.strike && (
                              <span className="text-xs text-gray-500">Strike: ₹{instrument.strike}</span>
                            )}
                            {instrument.expiry && (
                              <span className="text-xs text-gray-500">{new Date(instrument.expiry).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                            )}
                          </div>
                        )}
                        {instrument.last_price && (
                          <div className="text-right">
                            <div className="font-semibold text-gray-800">₹{instrument.last_price.toFixed(2)}</div>
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-8 text-sm text-gray-500">
              <p>💡 Tip: Navigate from Holdings or Positions using the chart icon</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main chart view
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
      {/* Header with back button and stock info */}
      <div className="bg-white border-b border-gray-200 shadow-sm p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {onBack && (
              <button
                onClick={onBack}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium"
              >
                ← Back
              </button>
            )}
            <div>
              <div className="flex items-center gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-gray-800">
                    {selectedStock?.tradingsymbol || 'Chart'}
                  </h1>
                  <p className="text-sm text-gray-600">
                    {selectedStock?.name} • {selectedStock?.exchange}
                  </p>
                </div>
                
                {/* Live Price Display - Prominent - Always Show */}
                <div className="px-4 py-2 bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-300 rounded-lg min-w-[240px]">
                  <div className="text-xs text-gray-600 font-medium">Last Traded Price</div>
                  {(() => {
                    // Get price from: live price API > latest candle > selected stock last_price
                    const displayPrice = livePrice || 
                                       (chartData.length > 0 ? chartData[chartData.length - 1]?.close : null) || 
                                       selectedStock?.last_price;
                    
                    if (!displayPrice) {
                      return (
                        <div className="flex items-center gap-2 mt-1">
                          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                          <span className="text-sm text-gray-500">Loading price...</span>
                        </div>
                      );
                    }
                    
                    return (
                      <>
                        <div className="flex items-center gap-3">
                          <span className="text-2xl font-bold text-blue-700">
                            ₹{displayPrice.toFixed(2)}
                          </span>
                          {priceChange !== null && (
                            <span className={`text-lg font-bold ${priceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {priceChange >= 0 ? '▲' : '▼'} {Math.abs(priceChange).toFixed(2)}%
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {livePrice ? '🔴 Live Feed' : chartData.length > 0 ? '📊 From Latest Candle' : '📌 Static'}
                        </div>
                      </>
                    );
                  })()}
                </div>
                
                {/* Live Candle Timer */}
                {candleTimer && (
                  <div className="px-3 py-2 bg-gradient-to-r from-orange-50 to-orange-100 border-2 border-orange-300 rounded-lg">
                    <div className="text-xs text-gray-600 font-medium">Next Candle In</div>
                    <div className="text-xl font-bold text-orange-700">
                      ⏱️ {candleTimer}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Stock search in header */}
          <div className="relative w-96">
            <input
              type="text"
              value={stockSearch}
              onChange={(e) => setStockSearch(e.target.value)}
              placeholder="Search another stock..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
            />
            {isSearching && (
              <div className="absolute right-3 top-2.5">
                <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
            
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 max-h-80 overflow-y-auto bg-white border border-gray-300 rounded-lg shadow-lg z-50">
                {searchResults.map((instrument) => (
                  <button
                    key={instrument.instrument_token}
                    onClick={() => {
                      setSelectedStock(instrument);
                      setStockSearch('');
                      setSearchResults([]);
                      setChartData([]);
                    }}
                    className={`w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border-b border-gray-100 ${
                      selectedStock?.instrument_token === instrument.instrument_token ? 'bg-blue-100' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1">
                        <div className="font-semibold text-gray-800">{instrument.tradingsymbol}</div>
                        <div className="text-sm text-gray-600">
                          {instrument.exchange} • {instrument.name || instrument.tradingsymbol}
                        </div>
                      </div>
                      {(instrument.instrument_type === 'CE' || instrument.instrument_type === 'PE' || instrument.instrument_type === 'FUT') && (
                        <div className="flex flex-col items-end gap-1">
                          <span className={`text-xs px-2 py-1 rounded font-semibold ${
                            instrument.instrument_type === 'CE' ? 'bg-green-100 text-green-700' :
                            instrument.instrument_type === 'PE' ? 'bg-red-100 text-red-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {instrument.instrument_type}
                          </span>
                          {instrument.strike && (
                            <span className="text-xs text-gray-500">₹{instrument.strike}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        {/* Top Row: Timeframes */}
        <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center gap-1">
            <span className="text-xs font-medium text-gray-500 mr-2">TIMEFRAME</span>
            {timeframes.map((tf) => (
              <button
                key={tf.value}
                onClick={() => setTimeframe(tf.value)}
                className={`px-4 py-1.5 text-xs font-medium rounded transition-all cursor-pointer ${
                  timeframe === tf.value
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                }`}
                style={{fontFamily: 'Poppins, sans-serif'}}
              >
                {tf.label}
              </button>
            ))}
          </div>
          
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="font-medium">{chartData.length} candles loaded</span>
            <span>•</span>
            <span>Showing {visibleCandles}</span>
            {isLoadingMore && (
              <>
                <span>•</span>
                <span className="text-blue-600 font-medium">Loading more...</span>
              </>
            )}
            {!hasMoreData && chartData.length > 100 && (
              <>
                <span>•</span>
                <span className="text-green-600 font-medium">All data loaded</span>
              </>
            )}
          </div>
        </div>

        {/* Second Row: Indicators & Controls */}
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-4">
            {/* Chart Type */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500">TYPE</span>
              {[
                { value: 'candlestick', label: 'Candles', icon: '🕯️' },
                { value: 'line', label: 'Line', icon: '📈' },
                { value: 'bar', label: 'Bars', icon: '▌' }
              ].map((type) => (
                <button
                  key={type.value}
                  onClick={() => setChartType(type.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-all cursor-pointer ${
                    chartType === type.value
                      ? 'bg-blue-100 text-blue-700 border border-blue-300'
                      : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-300'
                  }`}
                  style={{fontFamily: 'Poppins, sans-serif'}}
                  title={type.label}
                >
                  {type.icon}
                </button>
              ))}
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-gray-300"></div>

            {/* Indicators */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500">INDICATORS</span>
              {indicators.filter(ind => ind.category !== 'volume').map((indicator) => (
                <button
                  key={indicator.id}
                  onClick={() => toggleIndicator(indicator.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded transition-all cursor-pointer ${
                    activeIndicators.includes(indicator.id)
                      ? 'bg-blue-100 text-blue-700 border border-blue-300'
                      : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-300'
                  }`}
                  style={{fontFamily: 'Poppins, sans-serif'}}
                  title={`Toggle ${indicator.name}`}
                >
                  <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{backgroundColor: indicator.color}}></span>
                  {indicator.name}
                </button>
              ))}
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-gray-300"></div>

            {/* Volume Toggle */}
            <button
              onClick={() => setShowVolume(!showVolume)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-all cursor-pointer ${
                showVolume
                  ? 'bg-blue-100 text-blue-700 border border-blue-300'
                  : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-300'
              }`}
              style={{fontFamily: 'Poppins, sans-serif'}}
              title="Toggle Volume"
            >
              📊 Volume
            </button>
            
            {/* Price Channel Toggle */}
            <button
              onClick={() => setShowPriceChannel(!showPriceChannel)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-all cursor-pointer ${
                showPriceChannel
                  ? 'bg-purple-100 text-purple-700 border border-purple-300'
                  : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-300'
              }`}
              style={{fontFamily: 'Poppins, sans-serif'}}
              title="Toggle Price Channel (Auto-updates on zoom/pan)"
            >
              📈 Channel
            </button>
          </div>
          
          {/* Right Side: Info */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded">
              <span className="text-xs font-medium text-amber-800">
                🎯 Signals
              </span>
              <span className="text-xs text-gray-500">•</span>
              <span className="text-xs text-gray-600">
                🟢 BUY → 🔴 SELL
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="p-4">
        {loading && !chartData.length ? (
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-600">Loading chart data...</p>
            </div>
          </div>
        ) : error ? (
          <div className="bg-red-50 border-2 border-red-300 rounded-lg p-6 text-center">
            <p className="text-red-700 font-medium mb-2">Error Loading Chart</p>
            <p className="text-red-600 text-sm mb-4">{error}</p>
            <button
              onClick={() => fetchChartData()}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="flex justify-center p-4">
              {renderChart()}
            </div>
            {isLoadingMore && (
              <div className="flex items-center justify-center gap-2 py-2 bg-blue-50">
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-xs font-medium text-blue-700">Loading older data...</span>
              </div>
            )}
          </div>
        )}

        <button
          onClick={() => fetchChartData()}
          className="px-4 py-2 bg-blue-600 text-white font-medium text-sm rounded hover:bg-blue-700 transition-colors cursor-pointer shadow-sm mt-4"
          style={{fontFamily: 'Poppins, sans-serif'}}
        >
          🔄 Refresh
        </button>
      </div>

      {/* RSI Panel */}
      {activeIndicators.includes('rsi') && chartData.length > 0 && (
        <div className="bg-white p-4 shadow-sm">
          <h3 className="text-sm font-medium text-gray-700 mb-2" style={{fontFamily: 'Poppins, sans-serif'}}>
            📊 RSI (14) - Relative Strength Index
          </h3>
          <div className="flex justify-center">
            <svg width={1600} height={150} className="bg-white border border-gray-200 rounded-lg">
            {/* Overbought Zone (>70) - Red background */}
            <rect
              x={60}
              y={5}
              width={1450}
              height={51}
              fill="rgba(239, 68, 68, 0.1)"
              stroke="rgba(239, 68, 68, 0.3)"
              strokeWidth="1"
              rx="3"
            />
            <text x={65} y={18} fontSize="10" fill="#ef4444" fontFamily="Poppins, sans-serif" fontWeight="600">
              OVERBOUGHT
            </text>
            
            {/* Oversold Zone (<30) - Green background */}
            <rect
              x={60}
              y={104}
              width={1450}
              height={40}
              fill="rgba(16, 185, 129, 0.1)"
              stroke="rgba(16, 185, 129, 0.3)"
              strokeWidth="1"
              rx="3"
            />
            <text x={65} y={117} fontSize="10" fill="#10b981" fontFamily="Poppins, sans-serif" fontWeight="600">
              OVERSOLD
            </text>
            
            {/* RSI grid lines */}
            {[30, 50, 70].map(level => (
              <g key={level}>
                <line x1={60} y1={140 - level * 1.2} x2={1510} y2={140 - level * 1.2} stroke={level === 30 ? '#10b981' : level === 70 ? '#ef4444' : '#9ca3af'} strokeDasharray="4 4" strokeWidth={level === 30 || level === 70 ? 2 : 1} opacity={level === 30 || level === 70 ? 0.8 : 0.6} />
                <text x={1520} y={140 - level * 1.2 + 4} fontSize="11" fill={level === 30 ? '#10b981' : level === 70 ? '#ef4444' : '#6b7280'} fontFamily="Poppins, sans-serif" fontWeight="600">{level}</text>
              </g>
            ))}
            {/* RSI line */}
            {(() => {
              const startIndex = Math.max(0, chartData.length - visibleCandles - panOffset);
              const endIndex = Math.min(chartData.length, startIndex + visibleCandles);
              const visData = chartData.slice(startIndex, endIndex);
              const rsiData = calculateRSI(visData, 14);
              const scaleX = (i) => 60 + (i / visData.length) * 1450;
              
              return (
                <polyline
                  points={rsiData.map((val, i) => val ? `${scaleX(i)},${140 - val * 1.2}` : null).filter(p => p).join(' ')}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            })()}
          </svg>
          </div>
        </div>
      )}

      {/* MACD Panel */}
      {activeIndicators.includes('macd') && chartData.length > 0 && (
        <div className="bg-white p-4 shadow-sm">
          <h3 className="text-sm font-medium text-gray-700 mb-2" style={{fontFamily: 'Poppins, sans-serif'}}>
            📊 MACD (12, 26, 9)
          </h3>
          <div className="flex justify-center">
            <svg width={1600} height={150} className="bg-white border border-gray-200 rounded-lg">
            {/* Zero line */}
            <line x1={60} y1={75} x2={1510} y2={75} stroke="#9ca3af" strokeWidth="1" strokeDasharray="4 4" opacity="0.6" />
            {(() => {
              const startIndex = Math.max(0, chartData.length - visibleCandles - panOffset);
              const endIndex = Math.min(chartData.length, startIndex + visibleCandles);
              const visData = chartData.slice(startIndex, endIndex);
              const macdData = calculateMACD(visData, 12, 26, 9);
              const scaleX = (i) => 60 + (i / visData.length) * 1450;
              const maxMacd = Math.max(...macdData.macdLine.filter(v => v !== null).map(Math.abs), 1);
              const scaleY = (val) => 75 - (val / maxMacd) * 60;
              
              return (
                <>
                  {/* Histogram */}
                  {macdData.histogram.map((val, i) => {
                    if (val === null) return null;
                    const histHeight = Math.abs(val / maxMacd) * 60;
                    return (
                      <rect
                        key={i}
                        x={scaleX(i)}
                        y={val >= 0 ? scaleY(val) : 75}
                        width={Math.max(2, 1280 / visData.length * 0.7)}
                        height={histHeight}
                        fill={val >= 0 ? '#10b98166' : '#ef444466'}
                      />
                    );
                  })}
                  {/* MACD line */}
                  <polyline
                    points={macdData.macdLine.map((val, i) => val !== null ? `${scaleX(i)},${scaleY(val)}` : null).filter(p => p).join(' ')}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="2"
                  />
                  {/* Signal line */}
                  <polyline
                    points={macdData.signalLine.map((val, i) => val !== null ? `${scaleX(i)},${scaleY(val)}` : null).filter(p => p).join(' ')}
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="2"
                  />
                </>
              );
            })()}
          </svg>
          </div>
        </div>
      )}
    </div>
  );
}

