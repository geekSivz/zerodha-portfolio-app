const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { spawn } = require('child_process');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// MCP Client instance
let mcpClient = null;
let mcpProcess = null;
let authorizationComplete = false;

// Initialize MCP connection
async function initializeMCP() {
  try {
    console.log('\n🔄 Initializing Kite MCP connection...');
    console.log('📍 MCP URL:', process.env.KITE_MCP_URL || 'https://mcp.kite.trade/mcp');
    
    const transport = new StdioClientTransport({
      command: 'npx',
      args: ['-y', 'mcp-remote', process.env.KITE_MCP_URL || 'https://mcp.kite.trade/mcp']
    });

    mcpClient = new Client({
      name: 'zerodha-portfolio-app',
      version: '1.0.0'
    }, {
      capabilities: {}
    });

    await mcpClient.connect(transport);
    console.log('✅ Connected to Kite MCP');
    
    // List available tools
    try {
      const tools = await mcpClient.listTools();
      console.log('📋 Available Kite MCP tools:', tools.tools.map(t => t.name).join(', '));
      authorizationComplete = true;
    } catch (error) {
      console.log('⚠️  MCP connected but tools not accessible yet');
      console.log('🔐 You need to authorize your Zerodha account');
      console.log('\n📝 AUTHORIZATION STEPS:');
      console.log('   1. The Kite MCP will prompt for authorization');
      console.log('   2. A URL will appear - click it or copy to browser');
      console.log('   3. Login with your Zerodha credentials');
      console.log('   4. Authorize the application');
      console.log('   5. Return here and the connection will be complete\n');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Failed to connect to Kite MCP:', error.message);
    console.log('\n🔧 TROUBLESHOOTING:');
    console.log('   • Make sure Node.js is installed: node --version');
    console.log('   • Check internet connection');
    console.log('   • Try running: npx -y mcp-remote https://mcp.kite.trade/mcp');
    console.log('');
    return false;
  }
}

// Check if error is authorization related
function isAuthorizationError(error) {
  const errorStr = error?.message?.toLowerCase() || '';
  return errorStr.includes('auth') || 
         errorStr.includes('unauthorized') || 
         errorStr.includes('permission') ||
         errorStr.includes('failed to execute');
}

// Fallback instruments list when MCP search fails
function getFallbackInstruments(query) {
  const allInstruments = [
    // Indices
    { instrument_token: 256265, tradingsymbol: 'NIFTY 50', name: 'NIFTY 50', exchange: 'NSE' },
    { instrument_token: 260105, tradingsymbol: 'NIFTY BANK', name: 'NIFTY BANK', exchange: 'NSE' },
    
    // Popular Stocks
    { instrument_token: 738561, tradingsymbol: 'RELIANCE', name: 'Reliance Industries Ltd', exchange: 'NSE' },
    { instrument_token: 492033, tradingsymbol: 'TCS', name: 'Tata Consultancy Services Ltd', exchange: 'NSE' },
    { instrument_token: 3861249, tradingsymbol: 'HDFCBANK', name: 'HDFC Bank Ltd', exchange: 'NSE' },
    { instrument_token: 1270529, tradingsymbol: 'INFY', name: 'Infosys Ltd', exchange: 'NSE' },
    { instrument_token: 2953217, tradingsymbol: 'ICICIBANK', name: 'ICICI Bank Ltd', exchange: 'NSE' },
    { instrument_token: 341249, tradingsymbol: 'SBIN', name: 'State Bank of India', exchange: 'NSE' },
    { instrument_token: 4267265, tradingsymbol: 'BHARTIARTL', name: 'Bharti Airtel Ltd', exchange: 'NSE' },
    { instrument_token: 2939649, tradingsymbol: 'ITC', name: 'ITC Ltd', exchange: 'NSE' },
    { instrument_token: 1895937, tradingsymbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank Ltd', exchange: 'NSE' },
    { instrument_token: 779521, tradingsymbol: 'LT', name: 'Larsen & Toubro Ltd', exchange: 'NSE' },
    { instrument_token: 60417, tradingsymbol: 'AXISBANK', name: 'Axis Bank Ltd', exchange: 'NSE' },
    { instrument_token: 2181889, tradingsymbol: 'HINDUNILVR', name: 'Hindustan Unilever Ltd', exchange: 'NSE' },
    { instrument_token: 1346049, tradingsymbol: 'MARUTI', name: 'Maruti Suzuki India Ltd', exchange: 'NSE' },
    { instrument_token: 5215745, tradingsymbol: 'TATAMOTORS', name: 'Tata Motors Ltd', exchange: 'NSE' },
    { instrument_token: 225537, tradingsymbol: 'WIPRO', name: 'Wipro Ltd', exchange: 'NSE' },
    { instrument_token: 3465729, tradingsymbol: 'TATASTEEL', name: 'Tata Steel Ltd', exchange: 'NSE' },
    { instrument_token: 2763265, tradingsymbol: 'ASIANPAINT', name: 'Asian Paints Ltd', exchange: 'NSE' }
  ];
  
  const q = query.toLowerCase();
  return allInstruments.filter(inst => 
    inst.tradingsymbol.toLowerCase().includes(q) ||
    inst.name.toLowerCase().includes(q)
  );
}

// API Routes

// Health check
app.get('/api/health', (req, res) => {
  const healthData = { 
    status: 'ok', 
    mcpConnected: mcpClient !== null,
    authorized: authorizationComplete,
    timestamp: new Date().toISOString()
  };
  
  console.log('📊 Health check requested:', healthData);
  
  res.json(healthData);
});

// Login/Authorization endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    if (!mcpClient) {
      return res.status(503).json({ 
        error: 'MCP client not initialized',
        message: 'Backend server is starting up. Please wait and try again.'
      });
    }

    console.log('\n🔐 Authorization request received');
    console.log('⏰ Timestamp:', new Date().toISOString());
    console.log('📝 Calling MCP login tool...');
    
    // Add timeout for the login call
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Login request timed out after 30 seconds')), 30000);
    });
    
    const loginPromise = mcpClient.callTool({
      name: 'login',
      arguments: {}
    });
    
    const result = await Promise.race([loginPromise, timeoutPromise]);
    
    console.log('📬 Login response received from MCP');
    console.log('📊 Response type:', typeof result);
    console.log('📋 Full response:', JSON.stringify(result, null, 2));
    
    // Try multiple methods to extract the authorization URL
    let authorizationUrl = null;
    
    // Method 1: Check content array
    if (result?.content && Array.isArray(result.content)) {
      for (const item of result.content) {
        if (item.type === 'text' && item.text) {
          console.log('📄 Checking text content:', item.text);
          
          // Look for URLs in the text
          const urlMatch = item.text.match(/(https?:\/\/[^\s\)]+)/);
          if (urlMatch) {
            authorizationUrl = urlMatch[1];
            console.log('✅ Found URL in text:', authorizationUrl);
            break;
          }
        }
      }
    }
    
    // Method 2: Check if result itself contains a URL
    if (!authorizationUrl && typeof result === 'string') {
      const urlMatch = result.match(/(https?:\/\/[^\s\)]+)/);
      if (urlMatch) {
        authorizationUrl = urlMatch[1];
        console.log('✅ Found URL in result string:', authorizationUrl);
      }
    }
    
    // Method 3: Check for authorizationUrl property
    if (!authorizationUrl && result?.authorizationUrl) {
      authorizationUrl = result.authorizationUrl;
      console.log('✅ Found authorizationUrl property:', authorizationUrl);
    }
    
    // Method 4: Check for url property
    if (!authorizationUrl && result?.url) {
      authorizationUrl = result.url;
      console.log('✅ Found url property:', authorizationUrl);
    }
    
    if (!authorizationUrl) {
      console.error('❌ Could not find authorization URL in response');
      return res.status(500).json({ 
        error: 'No authorization URL found',
        message: 'The MCP server did not return an authorization URL. Please check the backend logs.',
        rawResponse: result
      });
    }
    
    // Clean up the URL (remove escape characters, trailing punctuation, etc.)
    authorizationUrl = authorizationUrl
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '')
      .replace(/[.,;)\]]+$/, '')
      .trim();
    
    // Don't modify the redirect_url - MCP handles it internally
    
    console.log('🎯 Final authorization URL:', authorizationUrl);
    
    res.json({ 
      success: true, 
      authorizationUrl,
      message: 'Please complete authorization in the popup window'
    });
  } catch (error) {
    console.error('❌ Error during login:', error);
    res.status(500).json({ 
      error: 'Failed to initiate login', 
      message: error.message 
    });
  }
});

