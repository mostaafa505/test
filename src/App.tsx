/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Search, AlertCircle, CheckCircle2, Globe, ArrowRight, Loader2, Play, StopCircle, Github, Info, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster, toast } from 'sonner';

interface BrokenLink {
  url: string;
  source: string;
  status: number | string;
}

interface ScanStats {
  pagesProcessed: number;
  brokenCount: number;
}

type ScanStatus = 'idle' | 'scanning' | 'complete' | 'error';

export default function App() {
  const [url, setUrl] = useState('');
  const [maxPages, setMaxPages] = useState(50);
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [message, setMessage] = useState('');
  const [stats, setStats] = useState<ScanStats>({ pagesProcessed: 0, brokenCount: 0 });
  const [brokenLinks, setBrokenLinks] = useState<BrokenLink[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const eventSourceRef = useRef<EventSource | null>(null);

  const startScan = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!url) return;

    // Reset state
    setStatus('scanning');
    setBrokenLinks([]);
    setStats({ pagesProcessed: 0, brokenCount: 0 });
    setMessage('Initializing scan...');
    setError(null);

    const encodedUrl = encodeURIComponent(url);
    const eventSource = new EventSource(`/api/scan?url=${encodedUrl}&maxPages=${maxPages}`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'start':
          setMessage(data.message);
          break;
        case 'progress':
          setMessage(data.message);
          if (data.stats) setStats(data.stats);
          break;
        case 'broken_found':
          if (data.stats) setStats(data.stats);
          setBrokenLinks(prev => [data.brokenLink, ...prev]);
          toast.error(`Broken Link Found: ${data.brokenLink.url}`, {
            style: { border: '1px solid #02ADEF' },
            description: `Status: ${data.brokenLink.status}`,
          });
          break;
        case 'complete':
          setStatus('complete');
          setMessage('Scan completed successfully.');
          toast.success('Scan Completed', {
            style: { border: '1px solid #02ADEF' },
            description: `Found ${data.stats.brokenCount} broken links across ${data.stats.pagesProcessed} pages.`,
          });
          eventSource.close();
          break;
        case 'error':
          setStatus('error');
          setError(data.message);
          toast.error('Scan Failed', { description: data.message });
          eventSource.close();
          break;
      }
    };

    eventSource.onerror = () => {
      setStatus('error');
      setError('Connection lost or server error.');
      eventSource.close();
    };
  };

  const stopScan = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      setStatus('complete');
      setMessage('Scan stopped by user.');
    }
  };

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
    };
  }, []);

  return (
    <div className="min-h-screen bg-white text-[#333] font-sans selection:bg-[#02ADEF] selection:text-white">
      <Toaster position="top-right" richColors />
      
      {/* Header */}
      <header className="border-b border-gray-100 bg-white sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Logo area - only image, no text */}
            <img 
              src="/logo.png" 
              alt="One Hoster Logo" 
              className="h-12 md:h-16 w-auto object-contain"
            />
          </div>
          
          <div className="hidden md:flex items-center gap-6">
             <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-300">Professional Detection Hub</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-12 space-y-10">
        {/* Hero / Input Section */}
        <section className="text-center space-y-8 max-w-3xl mx-auto">
          <div className="space-y-4">
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl md:text-5xl font-black text-[#333] leading-tight"
            >
              Keep Your Website <span className="text-[#02ADEF]">Flawless</span>
            </motion.h2>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-lg text-gray-500"
            >
              Crawl your site as One Hoster would. Identify dead links, broken redirects, and improve your SEO instantly.
            </motion.p>
          </div>

          <form onSubmit={startScan} className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-[#02ADEF] transition-colors" />
              <input
                type="url"
                placeholder="https://yourwebsite.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={status === 'scanning'}
                className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl pl-12 pr-4 h-14 focus:border-[#02ADEF] outline-none transition-all disabled:opacity-50 text-lg shadow-inner"
                required
              />
            </div>
            <div className="w-full md:w-40">
              <input
                type="number"
                placeholder="Pages"
                value={maxPages}
                onChange={(e) => setMaxPages(parseInt(e.target.value))}
                disabled={status === 'scanning'}
                className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl px-4 h-14 focus:border-[#02ADEF] outline-none transition-all disabled:opacity-50 text-lg shadow-inner"
                title="Maximum internal pages to crawl"
              />
            </div>
            {status === 'scanning' ? (
              <button
                type="button"
                onClick={stopScan}
                className="h-14 px-8 bg-red-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-red-600 transition-all shadow-lg shadow-red-200"
              >
                <StopCircle className="w-5 h-5" />
                STOP
              </button>
            ) : (
              <button
                type="submit"
                className="h-14 px-10 bg-[#02ADEF] text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-[#02ADEF]/90 transition-all shadow-lg shadow-[#02ADEF]/20 active:scale-95"
              >
                <Play className="w-5 h-5" />
                SCAN NOW
              </button>
            )}
          </form>

          {/* Progress Overview */}
          <AnimatePresence>
            {status !== 'idle' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="grid grid-cols-2 md:grid-cols-4 gap-4"
              >
                {[
                  { label: 'Status', value: status, icon: status === 'scanning' ? <Loader2 className="w-4 h-4 animate-spin" /> : status === 'complete' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />, color: 'blue' },
                  { label: 'Scanned', value: `${stats.pagesProcessed} / ${maxPages}`, icon: < Globe className="w-4 h-4" />, color: 'blue' },
                  { label: 'Broken', value: stats.brokenCount, icon: <AlertCircle className="w-4 h-4" />, color: stats.brokenCount > 0 ? 'red' : 'green' },
                  { label: 'Intelligence', value: 'Live Feed', icon: <Info className="w-4 h-4" />, color: 'blue' }
                ].map((item, idx) => (
                  <div key={idx} className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-left">
                    <div className="flex items-center gap-2 text-gray-400 mb-1">
                      {item.icon}
                      <span className="text-[10px] font-bold uppercase tracking-wider">{item.label}</span>
                    </div>
                    <div className={`font-black text-lg ${item.color === 'red' ? 'text-red-500' : item.color === 'green' ? 'text-green-500' : 'text-[#02ADEF]'}`}>
                      {typeof item.value === 'string' ? item.value.toUpperCase() : item.value}
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Scan Feed Message */}
        {status === 'scanning' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center"
          >
            <p className="text-sm font-medium text-[#02ADEF] animate-pulse">
              {message || 'Analysing site structure...'}
            </p>
          </motion.div>
        )}

        {/* Results */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-2xl text-[#333] flex items-center gap-3">
              Detection Report
              <span className="px-3 py-1 bg-[#02ADEF]/10 text-[#02ADEF] text-sm rounded-full font-bold">{brokenLinks.length}</span>
            </h3>
          </div>

          <div className="bg-white border rounded-2xl shadow-sm overflow-hidden min-h-[400px]">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b bg-gray-50/50">
                    <th className="p-5 text-xs font-bold text-gray-400 uppercase tracking-widest">Broken Link (Target)</th>
                    <th className="p-5 text-xs font-bold text-gray-400 uppercase tracking-widest w-32">Status Code</th>
                    <th className="p-5 text-xs font-bold text-gray-400 uppercase tracking-widest w-32">Verify</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {brokenLinks.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-20 text-center text-gray-400 italic font-medium">
                        {status === 'scanning' ? 'Our crawlers are hard at work...' : status === 'idle' ? 'Enter a URL above to start the professional scan.' : 'Excellent! No broken links detected.'}
                      </td>
                    </tr>
                  ) : (
                    <AnimatePresence initial={false}>
                      {brokenLinks.map((link, i) => (
                        <motion.tr
                          key={`${link.url}-${link.source}-${i}`}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="hover:bg-gray-50/50 transition-all cursor-default"
                        >
                          <td className="p-5">
                            <div className="space-y-1">
                              <p className="font-bold text-sm text-[#333] break-all">{link.url}</p>
                              <div className="flex items-center gap-2 text-[10px] text-gray-400 uppercase tracking-tighter">
                                <span className="font-black text-[#02ADEF]">Source:</span>
                                <span className="truncate max-w-md">{link.source}</span>
                              </div>
                            </div>
                          </td>
                          <td className="p-5">
                            <span className={`inline-block px-3 py-1 rounded-lg text-xs font-black ring-1 ring-inset ${
                              String(link.status).startsWith('4') ? 'bg-orange-50 text-orange-600 ring-orange-200' : 
                              String(link.status).startsWith('5') ? 'bg-red-50 text-red-600 ring-red-200' :
                              'bg-gray-50 text-gray-600 ring-gray-200'
                            }`}>
                              {link.status}
                            </span>
                          </td>
                          <td className="p-5">
                            <a 
                              href={link.url} 
                              target="_blank" 
                              rel="noreferrer"
                              className="w-10 h-10 bg-gray-100 flex items-center justify-center rounded-xl hover:bg-[#02ADEF] hover:text-white transition-all text-gray-400"
                            >
                              <ExternalLink className="w-5 h-5" />
                            </a>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col items-center gap-8 justify-center">
            <div className="flex items-center gap-3 opacity-30">
              <Globe className="w-5 h-5 text-gray-900" />
              <span className="font-black tracking-tighter text-lg uppercase text-gray-900">One Hoster</span>
            </div>
            
            <div className="h-px bg-gray-100 w-full max-w-xs" />
            
            <p className="text-sm font-bold text-gray-400">
               &copy; 2026 One Hoster
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

