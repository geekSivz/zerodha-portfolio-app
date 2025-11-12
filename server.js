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

// Get quote for a symbol
app.get('/api/market/quote/:symbol', async (req, res) => {
  try {
    if (!mcpClient) {
      return res.status(503).json({ error: 'MCP client not initialized' });
    }

    const { symbol } = req.params;
    console.log(`📈 Fetching quote for ${symbol}...`);
    
    const result = await mcpClient.callTool({
      name: 'get_quote',
      arguments: { symbol }
    });

    if (result?.isError) {
      return res.status(401).json({ 
        error: 'Authorization required',
        needsAuth: true,
        data: result
      });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error fetching quote:', error);
    res.status(500).json({ 
      error: 'Failed to fetch quote', 
      message: error.message 
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
      console.log('   GET  /api/mcp/tools');
      console.log('   GET  /api/diagnostic\n');
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