// Authorization callback - MCP SDK needs to handle this
app.get('/api/auth/callback', async (req, res) => {
  console.log('📨 Authorization callback received');
  console.log('Request token:', req.query.request_token);
  
  // MCP SDK should handle the token internally
  // Just mark as complete
  authorizationComplete = true;
  
  // Send success page that auto-closes immediately
  res.send(`
    <html>
      <head>
        <title>Authorization Complete</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            text-align: center; 
            padding: 50px;
            background: white;
          }
          h1 { color: #10b981; font-size: 24px; margin-bottom: 10px; }
          p { color: #666; font-size: 14px; }
          .loader { 
            border: 4px solid #f3f3f3;
            border-top: 4px solid #3b82f6;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 20px auto;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      </head>
      <body>
        <h1>✓ Authorization Successful!</h1>
        <div class="loader"></div>
        <p>Closing window automatically...</p>
        <script>
          // Try multiple methods to close the window
          setTimeout(function() {
            window.close();
          }, 500);
          
          setTimeout(function() {
            window.opener = null;
            window.open('', '_self');
            window.close();
          }, 1000);
          
          setTimeout(function() {
            window.location = 'about:blank';
            setTimeout(function() { window.close(); }, 100);
          }, 1500);
        </script>
      </body>
    </html>
  `);
});

