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
  const loadingRef = React.useRef<string | null>(null);
  const userRef = React.useRef<User | null>(null);

  // Sync userRef with user state for use in callbacks
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // State for tracking if the first auth check has completed
  const [authInitialized, setAuthInitialized] = useState(false);

  useEffect(() => {
    console.count('[AUTH] AuthProvider Render');
    console.log('[AUTH] State:', { loading, authInitialized, hasUser: !!user, error: !!error });
  });

  useEffect(() => {
    console.log('[AUTH] Initializing AuthProvider...');
    
    let mounted = true;

    const initialize = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('[AUTH] Initial getSession error:', sessionError);
          if (mounted) {
            setLoading(false);
            setAuthInitialized(true);
          }
          return;
        }

        if (!session) {
          console.log('[AUTH] No initial session found.');
          if (mounted) {
            setError(null);
            setLoading(false);
            setAuthInitialized(true);
          }
        } else {
          console.log('[AUTH] Initial session found for:', session.user.id);
          setError(null);
          setSession(session);
          setSupabaseUser(session.user);
          loadingRef.current = session.user.id;
          await loadUserData(session.user.id);
          if (mounted) {
            setLoading(false);
            setAuthInitialized(true);
          }
        }
      } catch (err) {
        console.error('[AUTH] Critical error during initialization:', err);
        if (mounted) {
          setLoading(false);
          setAuthInitialized(true);
        }
      }
    };

    initialize();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      
      const userId = session?.user?.id;
      console.log(`[AUTH] Auth Event: ${event} | UID: ${userId || 'GUEST'}`);
      
      setSession(session);
      setSupabaseUser(session?.user ?? null);
      
      if (userId) {
        setError(null);
        if (loadingRef.current === userId && userRef.current) {
          setLoading(false);
          return;
        }

        if (loadingRef.current === userId && loading) {
          return;
        }
        
        loadingRef.current = userId;
        setLoading(true);
        try {
          await loadUserData(userId);
        } finally {
          if (mounted) setLoading(false);
        }
      } else {
        loadingRef.current = null;
        setUser(null);
        setUserSchoolRoles([]);
        setError(null);
        setLoading(false);
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
    
    // Add a failsafe timeout specifically for this user data load
    // If it hangs for 15s, we force fail it
    const loadFailsafe = setTimeout(() => {
      console.error(`[AUTH] loadUserData hanging for 15s, forcing error.`);
      setError('Učitavanje podataka profila traje predugo. Provjerite vezu.');
      setLoading(false);
    }, 15000);
    
    try {
      // 1. Fetch Profile
      const fetchProfile = async () => {
        console.log(`[AUTH] Fetching profile for ${authUserId}...`);
        const query = supabase
          .from('user_profiles')
          .select('*')
          .eq('auth_user_id', authUserId)
          .maybeSingle();

        // Race against a 12s timeout
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('TIMEOUT_PROFILE')), 12000)
        );

        return Promise.race([query, timeoutPromise]) as Promise<any>;
      };

      const { data: profileRaw, error: profileError } = await fetchProfile();

      if (profileError) {
        console.error('[AUTH] Profile fetch error:', profileError);
        throw profileError;
      }

      if (!profileRaw) {
        console.error('[AUTH] Profile record not found in DB for auth user:', authUserId);
        throw new Error('Vaš korisnički profil nije pronađen. Kontaktirajte administratora.');
      }

      const profile = mappers.user(profileRaw);
      console.log(`[AUTH] Profile loaded: ${profile.email}`);

      // 2. Fetch Roles
      console.log(`[AUTH] Fetching roles for profile ${profile.id}...`);
      const fetchRoles = async () => {
        const query = supabase
          .from('user_school_roles')
          .select('*')
          .eq('user_id', profile.id);

        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('TIMEOUT_ROLES')), 12000)
        );

        return Promise.race([query, timeoutPromise]) as Promise<any>;
      };

      const { data: rolesRaw, error: rolesError } = await fetchRoles();

      if (rolesError) {
        console.error('[AUTH] Roles fetch error:', rolesError);
        throw rolesError;
      }

      const roles = mapList(rolesRaw || [], mappers.userSchoolRole);
      console.log(`[AUTH] Roles loaded: ${roles.length}`);

      if (loadingRef.current === authUserId) {
        setUser(profile);
        setUserSchoolRoles(roles);
        setError(null);
      } else {
        console.warn(`[AUTH] loadUserData finished for ${authUserId} but current user is ${loadingRef.current}. Ignoring result.`);
      }
      
      console.log(`[AUTH] loadUserData SUCCESS in ${Date.now() - startTime}ms`);
    } catch (err: any) {
      if (err.message === 'TIMEOUT_PROFILE' || err.message === 'TIMEOUT_ROLES') {
        console.error(`[AUTH] loadUserData DB TIMEOUT for ${authUserId}`);
        setError('Baza podataka ne odgovara. Molimo provjerite internetsku vezu.');
      } else {
        console.error(`[AUTH] loadUserData FAILED for ${authUserId}:`, err.message);
        setError(err.message);
      }
      setUser(null);
      setUserSchoolRoles([]);
    } finally {
      clearTimeout(loadFailsafe);
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
