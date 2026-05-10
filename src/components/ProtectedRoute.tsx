import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Role } from '../types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: Role[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, loading, userSchoolRoles, isMainAdmin, isStaff, isStudent, isParent } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-50">
        <div className="w-8 h-8 border-4 border-[#005c8d] border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-500 font-medium italic">Učitavanje podataka...</p>
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