// Get portfolio holdings
app.get('/api/portfolio/holdings', async (req, res) => {
  try {
    if (!mcpClient) {
      return res.status(503).json({ 
        error: 'MCP client not initialized',
        message: 'Backend server is starting up. Please wait and try again.'
      });
    }

    console.log('📊 Fetching holdings from Kite MCP...');
    console.log('🔐 Current authorization status:', authorizationComplete);
    console.log('⏰ Timestamp:', new Date().toISOString());
    
    // Increase timeout to 45 seconds (MCP calls can be slow)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timed out after 45 seconds')), 45000);
    });
    
    const holdingsPromise = mcpClient.callTool({
      name: 'get_holdings',
      arguments: {}
    });
    
    console.log('⏳ Waiting for MCP response... (max 45 seconds)');
    
    let result;
    try {
      result = await Promise.race([holdingsPromise, timeoutPromise]);
    } catch (timeoutError) {
      console.error('⏱️  Request timed out:', timeoutError.message);
      return res.status(504).json({ 
        error: 'Request timeout',
        message: 'The request to Kite MCP timed out. The service might be slow or unavailable. Please try again.',
        needsRetry: true
      });
    }

    console.log('📬 Holdings response received from MCP');
    
    // Check if this is an authorization error
    if (result?.isError) {
      console.log('⚠️ MCP returned isError: true');
      const errorText = result?.content?.[0]?.text || 'Unknown error';
      console.log('Error text:', errorText);
      
      // Check if it's an authorization error
      if (errorText.includes('Failed to execute') || errorText.includes('authorization') || errorText.includes('Unauthorized')) {
        console.error('⚠️  Authorization required or expired');
        return res.status(401).json({ 
          error: 'Authorization required',
          message: 'Please authorize your Zerodha account first. Click "Login to Zerodha" button.',
          needsAuth: true,
          data: result
        });
      }
    }
    
    console.log('📋 Response type:', typeof result);
    console.log('📊 Full response:', JSON.stringify(result, null, 2));

    // Check for explicit error in content
    if (result?.content && Array.isArray(result.content)) {
      const firstContent = result.content[0];
      if (firstContent?.type === 'text' && firstContent.text?.includes('Failed')) {
        console.error('⚠️  Authorization required or expired');
        return res.status(401).json({ 
          error: 'Authorization required',
          message: 'Please authorize your Zerodha account first. Click "Login to Zerodha" button.',
          needsAuth: true,
          data: result
        });
      }
    }

    console.log('✅ Holdings fetched successfully');
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('❌ Error fetching holdings:', error.message);
    
    // Check if it's an authorization error
    if (isAuthorizationError(error)) {
      return res.status(401).json({ 
        error: 'Authorization required',
        message: 'Your Zerodha authorization has expired or is invalid. Please login again.',
        needsAuth: true
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to fetch holdings', 
      message: error.message 
    });
  }
});

