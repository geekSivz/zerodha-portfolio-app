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

// Check if error is session related (session expired/invalid)
function isSessionError(error) {
  const errorStr = error?.message?.toLowerCase() || '';
  const errorCode = error?.code;
  return errorStr.includes('invalid session') || 
         errorStr.includes('session id') ||
         errorStr.includes('session expired') ||
         errorStr.includes('session invalid') ||
         (errorCode && errorCode === -32603); // Internal error often indicates session issues
}

// Reconnect MCP when session expires
async function reconnectMCP() {
  console.log('\n🔄 Reconnecting MCP due to session error...');
  try {
    // Close existing connection
    if (mcpClient) {
      try {
        await mcpClient.close();
      } catch (e) {
        // Ignore errors when closing
      }
      mcpClient = null;
    }
    
    // Small delay before reconnecting
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Reinitialize
    const reconnected = await initializeMCP();
    if (reconnected) {
      console.log('✅ MCP reconnected successfully');
      return true;
    } else {
      console.error('❌ Failed to reconnect MCP');
      return false;
    }
  } catch (error) {
    console.error('❌ Error reconnecting MCP:', error.message);
    return false;
  }
}

// Safe MCP call wrapper that handles session errors
async function safeMCPCall(callFunction, maxRetries = 1) {
  let lastError = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (!mcpClient) {
        console.warn('⚠️ MCP client not initialized, attempting to initialize...');
        await initializeMCP();
        if (!mcpClient) {
          throw new Error('MCP client initialization failed');
        }
      }
      
      return await callFunction();
    } catch (error) {
      lastError = error;
      const errorMessage = error?.message || '';
      
      // Check if it's a session error
      if (isSessionError(error) && attempt < maxRetries) {
        console.warn(`⚠️ Session error detected (attempt ${attempt + 1}/${maxRetries + 1}): ${errorMessage}`);
        console.log('🔄 Attempting to reconnect MCP...');
        
        // Reconnect MCP
        const reconnected = await reconnectMCP();
        if (reconnected) {
          // Wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue; // Retry the call
        } else {
          throw new Error('Failed to reconnect MCP after session error');
        }
      }
      
      // If not a session error or retries exhausted, throw the error
      throw error;
    }
  }
  
  // Should not reach here, but just in case
  throw lastError || new Error('MCP call failed after retries');
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
    
    // Use safeMCPCall to handle session errors
    let result;
    try {
      result = await safeMCPCall(async () => {
        // Increase timeout to 45 seconds (MCP calls can be slow)
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Request timed out after 45 seconds')), 45000);
        });
        
        const holdingsPromise = mcpClient.callTool({
          name: 'get_holdings',
          arguments: {}
        });
        
        console.log('⏳ Waiting for MCP response... (max 45 seconds)');
        return await Promise.race([holdingsPromise, timeoutPromise]);
      });
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
    
    // Use safeMCPCall to handle session errors
    const result = await safeMCPCall(async () => {
      // Add timeout wrapper
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out after 30 seconds')), 30000);
      });
      
      const positionsPromise = mcpClient.callTool({
        name: 'get_positions',
        arguments: {}
      });
      
      return await Promise.race([positionsPromise, timeoutPromise]);
    });

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
    
    // Try to parse as instrument_token (number) or use as symbol (string)
    const isToken = !isNaN(parseInt(symbol));
    
    try {
      const result = await safeMCPCall(async () => {
        return await mcpClient.callTool({
          name: 'get_quote',
          arguments: isToken ? { instrument_tokens: [parseInt(symbol)] } : { symbols: [symbol] }
        });
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

      return res.json({ success: true, data: quote });
    } catch (toolError) {
      // Check if it's a "tool not found" error
      const errorMessage = toolError.message || '';
      const errorCode = toolError.code;
      
      if (errorCode === -32602 || 
          errorMessage.includes('tool not found') || 
          errorMessage.includes("tool 'get_quote' not found")) {
        // Tool is not available - return gracefully without error log
        return res.status(200).json({
          success: false,
          error: 'Tool not available',
          message: 'get_quote tool is not available in MCP. Please use latest candle close price.',
          toolUnavailable: true
        });
      }
      
      // For other errors, log and return error
      throw toolError; // Re-throw to be caught by outer catch
    }
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
    let { interval = 'day', from, to } = req.query;
    
    // Decode URL-encoded parameters (they come encoded from client)
    try {
      if (from) from = decodeURIComponent(from);
      if (to) to = decodeURIComponent(to);
      if (interval) interval = decodeURIComponent(interval);
    } catch (decodeError) {
      console.error('❌ Error decoding URL parameters:', decodeError);
      return res.status(400).json({
        success: false,
        error: 'Invalid URL encoding',
        message: 'Failed to decode URL parameters',
        error: decodeError.message
      });
    }
    
    // Validate date format: should be "YYYY-MM-DD HH:MM:SS"
    if (from && !from.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format',
        message: 'from_date must be in format YYYY-MM-DD HH:MM:SS',
        received: from
      });
    }
    if (to && !to.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format',
        message: 'to_date must be in format YYYY-MM-DD HH:MM:SS',
        received: to
      });
    }
    
    console.log(`📊 Fetching historical data for instrument ${instrument_token}...`);
    console.log(`📅 From: ${from}, To: ${to}, Interval: ${interval}`);
    
    // Map problematic intervals to fallback intervals
    const intervalMap = {
      '240minute': ['60minute', '1h', 'hour', '30minute', '15minute', '5minute', 'day'], // 4h not supported, try hourly, smaller, or daily
      '4h': ['240minute', '60minute', '1h', 'hour', '30minute', '15minute', '5minute', 'day'], // Alias for 240minute
      'month': ['day', '1D', 'week', '60minute', '1h', 'hour', '30minute'], // Monthly not supported, try daily, weekly, or hourly
      'monthly': ['month', 'day', '1D', 'week', '60minute', '1h', 'hour', '30minute'] // Alternative spelling
    };
    
    // Get fallback intervals for the requested interval
    const fallbackIntervals = intervalMap[interval] || [];
    const intervalsToTry = fallbackIntervals.length > 0 ? [interval, ...fallbackIntervals] : [interval];
    
    console.log(`🔄 Will try intervals in order: ${intervalsToTry.join(' → ')}`);
    
    let result = null;
    let lastError = null;
    let usedInterval = interval;
    
    // Try intervals in order: original, then fallbacks
    for (const tryInterval of intervalsToTry) {
      try {
        console.log(`📊 Trying interval: ${tryInterval}...`);
        
        // Use safeMCPCall to handle session errors
        result = await safeMCPCall(async () => {
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Request timed out')), 30000);
          });
          
          const historicalPromise = mcpClient.callTool({
            name: 'get_historical_data',
            arguments: {
              instrument_token: parseInt(instrument_token),
              from_date: from,
              to_date: to,
              interval: tryInterval
            }
          });
          
          return await Promise.race([historicalPromise, timeoutPromise]);
        });
        
        // Check if result has error
        if (result?.isError) {
          const errorMsg = result?.content?.[0]?.text || 'MCP returned error';
          
          // Check if it's an authorization error - return immediately, don't try fallbacks
          const errorMsgLower = errorMsg.toLowerCase();
          if (errorMsgLower.includes('log in') || errorMsgLower.includes('login') || 
              errorMsgLower.includes('authorization') || errorMsgLower.includes('authorize') ||
              errorMsgLower.includes('unauthorized') || errorMsgLower.includes('auth') ||
              errorMsgLower.includes('please log') || errorMsgLower.includes('login tool')) {
            console.error(`🔒 Authorization error detected: ${errorMsg}`);
            return res.status(401).json({
              success: false,
              error: 'Authorization required',
              message: 'Please login to Zerodha to access historical data.',
              needsAuth: true,
              originalInterval: interval,
              mcpError: errorMsg
            });
          }
          
          console.warn(`⚠️ Interval ${tryInterval} failed: ${errorMsg}`);
          lastError = errorMsg;
          continue; // Try next interval
        }
        
        // Check if result content indicates failure
        if (result?.content && Array.isArray(result.content) && result.content[0]?.text) {
          const textContent = result.content[0].text;
          const textContentLower = textContent.toLowerCase();
          
          // Check if it's an authorization error - return immediately, don't try fallbacks
          if (textContentLower.includes('log in') || textContentLower.includes('login') || 
              textContentLower.includes('authorization') || textContentLower.includes('authorize') ||
              textContentLower.includes('unauthorized') || textContentLower.includes('auth') ||
              textContentLower.includes('please log') || textContentLower.includes('login tool')) {
            console.error(`🔒 Authorization error detected: ${textContent}`);
            return res.status(401).json({
              success: false,
              error: 'Authorization required',
              message: 'Please login to Zerodha to access historical data.',
              needsAuth: true,
              originalInterval: interval,
              mcpError: textContent
            });
          }
          
          if (textContent.includes('Failed') || textContent.includes('failed') || 
              textContent.includes('error') || textContent.includes('Error') ||
              textContent.includes('not supported') || textContent.includes('not available')) {
            console.warn(`⚠️ Interval ${tryInterval} returned error: ${textContent.substring(0, 100)}`);
            lastError = textContent;
            continue; // Try next interval
          }
        }
        
        // Check if we have actual data
        let hasData = false;
        if (result?.content && Array.isArray(result.content) && result.content[0]?.text) {
          try {
            const parsed = JSON.parse(result.content[0].text);
            hasData = parsed?.candles?.length > 0 || 
                     parsed?.data?.candles?.length > 0 || 
                     (Array.isArray(parsed) && parsed.length > 0);
          } catch (e) {
            // Not JSON, check if it's an array directly
            hasData = Array.isArray(result) && result.length > 0;
          }
        } else if (Array.isArray(result)) {
          hasData = result.length > 0;
        }
        
        if (hasData) {
          usedInterval = tryInterval;
          console.log(`✅ Successfully using interval: ${tryInterval}${tryInterval !== interval ? ` (original: ${interval})` : ''}`);
          break; // Success! Exit loop
        } else {
          console.warn(`⚠️ Interval ${tryInterval} returned no data`);
          lastError = 'No data returned';
          continue; // Try next interval
        }
      } catch (error) {
        console.warn(`⚠️ Interval ${tryInterval} threw error: ${error.message}`);
        lastError = error.message;
        continue; // Try next interval
      }
    }
    
    // If all intervals failed, check if it's an authorization error
    if (!result || result?.isError || lastError) {
      const allTried = intervalsToTry.join(', ');
      const finalError = lastError || 'Unknown error';
      const finalErrorLower = finalError.toLowerCase();
      
      // Check if the final error is an authorization error
      if (finalErrorLower.includes('log in') || finalErrorLower.includes('login') || 
          finalErrorLower.includes('authorization') || finalErrorLower.includes('authorize') ||
          finalErrorLower.includes('unauthorized') || finalErrorLower.includes('auth') ||
          finalErrorLower.includes('please log') || finalErrorLower.includes('login tool')) {
        console.error(`🔒 Authorization error detected: ${finalError}`);
        return res.status(401).json({
          success: false,
          error: 'Authorization required',
          message: 'Please login to Zerodha to access historical data.',
          needsAuth: true,
          originalInterval: interval,
          triedIntervals: intervalsToTry,
          mcpError: finalError
        });
      }
      
      // Try emergency fallback: smaller date range with common intervals
      // Sometimes the date range is too large, causing all intervals to fail
      if (finalErrorLower.includes('failed to get historical data') || 
          finalErrorLower.includes('not available') ||
          finalErrorLower.includes('no data')) {
        
        console.log(`🆘 Trying emergency fallback: Smaller date range with common intervals...`);
        
        try {
          // Parse original dates
          const originalFromDate = new Date(from);
          const originalToDate = new Date(to);
          
          // Try with progressively smaller date ranges: 7 days, 3 days, 1 day
          const smallerRanges = [7, 3, 1];
          const emergencyIntervals = ['day', '1D', '60minute', '1h', 'hour', '30minute', '15minute', '5minute', '3minute', 'minute'];
          
          let emergencySuccess = false;
          
          rangeLoop: for (const daysBack of smallerRanges) {
            const emergencyToDate = new Date(originalToDate);
            const emergencyFromDate = new Date(emergencyToDate);
            emergencyFromDate.setDate(emergencyFromDate.getDate() - daysBack);
            
            // Format dates as YYYY-MM-DD HH:MM:SS
            const emergencyFrom = emergencyFromDate.toISOString().split('T')[0] + ' 00:00:00';
            const emergencyTo = emergencyToDate.toISOString().split('T')[0] + ' 23:59:59';
            
            console.log(`🆘 Trying ${daysBack} days range: ${emergencyFrom} to ${emergencyTo}`);
            
            for (const emergencyInterval of emergencyIntervals) {
              // Skip if we already tried this interval
              if (intervalsToTry.includes(emergencyInterval)) continue;
              
              try {
                console.log(`🆘 Trying emergency: ${daysBack} days with interval ${emergencyInterval}...`);
                
                // Use safeMCPCall for emergency fallback too
                const emergencyResult = await safeMCPCall(async () => {
                  const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Request timed out')), 30000);
                  });
                  
                  const emergencyPromise = mcpClient.callTool({
                    name: 'get_historical_data',
                    arguments: {
                      instrument_token: parseInt(instrument_token),
                      from_date: emergencyFrom,
                      to_date: emergencyTo,
                      interval: emergencyInterval
                    }
                  });
                  
                  return await Promise.race([emergencyPromise, timeoutPromise]);
                });
                
                // Check if we got data
                let hasEmergencyData = false;
                if (emergencyResult?.content && Array.isArray(emergencyResult.content) && emergencyResult.content[0]?.text) {
                  try {
                    const parsed = JSON.parse(emergencyResult.content[0].text);
                    hasEmergencyData = parsed?.candles?.length > 0 || 
                                     parsed?.data?.candles?.length > 0 || 
                                     (Array.isArray(parsed) && parsed.length > 0);
                  } catch (e) {
                    hasEmergencyData = Array.isArray(emergencyResult) && emergencyResult.length > 0;
                  }
                } else if (Array.isArray(emergencyResult)) {
                  hasEmergencyData = emergencyResult.length > 0;
                }
                
                if (hasEmergencyData && !emergencyResult?.isError) {
                  console.log(`✅ Emergency fallback succeeded: ${daysBack} days with ${emergencyInterval}`);
                  // Update result and used interval
                  result = emergencyResult;
                  usedInterval = emergencyInterval;
                  from = emergencyFrom;
                  to = emergencyTo;
                  lastError = null; // Clear the error since we succeeded
                  emergencySuccess = true;
                  break rangeLoop; // Exit both loops
                }
              } catch (e) {
                // Continue trying next emergency option
                console.warn(`⚠️ Emergency fallback attempt failed for ${emergencyInterval}: ${e.message}`);
                continue;
              }
            }
          }
          
          if (!emergencySuccess) {
            console.warn(`⚠️ All emergency fallback attempts failed`);
          }
        } catch (emergencyError) {
          console.warn(`⚠️ Emergency fallback failed: ${emergencyError.message}`);
        }
      }
      
      // Final check: if we still don't have data after emergency fallback
      if (!result || result?.isError || lastError) {
        const allTriedFinal = intervalsToTry.join(', ');
        const finalErrorFinal = lastError || 'Unknown error';
        
        console.error(`❌ All intervals AND emergency fallbacks failed. Tried: ${allTriedFinal}`);
        console.error(`❌ Final error: ${finalErrorFinal}`);
        
        return res.status(400).json({
          success: false,
          error: 'Interval not supported',
          message: `Unable to fetch historical data for intervals: ${allTriedFinal}. ${finalErrorFinal}`,
          originalInterval: interval,
          triedIntervals: intervalsToTry,
          mcpError: finalErrorFinal,
          suggestion: interval === '240minute' || interval === '4h' ? 'Try using 60minute, 1h, or day timeframe instead.' :
                      interval === 'month' || interval === 'monthly' ? 'Try using day, week, or 1D timeframe instead.' :
                      'Try a different timeframe or check if market data is available for this instrument. The date range might be too large.'
        });
      }
    }

    console.log('📦 MCP Response structure:', JSON.stringify(result).substring(0, 200));

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
    const responseData = {
      success: true, 
      data: {
        candles: candles
      }
    };
    
    // Add metadata if fallback interval was used
    if (usedInterval !== interval) {
      responseData.metadata = {
        originalInterval: interval,
        actualInterval: usedInterval,
        note: 'Fallback interval used as original interval is not supported by MCP'
      };
      console.log(`ℹ️ Using fallback interval: ${interval} → ${usedInterval}`);
    }
    
    res.json(responseData);
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
    
    let result;
    try {
      // Use safeMCPCall to handle session errors
      result = await safeMCPCall(async () => {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Search timed out')), 10000);
        });
        
        // Try the search with the original query
        const searchPromise = mcpClient.callTool({
          name: 'search_instruments',
          arguments: {
            query: cleanQuery
          }
        });
        
        return await Promise.race([searchPromise, timeoutPromise]);
      });
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
