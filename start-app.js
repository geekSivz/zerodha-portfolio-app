const { spawn } = require('child_process');
const { exec } = require('child_process');
const http = require('http');

console.log('\n' + '='.repeat(70));
console.log('  📈 ZERODHA PORTFOLIO TRACKER - AUTO STARTUP');
console.log('='.repeat(70) + '\n');

// Track running processes
let backendProcess = null;
let frontendProcess = null;

// Color codes for console
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Wait for a condition
function waitFor(conditionFn, timeout = 30000, interval = 1000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const checkInterval = setInterval(() => {
      if (conditionFn()) {
        clearInterval(checkInterval);
        resolve();
      } else if (Date.now() - startTime > timeout) {
        clearInterval(checkInterval);
        reject(new Error('Timeout waiting for condition'));
      }
    }, interval);
  });
}

// Check if server is ready
function checkServer(port) {
  return new Promise((resolve) => {
    const options = {
      host: 'localhost',
      port: port,
      path: '/api/health',
      timeout: 2000
    };

    const req = http.get(options, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

// Trigger login/authorization
async function triggerAuth() {
  return new Promise((resolve, reject) => {
    log('\n🔐 Checking authorization status...', 'cyan');
    
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: '/api/health',
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const health = JSON.parse(data);
          if (health.authorized) {
            log('✅ Already authorized!', 'green');
            resolve(true);
            return;
          }

          log('⚠️  Authorization needed - triggering login...', 'yellow');
          log('📌 Your browser will open for Zerodha login', 'cyan');
          log('🔑 Please login and authorize when prompted\n', 'cyan');

          // Trigger login
          const loginReq = http.get('http://localhost:3001/api/auth/login', (loginRes) => {
            let loginData = '';
            loginRes.on('data', (chunk) => { loginData += chunk; });
            loginRes.on('end', () => {
              try {
                const result = JSON.parse(loginData);
                if (result.success) {
                  log('\n✅ Authorization successful!', 'green');
                  resolve(true);
                } else {
                  log('\n⚠️  Please complete the login in your browser', 'yellow');
                  log('   After logging in, the app will be ready!\n', 'cyan');
                  resolve(false);
                }
              } catch (error) {
                log('\n⚠️  Login triggered - please complete in browser', 'yellow');
                resolve(false);
              }
            });
          });

          loginReq.on('error', (err) => {
            log(`❌ Error triggering login: ${err.message}`, 'red');
            reject(err);
          });
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.end();
  });
}

// Open browser
function openBrowser(url) {
  const command = process.platform === 'win32' ? 'start' :
                  process.platform === 'darwin' ? 'open' : 'xdg-open';
  
  exec(`${command} ${url}`, (error) => {
    if (error) {
      log(`⚠️  Could not auto-open browser. Please open manually: ${url}`, 'yellow');
    }
  });
}

// Start backend
async function startBackend() {
  return new Promise((resolve, reject) => {
    log('🔧 Starting backend server...', 'blue');
    
    backendProcess = spawn('node', ['server.js'], {
      cwd: __dirname,
      stdio: 'pipe', // Changed from 'inherit' to capture output
      shell: true
    });

    // Forward backend output to console
    backendProcess.stdout.on('data', (data) => {
      process.stdout.write(data);
    });

    backendProcess.stderr.on('data', (data) => {
      process.stderr.write(data);
    });

    backendProcess.on('error', (error) => {
      log(`❌ Backend error: ${error.message}`, 'red');
      reject(error);
    });

    // Wait for backend to be ready
    setTimeout(async () => {
      log('⏳ Waiting for backend to be ready...', 'cyan');
      
      let ready = false;
      for (let i = 0; i < 30; i++) {
        ready = await checkServer(3001);
        if (ready) break;
        await new Promise(r => setTimeout(r, 1000));
      }

      if (ready) {
        log('✅ Backend server is ready on http://localhost:3001!', 'green');
        resolve();
      } else {
        log('❌ Backend failed to start within 30 seconds', 'red');
        log('💡 Check the terminal output above for errors', 'yellow');
        reject(new Error('Backend failed to start'));
      }
    }, 3000);
  });
}

// Start frontend
async function startFrontend() {
  return new Promise((resolve) => {
    log('\n🎨 Starting frontend...', 'blue');
    
    frontendProcess = spawn('npm', ['run', 'dev'], {
      cwd: __dirname + '/client',
      stdio: 'pipe',
      shell: true
    });

    // Forward frontend output to console
    frontendProcess.stdout.on('data', (data) => {
      process.stdout.write(data);
    });

    frontendProcess.stderr.on('data', (data) => {
      process.stderr.write(data);
    });

    frontendProcess.on('error', (error) => {
      log(`❌ Frontend error: ${error.message}`, 'red');
    });

    // Wait for frontend to start
    setTimeout(async () => {
      log('⏳ Checking if frontend is ready...', 'cyan');
      
      let ready = false;
      for (let i = 0; i < 20; i++) {
        ready = await checkServer(3000);
        if (ready) break;
        await new Promise(r => setTimeout(r, 1000));
      }
      
      if (ready) {
        log('✅ Frontend is ready on http://localhost:3000!', 'green');
      } else {
        log('⚠️  Frontend may still be starting...', 'yellow');
      }
      
      resolve();
    }, 5000);
  });
}

// Cleanup on exit
function cleanup() {
  log('\n\n🛑 Shutting down...', 'yellow');
  
  if (backendProcess) {
    backendProcess.kill();
  }
  if (frontendProcess) {
    frontendProcess.kill();
  }
  
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Main startup sequence
async function main() {
  try {
    // Step 1: Start backend
    await startBackend();
    
    // Step 2: Trigger authorization
    await new Promise(r => setTimeout(r, 2000)); // Wait for backend to fully initialize
    
    try {
      await triggerAuth();
    } catch (error) {
      log('⚠️  Authorization will be needed - browser will open', 'yellow');
    }
    
    // Step 3: Start frontend
    await startFrontend();
    
    // Step 4: Wait a bit more for frontend
    await new Promise(r => setTimeout(r, 3000));
    
    // Step 5: Open dashboard
    log('\n' + '='.repeat(70), 'green');
    log('🎉 APPLICATION STARTED SUCCESSFULLY!', 'green');
    log('='.repeat(70), 'green');
    log('\n📊 Backend:  http://localhost:3001', 'cyan');
    log('🌐 Frontend: http://localhost:3000\n', 'cyan');
    
    log('⏳ Opening dashboard in 3 seconds...', 'yellow');
    await new Promise(r => setTimeout(r, 3000));
    
    log('🚀 Opening browser...', 'cyan');
    openBrowser('http://localhost:3000');
    
    log('\n💡 Tips:', 'yellow');
    log('   • Keep this terminal open while using the app', 'cyan');
    log('   • If authorization is needed, complete login in browser', 'cyan');
    log('   • Press Ctrl+C to stop the app\n', 'cyan');
    
  } catch (error) {
    log(`\n❌ Startup failed: ${error.message}`, 'red');
    log('\n🔧 Troubleshooting:', 'yellow');
    log('   1. Make sure ports 3000 and 3001 are free', 'cyan');
    log('   2. Run: npm install (in root and client folders)', 'cyan');
    log('   3. Check server.js and client folder exist\n', 'cyan');
    cleanup();
  }
}

// Start the application
main();