// Get portfolio positions
app.get('/api/portfolio/positions', async (req, res) => {
  try {
    if (!mcpClient) {
      return res.status(503).json({ 
        error: 'MCP client not initialized',
        message: 'Backend server is starting up. Please wait and try again.'
      });
    }

    console.log('💼 Fetching positions...');
    
    // Add timeout wrapper
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timed out after 30 seconds')), 30000);
    });
    
    const positionsPromise = mcpClient.callTool({
      name: 'get_positions',
      arguments: {}
    });
    
    const result = await Promise.race([positionsPromise, timeoutPromise]);

    if (result?.isError || (result?.content && result.content[0]?.text?.includes('Failed'))) {
      console.error('⚠️  Authorization required or expired');
      return res.status(401).json({ 
        error: 'Authorization required',
        message: 'Please authorize your Zerodha account first. Click "Login to Zerodha" button.',
        needsAuth: true,
        data: result
      });
    }

    console.log('✅ Positions fetched successfully');
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('❌ Error fetching positions:', error.message);
    
    if (isAuthorizationError(error)) {
      return res.status(401).json({ 
        error: 'Authorization required',
        message: 'Your Zerodha authorization has expired. Please login again.',
        needsAuth: true
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to fetch positions', 
      message: error.message 
    });
  }
});

// Get quote for a symbol or instrument token
app.get('/api/market/quote/:symbol', async (req, res) => {
  try {
    if (!mcpClient) {
      return res.status(503).json({ error: 'MCP client not initialized' });
    }

    const { symbol } = req.params;
    console.log(`📈 Fetching quote for ${symbol}...`);
    
    // Try to parse as instrument_token (number) or use as symbol (string)
    const isToken = !isNaN(parseInt(symbol));
    
    const result = await mcpClient.callTool({
      name: 'get_quote',
      arguments: isToken ? { instrument_tokens: [parseInt(symbol)] } : { symbols: [symbol] }
    });

    if (result?.isError) {
      return res.status(401).json({ 
        error: 'Authorization required',
        needsAuth: true,
        data: result
      });
    }

    console.log('📦 Quote result:', JSON.stringify(result).substring(0, 300));

    // Parse the response
    let quoteData = result;
    
    if (result?.content && Array.isArray(result.content) && result.content[0]?.text) {
      try {
        quoteData = JSON.parse(result.content[0].text);
      } catch (e) {
        console.warn('Could not parse quote response as JSON');
      }
    }

    // Extract the actual quote data
    let quote = quoteData;
    if (quoteData.data) {
      quote = quoteData.data;
    }
    
    // If it's an object with the token/symbol as key, extract it
    if (typeof quote === 'object' && !quote.last_price) {
      const firstKey = Object.keys(quote)[0];
      if (firstKey && quote[firstKey]) {
        quote = quote[firstKey];
      }
    }

    res.json({ success: true, data: quote });
  } catch (error) {
    console.error('Error fetching quote:', error);
    res.status(500).json({ 
      error: 'Failed to fetch quote', 
      message: error.message 
    });
  }
});

