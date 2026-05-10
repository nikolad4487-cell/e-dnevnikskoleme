import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, Clock } from 'lucide-react';
import { Role } from '../types';

const INACTIVITY_LIMIT = 45 * 60 * 1000; // 45 minutes
const WARNING_THRESHOLD = 43 * 60 * 1000; // 43 minutes
const COUNTDOWN_TIME = 2 * 60; // 2 minutes in seconds

export default function InactivityTracker() {
  const { user, signOut, isStaff, isMainAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  const [showModal, setShowModal] = useState(false);
  const [timeLeft, setTimeLeft] = useState(COUNTDOWN_TIME);
  
  const lastActivityRef = useRef<number>(Date.now());
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  const isLoginPage = location.pathname === '/login';

  const logout = useCallback(async () => {
    setShowModal(false);
    await signOut();
    navigate('/login');
    window.location.reload(); // Ensure everything is cleared
  }, [signOut, navigate]);

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (showModal) {
      setShowModal(false);
      setTimeLeft(COUNTDOWN_TIME);
    }
  }, [showModal]);

  useEffect(() => {
    if (!user || isLoginPage || !isStaff) {
      if (timerRef.current) clearInterval(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      return;
    }

    const checkInactivity = () => {
      const now = Date.now();
      const inactiveTime = now - lastActivityRef.current;

      if (inactiveTime >= INACTIVITY_LIMIT) {
        logout();
      } else if (inactiveTime >= WARNING_THRESHOLD) {
        if (!showModal) setShowModal(true);
      }
    };

    // Events to track activity
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => {
      window.addEventListener(event, resetTimer);
    });

    timerRef.current = setInterval(checkInactivity, 10000); // Check every 10 seconds

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [user, isLoginPage, isStaff, logout, resetTimer, showModal]);

  // Countdown timer for the modal
  useEffect(() => {
    if (showModal) {
      countdownRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(countdownRef.current!);
            logout();
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
  }, [showModal, logout]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins} minuta i ${secs.toString().padStart(2, '0')} sekundi`;
  };

  if (!showModal) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white w-full max-w-md shadow-2xl overflow-hidden"
        >
          {/* Croatian e-Dnevnik Style Header */}
          <div className="bg-[#005c8d] px-6 py-4 flex items-center gap-3">
            <Clock className="text-white" size={24} />
            <h2 className="text-white font-black text-sm uppercase tracking-wider">Automatska odjava</h2>
          </div>
          
          <div className="p-8 text-center">
            <div className="mb-6 flex justify-center">
              <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center text-[#005c8d]">
                <AlertCircle size={32} />
              </div>
            </div>
            
            <p className="text-slate-700 font-bold text-sm leading-relaxed mb-6">
              Zbog sigurnosnih razloga, uskoro ćete biti automatski odjavljeni iz e-Dnevnik aplikacije.
              <br /><br />
              Za nastavak rada kliknite gumb 'Nastavi rad'.
            </p>
            
            <div className="bg-slate-50 border border-slate-100 p-4 mb-8">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Vrijeme do automatske odjave:</p>
              <p className="text-[#005c8d] font-black text-lg tabular-nums">
                {formatTime(timeLeft)}
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={resetTimer}
                className="w-full bg-[#005c8d] hover:bg-[#004a70] text-white py-4 px-6 text-xs font-black uppercase tracking-widest transition-all shadow-lg"
              >
                Nastavi rad
              </button>
              <button
                onClick={logout}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 px-6 text-xs font-black uppercase tracking-widest transition-colors"
              >
                Odustani
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
