import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Role } from '../types';
import { cn } from '../lib/utils';
import { Shield, User, Lock, Mail, Info, ChevronRight } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function LoginPage() {
  const { user, supabaseUser, loading: authLoading, error: authContextError, signOut } = useAuth();
  const [loginType, setLoginType] = useState<'STAFF' | 'USER'>('USER');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // The ultimate loading state: either we are trying to sign in, or context is loading data
  const isGlobalLoading = loading || (authLoading && supabaseUser);
  const [isSeeding, setIsSeeding] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [otp, setOtp] = useState('');
  const navigate = useNavigate();

  // Unified error message
  const displayError = error || authContextError;

  useEffect(() => {
    // Auto-seed disabled temporarily to prevent infinite loading/loops
    // const runSeeder = async () => { ... }
    console.log('[LOGIN] Auto-seeding is deactivated.');
  }, []);

  useEffect(() => {
    const isForceLoggedOut = localStorage.getItem('forceLoggedOut') === 'true';
    if (!authLoading && user && !isForceLoggedOut) {
      navigate('/', { replace: true });
    }
  }, [user, authLoading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Clear force logout flag to allow this manual sign-in attempt
    localStorage.removeItem('forceLoggedOut');
    
    setLoading(true);

    try {
      let email = identifier.trim().toLowerCase();
      
      if (!email.includes('@')) {
        email = `${email}@eskole.me`;
      }

      console.log(`[LOGIN] START: ${email}`);
      
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      console.log('[LOGIN] Supabase Result:', { data, error: authError });

      if (authError) {
        console.log('[LOGIN] Auth ERROR:', authError);
        throw authError;
      }

      // Verify session exists
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      console.log('[LOGIN] Session Verification:', { session, error: sessionError });

      if (sessionError || !session) {
        throw new Error('Sjednica nije kreirana. Molimo pokušajte ponovno.');
      }
      
      console.log('[LOGIN] SIGNED_IN successfully, waiting for AuthContext to load profile...');
      // AuthContext will handle state updates and we'll redirect via the useEffect
    } catch (err: any) {
      console.error('[LOGIN] Error:', err.message);
      let msg = 'Neispravna e-mail adresa ili lozinka.';
      if (err.message.includes('Invalid login credentials')) msg = 'Neispravna lozinka ili podaci za prijavu.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f7f9] flex flex-col items-center justify-center p-4 font-sans relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none select-none overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full flex flex-wrap content-start">
           {Array.from({length: 100}).map((_, i) => (
             <div key={i} className="text-8xl font-black p-4 rotate-12 uppercase tracking-tighter">e-Dnevnik</div>
           ))}
        </div>
      </div>

      <div className="max-w-md w-full relative z-10 transition-all duration-500 animate-in fade-in slide-in-from-bottom-4">
        <div className="text-center mb-10">
          <div className="inline-block px-3 py-1 bg-[#005c8d] text-white text-[10px] font-black uppercase tracking-[0.2em] mb-4">Službeni pristup</div>
          <h1 className="text-5xl font-black text-[#005c8d] tracking-tighter uppercase">e-Dnevnik</h1>
          <div className="h-1 w-12 bg-[#005c8d] mx-auto mt-2"></div>
          <p className="text-gray-500 mt-4 text-[11px] font-bold uppercase tracking-widest leading-none">Sustav za upravljanje informacijama u školi</p>
        </div>

        <div className="bg-white border border-gray-300">
          {/* Demo Login Info */}
          <div className="bg-yellow-50 border-b border-gray-300 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Info size={14} className="text-yellow-600" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-yellow-700">Demo prijava</span>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              <div>
                <p className="text-[9px] font-bold text-gray-400 uppercase leading-none mb-1">Administrator (STAFF)</p>
                <code className="text-[11px] block text-gray-800">nikola.duric@eskole.me / 123456</code>
              </div>
              <div>
                <p className="text-[9px] font-bold text-gray-400 uppercase leading-none mb-1">Nastavnik (STAFF)</p>
                <code className="text-[11px] block text-gray-800">marija.majdic@eskole.me / 123456</code>
              </div>
              <div>
                <p className="text-[9px] font-bold text-gray-400 uppercase leading-none mb-1">Učenik (USER)</p>
                <code className="text-[11px] block text-gray-800">ivica.malcic@eskole.me / Demo1234</code>
              </div>
              <div>
                <p className="text-[9px] font-bold text-gray-400 uppercase leading-none mb-1">Roditelj (USER)</p>
                <code className="text-[11px] block text-gray-800">matija.malcic@gmail.com / Demo1234</code>
              </div>
            </div>
          </div>

          <div className="flex border-b border-gray-300 bg-gray-50 uppercase tracking-tight font-bold text-[11px]">
            <button
              onClick={() => setLoginType('USER')}
              className={cn(
                "flex-1 py-3 text-center transition-all h-14",
                loginType === 'USER' ? "bg-white text-[#005c8d] border-t-4 border-[#005c8d]" : "text-gray-400 hover:text-gray-600 border-t-4 border-transparent"
              )}
            >
              Učenici i Roditelji
            </button>
            <button
              onClick={() => setLoginType('STAFF')}
              className={cn(
                "flex-1 py-3 text-center transition-all h-14",
                loginType === 'STAFF' ? "bg-white text-[#005c8d] border-t-4 border-[#005c8d]" : "text-gray-400 hover:text-gray-600 border-t-4 border-transparent"
              )}
            >
              Zaposlenici
            </button>
          </div>

          <form onSubmit={handleLogin} className="p-8 space-y-5">
            {isSeeding && (
              <div className="bg-blue-50 border border-blue-200 p-3 text-blue-700 text-[10px] font-bold uppercase leading-tight mb-5">
                Priprema demo podataka sustava...
              </div>
            )}

            {displayError && (
              <div className="bg-red-50 border border-red-200 p-4 text-red-700 mb-6 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Shield size={16} className="text-red-500" />
                  <p className="text-[11px] font-bold uppercase tracking-tight">Greška pri prijavi</p>
                </div>
                <div className="bg-white p-2 border border-red-100 text-[11px] font-bold">
                  {displayError}
                </div>
                <div className="flex gap-2">
                   <button 
                     type="button"
                     onClick={() => { setError(''); window.location.reload(); }}
                     className="text-[10px] bg-red-600 text-white px-3 py-1 font-bold uppercase border border-red-800"
                   >
                     Osvježi
                   </button>
                   {authContextError && (
                     <button 
                       type="button"
                       onClick={async () => { await signOut(); window.location.reload(); }}
                       className="text-[10px] bg-white text-red-600 border border-red-200 px-3 py-1 font-bold uppercase"
                     >
                       Odjava
                     </button>
                   )}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest">
                E-mail adresa
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Mail size={16} />
                </div>
                <input
                  type="email"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 text-sm outline-none focus:border-[#005c8d] focus:bg-blue-50/20 shadow-inner"
                  placeholder={loginType === 'STAFF' ? 'ime.prezime@eskole.me' : 'ime.prezime@skole.hr'}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest">Lozinka</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Lock size={16} />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 text-sm outline-none focus:border-[#005c8d] focus:bg-blue-50/20 shadow-inner"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {loginType === 'STAFF' && showOtp && (
              <div className="space-y-1">
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest">OTP Sigurnosni kod</label>
                <input
                  type="text"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="block w-full px-3 py-3 border border-gray-300 text-sm outline-none focus:border-[#005c8d] focus:bg-blue-50/20 shadow-inner text-center font-black tracking-[0.5em]"
                  placeholder="000000"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={isGlobalLoading}
              className="w-full h-14 flex items-center justify-center bg-[#005c8d] text-white text-[11px] font-black uppercase tracking-[0.2em] border border-[#004a70] hover:bg-[#004a70] transition-all disabled:opacity-50 mt-8 group"
            >
              {isGlobalLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {authLoading && supabaseUser ? 'Učitavanje profila...' : 'Prijavljivanje...'}
                </div>
              ) : (
                <>
                  Prijavi se u sustav
                  <ChevronRight size={16} className="ml-2 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>
        </div>

        <div className="mt-10 space-y-6">
          <div className="flex items-center justify-center gap-4">
            <div className="h-px w-8 bg-gray-300"></div>
            <p className="text-[9px] text-gray-400 uppercase tracking-[0.2em] font-black">Pomoć pri prijavi</p>
            <div className="h-px w-8 bg-gray-300"></div>
          </div>
          <div className="grid grid-cols-2 gap-4 w-full">
            <div className="bg-white p-4 border border-gray-300 text-center group hover:border-[#005c8d] transition-colors cursor-pointer shadow-sm">
              <span className="text-[9px] text-gray-400 block uppercase mb-2 tracking-widest font-black">Problemi?</span>
              <button className="text-[10px] text-[#005c8d] font-black uppercase tracking-tight group-hover:underline">Aktiviraj račun</button>
            </div>
            <div className="bg-white p-4 border border-gray-300 text-center group hover:border-[#005c8d] transition-colors cursor-pointer shadow-sm">
              <span className="text-[9px] text-gray-400 block uppercase mb-2 tracking-widest font-black">Zaboravljeno?</span>
              <button className="text-[10px] text-[#005c8d] font-black uppercase tracking-tight group-hover:underline">Resetiraj lozinku</button>
            </div>
          </div>
          
          <div className="flex justify-center">
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest text-center max-w-[200px]">
              Samo ovlašteni korisnici s važećim certifikatom imaju pristup.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