// Get historical OHLC data
app.get('/api/market/historical/:instrument_token', async (req, res) => {
  try {
    if (!mcpClient) {
      return res.status(503).json({ 
        error: 'MCP client not initialized',
        message: 'Backend server is starting up. Please wait and try again.'
      });
    }

    const { instrument_token } = req.params;
    const { interval = 'day', from, to } = req.query;
    
    console.log(`📊 Fetching historical data for instrument ${instrument_token}...`);
    console.log(`📅 From: ${from}, To: ${to}, Interval: ${interval}`);
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timed out')), 30000);
    });
    
    const historicalPromise = mcpClient.callTool({
      name: 'get_historical_data',
      arguments: {
        instrument_token: parseInt(instrument_token),
        from_date: from,
        to_date: to,
        interval: interval
      }
    });
    
    const result = await Promise.race([historicalPromise, timeoutPromise]);

    console.log('📦 MCP Response structure:', JSON.stringify(result).substring(0, 200));

    if (result?.isError || (result?.content && result.content[0]?.text?.includes('Failed'))) {
      console.error('⚠️  MCP returned error or failed message');
      const errorMessage = result?.content?.[0]?.text || 'Historical data not available';
      console.error('Error content:', errorMessage);
      console.error('Full MCP error result:', JSON.stringify(result, null, 2));
      
      // Check if it's an authorization error
      const needsAuth = errorMessage.toLowerCase().includes('authorization') || 
                        errorMessage.toLowerCase().includes('auth') ||
                        errorMessage.toLowerCase().includes('login');
      
      return res.status(needsAuth ? 401 : 400).json({ 
        success: false,
        error: 'Data unavailable',
        message: `Unable to fetch historical data: ${errorMessage}`,
        instrument_token,
        interval,
        needsAuth,
        mcpError: errorMessage
      });
    }

    // Parse MCP response - it might be in content[0].text as JSON string
    let parsedData = result;
    
    console.log('📦 Raw MCP result type:', typeof result);
    console.log('📦 Raw MCP result keys:', Object.keys(result || {}));
    console.log('📦 Has content array?', result?.content ? 'yes' : 'no');
    
    if (result?.content && Array.isArray(result.content) && result.content[0]?.text) {
      try {
        const textContent = result.content[0].text;
        console.log('📝 MCP text content (first 500 chars):', textContent.substring(0, 500));
        parsedData = JSON.parse(textContent);
        console.log('✅ Parsed MCP text content successfully');
        console.log('📦 Parsed data keys:', Object.keys(parsedData || {}));
      } catch (e) {
        console.warn('⚠️ Could not parse MCP content as JSON:', e.message);
        console.log('📝 Raw text content:', result.content[0].text.substring(0, 200));
      }
    }

    // Try to extract candles from various possible locations
    let candles = null;
    
    if (parsedData.candles && Array.isArray(parsedData.candles)) {
      candles = parsedData.candles;
      console.log(`✅ Found candles array (${candles.length} candles) at parsedData.candles`);
    } else if (parsedData.data?.candles && Array.isArray(parsedData.data.candles)) {
      candles = parsedData.data.candles;
      console.log(`✅ Found candles array (${candles.length} candles) at parsedData.data.candles`);
    } else if (Array.isArray(parsedData)) {
      candles = parsedData;
      console.log(`✅ parsedData is array (${candles.length} items)`);
    } else {
      console.error('❌ Could not find candles in response!');
      console.error('Parsed data structure:', JSON.stringify(parsedData, null, 2).substring(0, 500));
      
      return res.status(500).json({
        error: 'Invalid data structure from MCP',
        message: 'Could not extract candles from MCP response',
        receivedKeys: Object.keys(parsedData || {}),
        sample: JSON.stringify(parsedData).substring(0, 200)
      });
    }

    console.log('✅ Historical data fetched successfully');
    
    // Return in a consistent format
    res.json({ 
      success: true, 
      data: {
        candles: candles
      }
    });
  } catch (error) {
    console.error('❌ Error fetching historical data:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Request details:', {
      instrument_token,
      interval,
      from,
      to
    });
    
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch historical data', 
      message: error.message || 'Unknown error occurred',
      details: error.toString(),
      instrument_token,
      interval,
      requestParams: { from, to }
    });
  }
});

