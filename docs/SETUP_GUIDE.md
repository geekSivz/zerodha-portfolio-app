# 📖 Setup Guide

## 🚀 Quick Start

**Just double-click:** `START.bat` (in the root folder)

Everything happens automatically!

---

## 🔐 Authorization (First Time)

### **Required: Cursor MCP Setup**

Kite MCP needs authorization through Cursor AI:

**Step 1:** Open Cursor Settings (Ctrl+,)

**Step 2:** Click "Open Settings (JSON)"

**Step 3:** Add this:
```json
{
  "mcp.servers": {
    "kite": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.kite.trade/mcp"]
    }
  }
}
```

**Step 4:** Save and restart Cursor

**Step 5:** In Cursor AI Chat (Ctrl+L):
```
Get my Zerodha holdings using Kite MCP
```

**Step 6:** Complete authorization in browser

**Step 7:** Now run `START.bat` - your web app will work!

---

## 🆘 Troubleshooting

**Backend not connecting:**
```
Run: utils/test-backend.bat
If not running: utils/start-backend.bat
```

**Port conflicts:**
```
Run: utils/kill-ports.bat
```

**Holdings timeout:**
```
Authorize via Cursor first (see above)
```

---

For more details, see README.md

