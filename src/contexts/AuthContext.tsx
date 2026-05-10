import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { User as SupabaseUser, Session } from '@supabase/supabase-js';
import { User, Role, UserSchoolRole } from '../types';
import { mapObject, mapList, mappers } from '../lib/mappers';

interface AuthContextType {
  user: User | null;
  supabaseUser: SupabaseUser | null;
  session: Session | null;
  userSchoolRoles: UserSchoolRole[];
  loading: boolean;
  error: string | null;
  signOut: () => Promise<void>;
  isMainAdmin: boolean;
  isStaff: boolean;
  isTeacher: boolean;
  isStudent: boolean;
  isParent: boolean;
  highestRole: Role | null;
  formattedRoles: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const APP_VERSION = '1.0.5'; // Increment this for force logouts

const ROLE_PRIORITY: Record<Role, number> = {
  [Role.MAIN_ADMIN]: 0,
  [Role.ADMIN]: 0,
  [Role.SCHOOL_ADMIN]: 1,
  [Role.HOMEROOM]: 2,
  [Role.DEPUTY]: 3,
  [Role.TEACHER]: 4,
  [Role.STUDENT]: 5,
  [Role.PARENT]: 6
};

const ROLE_DISPLAY_NAMES: Record<Role, string> = {
  [Role.MAIN_ADMIN]: 'Glavni administrator',
  [Role.ADMIN]: 'Administrator',
  [Role.SCHOOL_ADMIN]: 'Administrator škole',
  [Role.TEACHER]: 'Nastavnik',
  [Role.HOMEROOM]: 'Razrednik',
  [Role.DEPUTY]: 'Zamjenik razrednika',
  [Role.STUDENT]: 'Učenik',
  [Role.PARENT]: 'Roditelj'
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userSchoolRoles, setUserSchoolRoles] = useState<UserSchoolRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('[AUTH] Initializing AuthProvider...');
    
    /* Temporarily disabled version check to fix infinite loop
    const storedVersion = localStorage.getItem('app_version');
    if (storedVersion && storedVersion !== APP_VERSION) {
      console.log('[AUTH] New version detected, performing full system reset.');
      
      const performGlobalSignOut = async () => {
        try {
          // Global sign out to clear all sessions
          await supabase.auth.signOut({ scope: "global" });
        } catch (e) {
          console.error('[AUTH] Sign out error:', e);
        } finally {
          // Clear ALL storage
          localStorage.clear();
          sessionStorage.clear();
          
          // Set flag to prevent auto-login on LoginPage
          localStorage.setItem('forceLoggedOut', 'true');
          localStorage.setItem('app_version', APP_VERSION);
          
          // Hard redirect to login
          window.location.href = "/login";
        }
      };
      
      performGlobalSignOut();
      return;
    }
    localStorage.setItem('app_version', APP_VERSION);
    */

    let mounted = true;
    let lastLoadedUserId: string | null = null;

    // Set loading initially
    setLoading(true);

    const isForceLoggedOut = localStorage.getItem('forceLoggedOut') === 'true';

