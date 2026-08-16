import React, { Component, ErrorInfo, ReactNode } from 'react';
import { supabase } from '../lib/supabase';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: ""
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message || 'Nepoznata greška' };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ERROR BOUNDARY CAUGHT ERROR", error, errorInfo);
    
    // Auto-reload on chunk loading / dynamic import errors in production
    const isChunkError = error.message && (
      /Failed to fetch dynamically imported module/i.test(error.message) ||
      /Loading chunk/i.test(error.message) ||
      /preload/i.test(error.message) ||
      /dynamically/i.test(error.message)
    );
    if (isChunkError) {
      const lastReload = sessionStorage.getItem('last_chunk_reload');
      const now = Date.now();
      if (!lastReload || now - parseInt(lastReload) > 10000) {
        sessionStorage.setItem('last_chunk_reload', String(now));
        window.location.reload();
        return;
      }
    }

    // Safely record to database if available
    this.logErrorToDatabase(error, errorInfo);
  }

  private async logErrorToDatabase(error: Error, errorInfo: ErrorInfo) {
    try {
      if (!supabase || !supabase.auth) return;
      
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      
      const selectedSchoolId = localStorage.getItem('selectedSchoolId') || localStorage.getItem('schoolId') || null;

      await supabase.from('system_error_logs').insert({
        user_id: userId || null,
        school_id: selectedSchoolId,
        page_url: window.location.href,
        error_message: error.message || 'Unknown Error',
        stack_trace: error.stack || errorInfo.componentStack || null,
        browser_info: navigator.userAgent
      });
    } catch {
      // Ignore database logging failure to prevent recursive errors
    }
  }

  private handleReset = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans text-slate-800">
          <div className="bg-white p-8 max-w-md w-full rounded-2xl shadow-xl border border-slate-100 text-center">
            <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-5 border border-amber-200">
              <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>
            <h1 className="text-lg font-black uppercase tracking-tight text-slate-900 mb-2">
              Došlo je do greške u aplikaciji
            </h1>
            <p className="text-sm text-slate-500 mb-6 leading-relaxed">
              Došlo je do greške u aplikaciji. Pokušajte osvježiti stranicu.
            </p>
            {this.state.errorMessage && import.meta.env.DEV && (
              <div className="mb-6 p-3 bg-red-50 border border-red-200 text-left rounded-lg overflow-x-auto max-h-40">
                <p className="text-[10px] font-mono text-red-700 whitespace-pre-wrap">
                  {this.state.errorMessage}
                </p>
              </div>
            )}
            <button
              className="bg-[#005c8d] text-white px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-[#00476b] transition-all w-full cursor-pointer shadow-md"
              onClick={this.handleReset}
            >
              Osvježi stranicu
            </button>
            <div className="mt-4 pt-4 border-t border-slate-100">
              <button 
                onClick={() => window.location.href = '/'} 
                className="text-xs text-slate-400 font-bold uppercase hover:text-slate-600 cursor-pointer"
              >
                Povratak na naslovnicu
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