// Get account margins
app.get('/api/account/margins', async (req, res) => {
  try {
    if (!mcpClient) {
      return res.status(503).json({ 
        error: 'MCP client not initialized',
        message: 'Backend server is starting up. Please wait and try again.'
      });
    }

    console.log('💰 Fetching margins...');
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timed out after 30 seconds')), 30000);
    });
    
    const marginsPromise = mcpClient.callTool({
      name: 'get_margins',
      arguments: {}
    });
    
    const result = await Promise.race([marginsPromise, timeoutPromise]);

    if (result?.isError || (result?.content && result.content[0]?.text?.includes('Failed'))) {
      console.error('⚠️  Authorization required or expired');
      return res.status(401).json({ 
        error: 'Authorization required',
        message: 'Please authorize your Zerodha account first. Click "Login to Zerodha" button.',
        needsAuth: true,
        data: result
      });
    }

    console.log('✅ Margins fetched successfully');
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('❌ Error fetching margins:', error.message);
    
    if (isAuthorizationError(error)) {
      return res.status(401).json({ 
        error: 'Authorization required',
        message: 'Your Zerodha authorization has expired. Please login again.',
        needsAuth: true
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to fetch margins', 
      message: error.message 
    });
  }
});

// Search instruments from Zerodha
app.get('/api/instruments/search', async (req, res) => {
  try {
    if (!mcpClient) {
      return res.status(503).json({ 
        error: 'MCP client not initialized',
        message: 'Backend server is starting up. Please wait and try again.'
      });
    }

    const { q } = req.query; // Search query
    
    if (!q || q.length < 2) {
      return res.json({ success: true, instruments: [] });
    }

    // Clean up the query - remove extra spaces and prepare for search
    const cleanQuery = q.trim().toUpperCase();
    console.log(`🔍 Searching instruments for: "${cleanQuery}"`);
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Search timed out')), 10000);
    });
    
    let result;
    try {
      // Try the search with the original query
      const searchPromise = mcpClient.callTool({
        name: 'search_instruments',
        arguments: {
          query: cleanQuery
        }
      });
      
      result = await Promise.race([searchPromise, timeoutPromise]);
    } catch (searchError) {
      console.error('⚠️  MCP search failed:', searchError.message);
      
      // Return fallback popular instruments if search fails
      const fallbackInstruments = getFallbackInstruments(cleanQuery);
      if (fallbackInstruments.length > 0) {
        console.log(`💡 Using fallback: ${fallbackInstruments.length} instruments`);
        return res.json({ 
          success: true, 
          instruments: fallbackInstruments, 
          query: cleanQuery,
          fallback: true 
        });
      }
      
      throw searchError;
    }

    if (result?.isError) {
      console.error('⚠️  Instrument search error');
      return res.status(401).json({ 
        error: 'Authorization required or search failed',
        needsAuth: true,
        data: result
      });
    }

    // Parse instruments from response
    let instruments = [];
    if (result?.content && Array.isArray(result.content)) {
      const content = result.content[0];
      if (content?.type === 'text' && content.text) {
        try {
          instruments = JSON.parse(content.text);
          console.log(`✅ Found ${instruments.length} instruments for "${cleanQuery}"`);
          
          // Sort results: Exact matches first, then by relevance
          instruments.sort((a, b) => {
            const aSymbol = a.tradingsymbol || '';
            const bSymbol = b.tradingsymbol || '';
            const aStartsWith = aSymbol.toUpperCase().startsWith(cleanQuery);
            const bStartsWith = bSymbol.toUpperCase().startsWith(cleanQuery);
            
            if (aStartsWith && !bStartsWith) return -1;
            if (!aStartsWith && bStartsWith) return 1;
            
            // If both options, sort by expiry and strike
            if (a.instrument_type && b.instrument_type) {
              if (a.expiry !== b.expiry) {
                return new Date(a.expiry) - new Date(b.expiry);
              }
              return (a.strike || 0) - (b.strike || 0);
            }
            
            return 0;
          });
        } catch (e) {
          console.error('Failed to parse instruments:', e);
          console.log('Raw response:', content.text?.substring(0, 500));
        }
      }
    }

    res.json({ success: true, instruments, query: cleanQuery });
  } catch (error) {
    console.error('❌ Error searching instruments:', error.message);
    res.status(500).json({ 
      error: 'Failed to search instruments', 
      message: error.message 
    });
  }
});

