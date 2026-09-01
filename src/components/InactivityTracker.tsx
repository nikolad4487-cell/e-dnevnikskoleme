import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, Clock } from 'lucide-react';

const INACTIVITY_LIMIT = 45 * 60 * 1000; // 45 minutes
const WARNING_THRESHOLD = 40 * 60 * 1000; // 40 minutes (when modal appears)
const COUNTDOWN_TIME = 5 * 60; // 5 minutes in seconds

export default function InactivityTracker() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  const [showModal, setShowModal] = useState(false);
  const [timeLeft, setTimeLeft] = useState(COUNTDOWN_TIME);
  
  const lastActivityRef = useRef<number>(Date.now());
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const lastStateWriteRef = useRef<number>(0);
  const isLoggingOutRef = useRef<boolean>(false);
  const showModalRef = useRef<boolean>(false);

  const isLoginPage = location.pathname === '/login';

  // Create BroadcastChannel for cross-tab synchronization
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    // Only instantiate in browser environment
    if (typeof window !== 'undefined') {
      channelRef.current = new BroadcastChannel('session_inactivity_sync');
    }
    return () => {
      if (channelRef.current) {
        channelRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    showModalRef.current = showModal;
  }, [showModal]);

  const logoutAndRedirect = useCallback(async (isExpired: boolean) => {
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;

    setShowModal(false);
    localStorage.removeItem('lastActivity');
    localStorage.removeItem('auth.lastActivity');
    
    try {
      await signOut();
    } catch (err) {
      console.error("Error during auto-signout:", err);
    }

    if (isExpired) {
      navigate('/login?expired=true', { replace: true });
    } else {
      navigate('/login', { replace: true });
    }
    isLoggingOutRef.current = false;
  }, [signOut, navigate]);

  const resetTimerLocal = useCallback((timestamp: number, notifyOthers: boolean = false) => {
    lastActivityRef.current = timestamp;
    localStorage.setItem('lastActivity', timestamp.toString());
    localStorage.setItem('auth.lastActivity', timestamp.toString());
    lastStateWriteRef.current = timestamp;
    
    if (showModalRef.current) {
      setShowModal(false);
      setTimeLeft(COUNTDOWN_TIME);
    }

    if (notifyOthers && channelRef.current) {
      channelRef.current.postMessage({ type: 'RESET_TIMER', timestamp });
    }
  }, []);

  const resetTimerFromCurrentActivity = useCallback(() => {
    resetTimerLocal(Date.now(), true);
  }, [resetTimerLocal]);

  // Handle user activity from events (only tracker when modal is closed)
  const handleUserActivity = useCallback(() => {
    if (showModalRef.current) return; // Do not register background activity while warning is showing
    const now = Date.now();
    lastActivityRef.current = now;
    
    // Throttle writes to localStorage & BroadcastChannel (once every 2 seconds)
    if (now - lastStateWriteRef.current > 2000) {
      resetTimerLocal(now, true);
    }
  }, [resetTimerLocal]);

  // Hook into route changes for reset
  useEffect(() => {
    if (user && !isLoginPage) {
      resetTimerFromCurrentActivity();
    }
  }, [location.pathname, user, isLoginPage]);

  useEffect(() => {
    // We track inactivity for ALL authenticated users across the whole app
    if (!user || isLoginPage) {
      if (timerRef.current) clearInterval(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      setShowModal(false);
      return;
    }

    // Set initial activity timestamp on mount/login
    const initialTime = Date.now();
    resetTimerLocal(initialTime, false);

    const checkInactivity = () => {
      if (isLoggingOutRef.current) return;

      // Robust multi-tab sync: read the latest activity time from localStorage
      const savedActivityStr = localStorage.getItem('auth.lastActivity');
      const latestActivity = savedActivityStr ? parseInt(savedActivityStr, 10) : lastActivityRef.current;
      
      const now = Date.now();
      const inactiveTime = now - latestActivity;

      if (inactiveTime >= INACTIVITY_LIMIT) {
        if (channelRef.current) {
          channelRef.current.postMessage({ type: 'FORCE_LOGOUT_EXPIRED' });
        }
        logoutAndRedirect(true);
      } else if (inactiveTime >= WARNING_THRESHOLD) {
        if (!showModalRef.current) {
          setShowModal(true);
          // Set exact time left in countdown
          const remainingSecs = Math.max(0, Math.ceil((INACTIVITY_LIMIT - inactiveTime) / 1000));
          setTimeLeft(remainingSecs > 0 ? remainingSecs : COUNTDOWN_TIME);
        }
      } else {
        // If another tab was active, close modal automatically
        if (showModalRef.current) {
          setShowModal(false);
        }
      }
    };

    // Listen to BroadcastChannel messages
    if (channelRef.current) {
      channelRef.current.onmessage = (event) => {
        if (!event || !event.data) return;
        const { type, timestamp } = event.data;
        if (type === 'RESET_TIMER' && timestamp) {
          resetTimerLocal(timestamp, false);
        } else if (type === 'FORCE_LOGOUT_EXPIRED') {
          logoutAndRedirect(true);
        } else if (type === 'FORCE_LOGOUT_MANUAL') {
          logoutAndRedirect(false);
        }
      };
    }

    const handleUnauthorizedApiResponse = () => {
      logoutAndRedirect(true);
    };

    window.addEventListener('unauthorized-api-response', handleUnauthorizedApiResponse);

    // Events to track real user activity. Background API calls do not keep the session alive.
    const events = ['click', 'mousedown', 'mousemove', 'keypress', 'keydown', 'scroll', 'touchstart'];
    events.forEach(event => {
      window.addEventListener(event, handleUserActivity);
    });

    // Check inactivity state every 5 seconds for responsive feedback
    timerRef.current = setInterval(checkInactivity, 5000);

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleUserActivity);
      });
      window.removeEventListener('unauthorized-api-response', handleUnauthorizedApiResponse);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [user, isLoginPage, logoutAndRedirect, handleUserActivity, resetTimerLocal]);

  // Countdown timer when the modal is visible
  useEffect(() => {
    if (showModal) {
      countdownRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(countdownRef.current!);
            if (channelRef.current) {
              channelRef.current.postMessage({ type: 'FORCE_LOGOUT_EXPIRED' });
            }
            logoutAndRedirect(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (countdownRef.current) clearInterval(countdownRef.current);
      setTimeLeft(COUNTDOWN_TIME);
    }

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [showModal, logoutAndRedirect]);

  // Handles manual "Odjavi se" within the warning modal
  const handleManualLogout = () => {
    if (channelRef.current) {
      channelRef.current.postMessage({ type: 'FORCE_LOGOUT_MANUAL' });
    }
    logoutAndRedirect(false);
  };

  // Format time in strictly MM:SS format (e.g., 05:00, 04:59)
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!showModal) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-sans">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white w-full max-w-md shadow-2xl overflow-hidden rounded-lg border border-slate-200 text-left"
        >
          {/* Croatian e-Dnevnik Design Header */}
          <div className="bg-[#005c8d] px-6 py-4 flex items-center gap-3">
            <Clock className="text-white shrink-0 animate-pulse" size={20} />
            <span className="text-white font-black text-xs uppercase tracking-widest">Upozorenje o neaktivnosti</span>
          </div>
          
          <div className="p-6 text-center">
            <div className="mb-4 flex justify-center">
              <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center text-amber-500 border border-amber-100 shadow-sm">
                <AlertCircle size={28} />
              </div>
            </div>
            
            <p className="text-slate-700 font-bold text-sm leading-relaxed mb-6">
              Uskoro ćete biti odjavljeni radi neaktivnosti.
              <br />
              Možete nastaviti rad ili se odmah odjaviti.
            </p>
            
            <div className="bg-slate-50 border border-slate-100 rounded p-4 mb-6">
              <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest block mb-1">Preostalo vrijeme:</span>
              <span className="text-[#005c8d] font-black text-2xl tabular-nums tracking-wider block">
                {formatTime(timeLeft)}
              </span>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                onClick={resetTimerFromCurrentActivity}
                className="w-full bg-[#005c8d] hover:bg-[#004a70] text-white py-3.5 px-6 text-xs font-black uppercase tracking-widest transition-all rounded shadow-md cursor-pointer active:scale-95"
              >
                Ostani prijavljen
              </button>
              <button
                onClick={handleManualLogout}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 px-6 text-xs font-black uppercase tracking-widest transition-colors rounded cursor-pointer active:scale-95"
              >
                Odjavi se
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
