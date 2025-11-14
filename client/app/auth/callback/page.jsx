'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function AuthCallback() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const notifyBackend = async () => {
      const requestToken = searchParams.get('request_token');
      
      // CRITICAL: Notify backend that auth completed
      if (requestToken) {
        try {
          await fetch(`http://localhost:3001/api/auth/callback?request_token=${requestToken}&status=success`);
        } catch (e) {
          console.log('Backend notification failed:', e);
        }
      }
      
      // Close window after 1 second
      setTimeout(() => {
        window.close();
      }, 1000);
    };
    
    notifyBackend();
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center p-8">
        <div className="text-6xl mb-4">✓</div>
        <h2 className="text-xl font-normal mb-2">Authorization Complete</h2>
        <p className="text-gray-600">Closing...</p>
      </div>
    </div>
  );
}