// List all available MCP tools
app.get('/api/mcp/tools', async (req, res) => {
  try {
    if (!mcpClient) {
      return res.status(503).json({ error: 'MCP client not initialized' });
    }

    const tools = await mcpClient.listTools();
    res.json({ success: true, tools: tools.tools });
  } catch (error) {
    console.error('Error listing tools:', error);
    res.status(500).json({ 
      error: 'Failed to list tools', 
      message: error.message 
    });
  }
});

// Diagnostic endpoint
app.get('/api/diagnostic', async (req, res) => {
  const diagnostic = {
    timestamp: new Date().toISOString(),
    server: {
      port: PORT,
      nodeVersion: process.version,
      platform: process.platform
    },
    mcp: {
      connected: mcpClient !== null,
      authorized: authorizationComplete,
      url: process.env.KITE_MCP_URL || 'https://mcp.kite.trade/mcp'
    },
    environment: {
      clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
      hasEnvFile: require('fs').existsSync('.env')
    }
  };
  
  // Try to list tools if connected
  if (mcpClient) {
    try {
      const tools = await mcpClient.listTools();
      diagnostic.mcp.availableTools = tools.tools.map(t => ({
        name: t.name,
        description: t.description
      }));
    } catch (error) {
      diagnostic.mcp.toolsError = error.message;
    }
  }
  
  res.json(diagnostic);
});

// Start server
async function startServer() {
  try {
    // Initialize MCP first
    await initializeMCP();
    
    // Start Express server
    app.listen(PORT, () => {
      console.log(`\n✅ Server running on port ${PORT}`);
      console.log(`📍 API: http://localhost:${PORT}`);
      console.log(`🔐 Authorization status: ${authorizationComplete ? 'Authorized ✅' : 'Pending ⏳'}`);
      console.log('\n📋 Available endpoints:');
      console.log('   GET  /api/health');
      console.log('   POST /api/auth/login');
      console.log('   GET  /api/auth/callback');
      console.log('   GET  /api/portfolio/holdings');
      console.log('   GET  /api/portfolio/positions');
      console.log('   GET  /api/market/quote/:symbol');
      console.log('   GET  /api/market/historical/:instrument_token');
      console.log('   GET  /api/account/margins');
      console.log('   GET  /api/instruments/search?q=<query>');
      console.log('   GET  /api/mcp/tools');
      console.log('   GET  /api/diagnostic');
      console.log('\n🔄 Live Updates:');
      console.log('   Holdings, Positions, Margins: Auto-refresh every 30s');
      console.log('   Charts: Auto-refresh every 60s\n');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down gracefully...');
  if (mcpClient) {
    mcpClient.close();
  }
  process.exit(0);
});

startServer();
