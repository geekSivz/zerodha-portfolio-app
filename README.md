# 📊 Zerodha Portfolio Tracker

A modern portfolio tracking application for Zerodha accounts with real-time data and candlestick charts.

---

## ✨ Features

- 📊 **Holdings**: View your stock portfolio with live P&L
- 💼 **Positions**: Track active trades and positions
- 📈 **Charts**: NIFTY 50 candlestick charts with technical indicators
- 💰 **Margins**: Check account balance and available funds
- 🎨 **Clean UI**: Modern white + blue design
- 🔐 **Secure**: Zerodha Kite MCP authentication

---

## 🚀 Quick Start (ONE COMMAND)

### **Windows:**
```
Double-click: START.bat
```

That's it! The app will:
1. Kill old processes on ports 3000 & 3001
2. Start backend server (Port 3001)
3. Start frontend (Port 3000)
4. Open browser automatically

---

## 📋 Prerequisites

- **Node.js** v18+ ([Download](https://nodejs.org/))
- **Zerodha Trading Account**
- **Windows 10/11**

---

## 🛠️ Manual Installation

If `START.bat` doesn't work:

```bash
# 1. Install dependencies
npm install
cd client
npm install
cd ..

# 2. Start backend (Terminal 1)
node server.js

# 3. Start frontend (Terminal 2)
cd client
npm run dev

# 4. Open browser
http://localhost:3000
```

---

## 🔐 First Time Setup

1. **Run START.bat**
2. Browser opens at `http://localhost:3000`
3. Click **"Login to Zerodha"** button
4. Complete Zerodha login in popup
5. Popup closes → Data loads automatically!

---

## 📊 Tabs Overview

### **Holdings**
- View all stocks in your portfolio
- Live prices and P&L
- Search and sort functionality
- Total investment and returns

### **Positions**
- Active trades (intraday/overnight)
- Real-time P&L
- Position details with entry/exit prices

### **Charts**
- NIFTY 50 candlestick chart
- Multiple timeframes: 1m, 5m, 15m, 30m, 1h, 1D
- Technical indicators: SMA(20), SMA(50), EMA(20)
- Zoom and pan controls
- Demo data (historical OHLC not available from MCP)

### **Margins**
- Available balance
- Used margins
- Collateral and exposure

---

## 🎨 Customization

### Add Custom Indicators to Charts

See `docs/CHART_INDICATORS_GUIDE.md` for detailed instructions.

Quick example:
```javascript
// In CandlestickChart.jsx
const calculateBollingerBands = (data, period) => { ... }
```

---

## 🐛 Troubleshooting

### **Port already in use**
```bash
# Kill processes on ports 3000 and 3001
netstat -ano | findstr :3000
netstat -ano | findstr :3001
taskkill /F /PID [PID_NUMBER]

# Then run START.bat again
```

### **Backend not connecting**
- Check if `node server.js` shows any errors
- Ensure port 3001 is not blocked by firewall
- Verify Node.js is installed: `node --version`

### **Authorization not working**
- Make sure backend is running first
- Check backend logs for "MCP connected"
- Try clicking "Login to Zerodha" button again

### **Charts showing "Demo Data"**
- This is expected! Zerodha MCP doesn't provide historical data
- Chart uses realistic simulated NIFTY 50 data
- All features work the same

---

## 📁 Project Structure

```
zerodha-portfolio-app/
├── START.bat                 # 👈 DOUBLE-CLICK THIS
├── server.js                 # Backend API
├── package.json              # Root dependencies
├── client/                   # Frontend (Next.js)
│   ├── app/
│   │   └── page.jsx         # Main page with tabs
│   └── components/
│       ├── Holdings.jsx      # Holdings tab
│       ├── Positions.jsx     # Positions tab
│       ├── CandlestickChart.jsx  # Charts tab
│       └── Margins.jsx       # Margins tab
└── docs/                     # Documentation
    ├── CHART_INDICATORS_GUIDE.md
    └── CHART_FEATURE_SUMMARY.md
```

---

## 🔧 Tech Stack

- **Backend**: Node.js, Express.js, Kite MCP SDK
- **Frontend**: Next.js 16, React, JavaScript
- **Styling**: Tailwind CSS v4
- **Charts**: Custom SVG rendering
- **API**: Zerodha Kite MCP

---

## 📚 Documentation

- **Chart Indicators**: `docs/CHART_INDICATORS_GUIDE.md`
- **Feature Summary**: `docs/CHART_FEATURE_SUMMARY.md`
- **Setup Guide**: `docs/SETUP_GUIDE.md`

---

## 🎯 Features Roadmap

- [ ] Real-time price updates (WebSocket)
- [ ] More chart indicators (MACD, Bollinger Bands, RSI)
- [ ] Multiple symbols (not just NIFTY)
- [ ] Order placement from UI
- [ ] Portfolio analytics
- [ ] Export data (CSV/PDF)

---

## ⚠️ Important Notes

1. **Historical Data**: Charts use demo data because Zerodha MCP doesn't provide historical OHLC data
2. **Authorization**: Must be done every session (MCP limitation)
3. **Data Refresh**: Click refresh buttons to update data
4. **Ports**: Backend (3001), Frontend (3000) - must be free

---

## 📞 Support

Having issues? Check:
1. Backend logs in "Backend Server" window
2. Browser console (F12)
3. `docs/` folder for detailed guides

---

## 📄 License

MIT License - Feel free to use and modify!

---

**Made with ❤️ for Zerodha traders**

*Happy Trading! 📈*
