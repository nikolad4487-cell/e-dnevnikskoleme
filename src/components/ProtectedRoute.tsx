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
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
}
