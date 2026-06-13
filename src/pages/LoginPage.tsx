import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Role } from '../types';
import { cn } from '../lib/utils';
import { Shield, User, Lock, Mail, Info, ChevronRight } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function LoginPage() {
  console.log("LOGIN PAGE RENDER");
  const { user, supabaseUser, loading: authLoading, error: authContextError, signOut } = useAuth();
  
  const hostname = window.location.hostname;
  console.log("HOSTNAME", hostname);

  const isTeacherDomain = hostname === "e-dnevnik.skolehr.xyz";
  const isStudentDomain = hostname === "ocjene.skolehr.xyz";

  useEffect(() => {
    if (hostname && !isTeacherDomain && !isStudentDomain && !hostname.includes('localhost') && !hostname.includes('run.app') && !hostname.includes('vercel.app') && !hostname.includes('127.0.0.1')) {
      console.warn("[LOGIN] Unrecognized hostname:", hostname);
    }
  }, [hostname, isTeacherDomain, isStudentDomain]);

  const portalType = import.meta.env.VITE_APP_PORTAL || 'staff';
  const isStudentPortal = isStudentDomain || (!isTeacherDomain && (portalType === 'student'));

  const [loginType, setLoginType] = useState<'STAFF' | 'USER'>(() => {
    if (isTeacherDomain) return 'STAFF';
    if (isStudentDomain || isStudentPortal) return 'USER';
    return 'USER';
  });

  useEffect(() => {
    if (isTeacherDomain) {
      setLoginType('STAFF');
    } else if (isStudentDomain || isStudentPortal) {
      setLoginType('USER');
    }
  }, [isTeacherDomain, isStudentDomain, isStudentPortal]);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // The ultimate loading state: either we are trying to sign in, or context is loading data
  const isGlobalLoading = loading || (authLoading && !!supabaseUser);
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
    const isMfaSetupNeeded = localStorage.getItem('mfaSetupNeeded') === 'true';

    if (!authLoading && user && !isForceLoggedOut && !isMfaSetupNeeded) {
      navigate('/', { replace: true });
    }
  }, [user, authLoading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Clear force logout flag to allow this manual sign-in attempt
    localStorage.removeItem('forceLoggedOut');
    
    // Virtual MFA simulation for staff
    if (loginType === 'STAFF' && password.length !== 4) {
      setError('PIN mora imati točno 4 znamenke.');
      return;
    }
    if (loginType === 'STAFF' && (!otp || otp.length !== 6)) {
      setError('Molimo unesite ispravan 6-znamenkasti OTP kod iz autentifikatora.');
      return;
    }
    
    setLoading(true);

    try {
      let normalizedEmail = identifier.trim().toLowerCase();
      
      if (!normalizedEmail.includes('@')) {
        normalizedEmail = `${normalizedEmail}@eskole.me`;
      }

      console.log("LOGIN INPUT", identifier);
      console.log("NORMALIZED LOGIN EMAIL", normalizedEmail);
      
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          totpCode: otp,
          loginType
        })
      });

      const contentType = response.headers.get('content-type') || '';
      
      if (!contentType.includes('application/json')) {
        const text = await response.text();
        console.error('LOGIN NON-JSON RESPONSE:', text);
        throw new Error('Prijava trenutno nije moguća (komunikacija sa serverom nije uspjela). Molimo pokušajte ponovno.');
      }

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Greška pri prijavi.');
      }

      console.log('[LOGIN] API Result:', { result });

      const roles: string[] = result.roles || [];

      // Enforce domain/portal-based role checks
      console.log("[LOGIN] Enforcing domain role check with roles:", roles);
      const staffRoles = ['TEACHER', 'ADMIN', 'MAIN_ADMIN', 'SCHOOL_ADMIN', 'HOMEROOM', 'DEPUTY', 'HOMEROOM_TEACHER', 'STAFF'];
      const studentRoles = ['STUDENT', 'PARENT'];

      if (isTeacherDomain) {
        const hasStaffRole = roles.some(role => staffRoles.includes(role));
        if (!hasStaffRole) {
          throw new Error("Ovaj portal je samo za zaposlenike škole.");
        }
      }

      if (isStudentDomain) {
        const hasStudentOrParentRole = roles.some(role => studentRoles.includes(role));
        if (!hasStudentOrParentRole) {
          throw new Error("Ovaj portal je samo za učenike i roditelje.");
        }
      }

      // If neither is production domain but isStudentPortal:
      if (!isTeacherDomain && !isStudentDomain) {
        if (isStudentPortal) {
          const hasStudentOrParentRole = roles.some(role => studentRoles.includes(role));
          if (!hasStudentOrParentRole) {
            throw new Error("Ovaj portal je samo za učenike i roditelje.");
          }
        } else {
          // Dev staff mode, enforce tab-specific selection
          if (loginType === 'STAFF') {
            const hasStaffRole = roles.some(role => staffRoles.includes(role));
            if (!hasStaffRole) {
              throw new Error("Ovaj portal je samo za zaposlenike škole.");
            }
          } else {
            const hasStudentOrParentRole = roles.some(role => studentRoles.includes(role));
            if (!hasStudentOrParentRole) {
              throw new Error("Ovaj portal je samo za učenike i roditelje.");
            }
          }
        }
      }

      // Set the session locally using the session from server
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token
      });

      if (sessionError) {
        throw sessionError;
      }

      if (result.mfa_setup_needed) {
        localStorage.setItem('mfaSetupNeeded', 'true');
        navigate('/auth/setup-authenticator', { replace: true });
        return;
      }
      
      console.log('[LOGIN] Session set successfully, waiting for AuthContext to load profile...');
      // AuthContext will handle state updates and we'll redirect via the useEffect
    } catch (err: any) {
      console.error('LOGIN REQUEST FAILED', err);
      let msg = err.message || 'Neispravna e-mail adresa ili lozinka.';
      if (err.message.includes('Invalid login credentials') || err.message.includes('Neispravni podaci za prijavu')) {
        msg = 'Neispravni podaci za prijavu.';
      }
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
          {/* Note: Demoinfo banner "Podaci za prijavu" is completely removed per user instructions */}

          {(!isTeacherDomain && !isStudentDomain && !isStudentPortal) && (
            <div className="flex border-b border-gray-300 bg-gray-50 uppercase tracking-tight font-bold text-[11px]">
              <button
                type="button"
                onClick={() => setLoginType('USER')}
                className={cn(
                  "flex-1 py-3 text-center transition-all h-14",
                  loginType === 'USER' ? "bg-white text-[#005c8d] border-t-4 border-[#005c8d]" : "text-gray-400 hover:text-gray-600 border-t-4 border-transparent"
                )}
              >
                Učenici i Roditelji
              </button>
              <button
                type="button"
                onClick={() => setLoginType('STAFF')}
                className={cn(
                  "flex-1 py-3 text-center transition-all h-14",
                  loginType === 'STAFF' ? "bg-white text-[#005c8d] border-t-4 border-[#005c8d]" : "text-gray-400 hover:text-gray-600 border-t-4 border-transparent"
                )}
              >
                Zaposlenici
              </button>
            </div>
          )}

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
                <div className="bg-white p-2 border border-red-100 text-[11px] font-bold overflow-hidden text-ellipsis">
                  {displayError}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest">
                E-mail ili korisničko ime
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Mail size={16} />
                </div>
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 text-sm outline-none focus:border-[#005c8d] focus:bg-blue-50/20 shadow-inner"
                  placeholder="nikola.duric ili nikola.duric@eskole.me"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest">PIN</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Lock size={16} />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 text-sm outline-none focus:border-[#005c8d] focus:bg-blue-50/20 shadow-inner"
                  placeholder="1234"
                />
              </div>
            </div>

            {loginType === 'STAFF' && (
              <div className="space-y-1 transition-all animate-in fade-in slide-in-from-top-2">
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest flex justify-between">
                  <span>Autentifikator Kod</span>
                  <span className="text-[7px] text-[#005c8d] font-black italic">Obavezno za zaposlenike</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
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
          
          <div className="flex justify-center flex-col items-center gap-4">
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest text-center max-w-[200px]">
              Samo ovlašteni korisnici s važećim certifikatom imaju pristup.
            </p>
            <button 
              type="button"
              onClick={async () => {
                if (!confirm('Ovo će resetirati ili inicijalizirati demo podatke. Nastaviti?')) return;
                setLoading(true);
                try {
                  const res = await fetch('/api/seed', { method: 'POST' });
                  const data = await res.json();
                  if (res.ok) toast.success('Baza podataka uspješno inicijalizirana!');
                  else throw new Error(data.error);
                } catch (err: any) {
                  toast.error('Greška pri inicijalizaciji: ' + err.message);
                } finally {
                  setLoading(false);
                }
              }}
              className="text-[8px] font-bold text-gray-300 hover:text-gray-500 uppercase tracking-tighter transition-colors"
            >
              Inicijaliziraj demo podatke
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