    // Initial session check
    supabase.auth.getSession().then(({ data: { session }, error: sessionError }) => {
      if (!mounted) return;
      
      if (sessionError) {
        console.error('[AUTH] getSession error:', sessionError);
        // If refresh token is invalid, clear it
        if (sessionError.message.toLowerCase().includes('refresh_token')) {
          localStorage.clear();
        }
        setLoading(false);
        return;
      }

      const userId = session?.user?.id;
      console.log('[AUTH] Initial getSession:', userId || 'GUEST');
      
      if (isForceLoggedOut && userId) {
        console.log('[AUTH] Blocking initial session auto-login.');
        setLoading(false);
        return;
      }

      setSession(session);
      setSupabaseUser(session?.user ?? null);
      
      if (userId) {
        lastLoadedUserId = userId;
        loadUserData(userId).finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    }).catch(err => {
      console.error('[AUTH] Initial session check error:', err);
      if (mounted) setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      
      const currentUserId = session?.user?.id;
      console.log(`[AUTH] Auth Event: ${event} | UID: ${currentUserId || 'GUEST'}`);
      
      // Removed forceLoggedOut check to prevent loops
      setSession(session);
      setSupabaseUser(session?.user ?? null);
      
      if (currentUserId) {
        console.log(`[AUTH] AUTH LOAD START for ${currentUserId}`);
        if (lastLoadedUserId === currentUserId) {
          if (user) {
            console.log(`[AUTH] User already loaded, skipping reload.`);
            setLoading(false);
            return;
          }
        }
        
        lastLoadedUserId = currentUserId;
        setLoading(true);
        try {
          await loadUserData(currentUserId);
          console.log(`[AUTH] AUTH LOAD END success`);
        } catch (err) {
          console.error(`[AUTH] AUTH LOAD END error`);
        } finally {
          if (mounted) setLoading(false);
        }
      } else {
        lastLoadedUserId = null;
        setUser(null);
        setUserSchoolRoles([]);
        setLoading(false);
        setError(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const loadUserData = async (authUserId: string) => {
    const startTime = Date.now();
    console.log(`[AUTH] loadUserData START for ${authUserId}`);
    
    // We remove the hard 120s timeout promise here and let Supabase handle its own networking.
    // If we really want a timeout, we'll keep it but shorter and more discrete.
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 60000); // 60s is plenty

    try {
      // 1. Fetch Profile
      const { data: profileRaw, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('auth_user_id', authUserId)
        .maybeSingle();

      if (profileError) throw profileError;

      let finalProfileRaw = profileRaw;

      if (!finalProfileRaw) {
        console.log('[AUTH] Profile missing, attempting auto-creation...');
        const { data: { session } } = await supabase.auth.getSession();
        const email = session?.user?.email;
        const name = session?.user?.user_metadata?.name;

        if (email) {
          const res = await fetch('/api/ensure-profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ authUserId, email, name })
          });
          
          if (res.ok) {
            const data = await res.json();
            finalProfileRaw = data.profile;
            console.log('[AUTH] Auto-creation successful:', finalProfileRaw.id);
          } else {
            const errData = await res.json();
            console.error('[AUTH] Auto-creation failed:', errData.error);
          }
        }
      }

      if (!finalProfileRaw) {
        throw new Error('Profil nije pronađen. Kontaktirajte administratora za pomoć.');
      }

      const profile = mappers.user(finalProfileRaw);

      // 2. Fetch Roles (now that we have profile.id)
      const { data: rolesRaw, error: rolesError } = await supabase
        .from('user_school_roles')
        .select('id, user_id, school_id, role, status')
        .eq('user_id', profile.id);

      if (rolesError) throw rolesError;

      const roles = mapList(rolesRaw || [], mappers.userSchoolRole);

      setUser(profile);
      setUserSchoolRoles(roles);
      setError(null);
      console.log(`[AUTH] loadUserData SUCCESS in ${Date.now() - startTime}ms`);
    } catch (err: any) {
      const msg = err.name === 'AbortError' ? 'Sinkronizacija traje predugo. Provjerite vezu.' : err.message;
      console.error(`[AUTH] loadUserData FAILED in ${Date.now() - startTime}ms:`, msg);
      setError(msg);
      // We don't necessarily clear user if it was already loaded, but here it's initial load
      setUser(null);
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const signOut = async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
      localStorage.removeItem('selectedSchoolId');
      localStorage.removeItem('selectedClassId');
      localStorage.removeItem('selectedChildId');
    } catch (e) {
      console.error('Sign out error:', e);
    } finally {
      setLoading(false);
    }
  };

  const isMainAdmin = React.useMemo(() => 
    userSchoolRoles.some(r => r.role === Role.MAIN_ADMIN || r.role === Role.ADMIN)
  , [userSchoolRoles]);

  const isStaff = React.useMemo(() => 
    isMainAdmin || 
    userSchoolRoles.some(r => [Role.TEACHER, Role.SCHOOL_ADMIN, Role.HOMEROOM, Role.DEPUTY].includes(r.role))
  , [isMainAdmin, userSchoolRoles]);

  const isTeacher = React.useMemo(() => 
    userSchoolRoles.some(r => [Role.TEACHER, Role.HOMEROOM, Role.DEPUTY].includes(r.role))
  , [userSchoolRoles]);

  const isStudent = React.useMemo(() => 
    userSchoolRoles.some(r => r.role === Role.STUDENT) && !isMainAdmin
  , [isMainAdmin, userSchoolRoles]);

  const isParent = React.useMemo(() => 
    userSchoolRoles.some(r => r.role === Role.PARENT)
  , [userSchoolRoles]);

  const allRoles = React.useMemo(() => {
    const rolesSet = new Set<Role>();
    userSchoolRoles.forEach(r => rolesSet.add(r.role));
    return Array.from(rolesSet);
  }, [userSchoolRoles]);

  const highestRole = React.useMemo(() => {
    if (allRoles.length === 0) return null;
    return allRoles.reduce((highest, current) => {
      const highestPriority = ROLE_PRIORITY[highest] ?? 99;
      const currentPriority = ROLE_PRIORITY[current] ?? 99;
      return currentPriority < highestPriority ? current : highest;
    });
  }, [allRoles]);

  const formattedRoles = React.useMemo(() => {
    if (allRoles.length === 0) return '';
    return allRoles
      .sort((a, b) => (ROLE_PRIORITY[a] ?? 99) - (ROLE_PRIORITY[b] ?? 99))
      .map(r => ROLE_DISPLAY_NAMES[r])
      .join(', ');
  }, [allRoles]);

  const value = React.useMemo(() => ({
    user,
    supabaseUser,
    session,
    userSchoolRoles,
    loading,
    error,
    signOut,
    isMainAdmin,
    isStaff,
    isTeacher,
    isStudent,
    isParent,
    highestRole,
    formattedRoles
  }), [user, supabaseUser, session, userSchoolRoles, loading, error, isMainAdmin, isStaff, isTeacher, isStudent, isParent, highestRole, formattedRoles]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
