import "./globals.css";

export const metadata = {
  title: "Zerodha Portfolio Tracker",
  description: "Real-time portfolio tracking for Zerodha accounts using Kite MCP",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}

