import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Role } from '../types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: Role[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, loading, error, userSchoolRoles, isMainAdmin, isStaff, isStudent, isParent, signOut } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-50">
        <div className="w-8 h-8 border-4 border-[#005c8d] border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-500 font-medium italic">Učitavanje podataka...</p>
      </div>
    );
  }

  // Handle Auth Error specifically
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center bg-slate-50 font-sans">
        <div className="bg-white p-12 border border-gray-300 max-w-md shadow-sm">
          <div className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldAlert size={24} strokeWidth={3} />
          </div>
          <h1 className="text-xl font-black text-slate-900 mb-2 tracking-tighter uppercase leading-none">Greška sustava</h1>
          <p className="text-[12px] text-slate-600 mb-8 leading-relaxed font-bold bg-red-50 p-4 border border-red-100">
            {error}
          </p>
          <div className="flex flex-col gap-2">
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-[#005c8d] text-white py-3 border border-[#004a71] font-black uppercase tracking-widest text-[10px] hover:bg-[#004a71] transition-all"
            >
              Pokušaj ponovno (Osvježi)
            </button>
            <button 
              onClick={() => signOut()} 
              className="w-full text-slate-400 font-bold uppercase tracking-[0.2em] text-[9px] hover:text-[#005c8d] py-2 transition-colors"
            >
              Odjava
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If Main Admin, allow everything
  if (isMainAdmin) return <>{children}</>;

  if (allowedRoles) {
    // Rely on useAuth pre-calculated booleans for common role checks
    const isAllowed = (
      (allowedRoles.includes(Role.TEACHER) && isStaff) ||
      (allowedRoles.includes(Role.ADMIN) && isStaff) ||
      (allowedRoles.includes(Role.SCHOOL_ADMIN) && isStaff) ||
      (allowedRoles.includes(Role.STUDENT) && isStudent) ||
      (allowedRoles.includes(Role.PARENT) && isParent) ||
      userSchoolRoles.some(r => allowedRoles.includes(r.role))
    );

    if (!isAllowed) {
      if (location.pathname.startsWith('/ematica')) {
        return (
          <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-center">
            <div className="max-w-md border border-slate-200 bg-white p-8 shadow-sm">
              <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">Pristup e-Matici nije dopušten</h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                e-Matica je dostupna samo administratorima škole, razrednicima i zamjenicima razrednika.
              </p>
              <button
                onClick={() => window.location.href = '/'}
                className="mt-6 bg-[#005c8d] px-5 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-white"
              >
                Povratak u sustav
              </button>
            </div>
          </div>
        );
      }

      if (location.pathname === '/') {
        // We are at home and not allowed anywhere specifically?
        // This is a weird state, probably roles not loaded or user has no roles.
        return (
          <div className="flex flex-col items-center justify-center h-screen bg-slate-50 p-6 text-center">
             <h1 className="text-xl font-black text-slate-900 mb-2 uppercase tracking-tighter">Pristup ograničen</h1>
             <p className="text-[12px] text-slate-500 font-bold uppercase tracking-widest max-w-xs mx-auto">
               Vaš korisnički profil trenutno nema dodijeljene uloge za ovaj dio sustava.
             </p>
             <button 
               onClick={() => window.location.href = '/login'}
               className="mt-8 bg-[#005c8d] text-white px-8 py-3 font-black uppercase text-[10px] tracking-widest"
             >
               Povratak na prijavu
             </button>
          </div>
        );
      }
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
}
