'use client';

import { useState } from 'react';

export default function AuthModal({ isOpen, onClose }) {
  const [userId, setUserId] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState(null);
  const [authWindow, setAuthWindow] = useState(null);

  if (!isOpen) return null;

  const handleLogin = async () => {
    setIsAuthenticating(true);
    setError(null);

    try {
      // Get auth URL
      const response = await fetch('http://localhost:3001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();
      
      
      // Open Zerodha login in popup
      const popup = window.open(
        data.authorizationUrl, 
        'ZerodhaLogin', 
        'width=500,height=700'
      );

      if (!popup) {
        setError('Please enable popups and try again');
        setIsAuthenticating(false);
        return;
      }

      setAuthWindow(popup);

      // Wait for popup to close
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          console.log('Popup closed - auto-closing modal and reloading...');
          
          // IMMEDIATELY close modal
          onClose();
          
          // Reload page after 3 seconds for MCP to process
          setTimeout(() => {
            window.location.reload();
          }, 3000);
        }
      }, 500);

    } catch (err) {
      setError(err.message);
      setIsAuthenticating(false);
    }
  };

  const handleCancel = () => {
    if (authWindow && !authWindow.closed) {
      authWindow.close();
      setAuthWindow(null);
    }
    setIsAuthenticating(false);
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="bg-blue-500 p-6 border-b-2 border-blue-600">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center">
                <svg className="w-7 h-7 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-normal text-white" style={{fontFamily: 'Poppins, sans-serif'}}>
                  Zerodha Login
                </h2>
                <p className="text-blue-100 text-sm font-light">
                  Authorize MCP Access
                </p>
              </div>
            </div>
            <button
              onClick={handleCancel}
              disabled={isAuthenticating}
              className="w-9 h-9 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center transition-all disabled:opacity-50 cursor-pointer"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Instructions */}
          <div className="mb-6">
            <div className="flex items-start gap-3 p-4 bg-blue-50 border-l-4 border-blue-500 rounded-lg">
              <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-blue-800 text-sm font-light leading-relaxed">
                  Click the button below to open Zerodha authorization. Login with your credentials and authorize the application.
                </p>
              </div>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-red-800 text-sm font-normal mb-1">Authorization Error</p>
                  <p className="text-red-700 text-sm font-light">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Optional User ID */}
          {!isAuthenticating && (
            <div className="mb-6">
              <label className="block text-sm font-normal text-gray-700 mb-2" style={{fontFamily: 'Poppins, sans-serif'}}>
                Zerodha User ID (Optional)
              </label>
              <input
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value.toUpperCase())}
                placeholder="e.g., AB1234"
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none font-normal"
                style={{fontFamily: 'Poppins, sans-serif'}}
              />
              <p className="text-xs text-gray-500 mt-1 font-light">
                Keep handy for the login page
              </p>
            </div>
          )}

          {/* Login Button */}
          <button
            onClick={handleLogin}
            disabled={isAuthenticating}
            className="w-full px-5 py-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all font-normal text-base shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border-2 border-blue-600"
            style={{fontFamily: 'Poppins, sans-serif'}}
          >
            {isAuthenticating ? (
              <span className="flex items-center justify-center gap-3">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Opening Authorization...
              </span>
            ) : (
              '🔓 Start Authorization'
            )}
          </button>

          {/* Status Messages */}
          {isAuthenticating && (
            <div className="mt-4 p-4 bg-green-50 border-l-4 border-green-500 rounded-lg">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-green-800 text-sm font-normal mb-1">Authorization Window Opened</p>
                  <p className="text-green-700 text-sm font-light">Complete the login process in the popup window. This modal will close automatically when done.</p>
                </div>
              </div>
            </div>
          )}

          {/* Instructions */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h4 className="font-normal text-gray-800 text-sm mb-2" style={{fontFamily: 'Poppins, sans-serif'}}>
              📝 What happens next:
            </h4>
            <ol className="text-sm text-gray-600 font-light space-y-1 list-decimal list-inside">
              <li>Popup window opens with Zerodha login</li>
              <li>Enter your User ID and password</li>
              <li>Complete 2FA verification (if enabled)</li>
              <li>Authorize MCP access</li>
              <li>Close the popup when done</li>
              <li>Page refreshes automatically with your data</li>
            </ol>
          </div>

          {/* Help Text */}
          <div className="mt-4 text-center">
            <p className="text-xs text-gray-500 font-light">
              Make sure popups are enabled. If popup is blocked, check your browser settings.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
