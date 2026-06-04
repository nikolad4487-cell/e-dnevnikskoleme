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
  reloadUserData: () => Promise<void>;
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

  const isFetchingUserDataRef = React.useRef(false);

  // Hard failsafe for loading
  useEffect(() => {
    if (loading) {
      const timer = setTimeout(() => {
        console.error('[AUTH] CRITICAL: Loading timeout (10s) triggered. Force-failing loading state.');
        setLoading(false);
        if (!user && !error) {
          setError('Učitavanje podataka nije uspjelo u razumnom vremenu. Provjerite internetsku vezu.');
        }
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [loading, user, error]);

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
          await loadUserData(session.user.id);
          if (mounted) {
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
        
        // Use the same guard as in initialize
        if (loadingRef.current === userId && (user || isFetchingUserDataRef.current)) {
          console.log(`[AUTH] User ${userId} already loaded or loading, skipping duplicate call.`);
          return;
        }
        
        // Prevent infinite loops if multiple events fire
        if (loadingRef.current === userId && event !== 'SIGNED_IN') {
          return;
        }

        loadingRef.current = userId;
        loadUserData(userId);
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

  const withTimeout = <T,>(promise: any, ms: number, errorMessage: string): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(errorMessage)), ms)
      ),
    ]) as Promise<T>;
  };

  const loadUserData = async (authUserId: string) => {
    if (isFetchingUserDataRef.current) {
      console.log(`[AUTH] loadUserData already in progress for ${authUserId}, skipping.`);
      return;
    }

    const startTime = Date.now();
    console.log(`[AUTH] loadUserData START for ${authUserId}`);
    isFetchingUserDataRef.current = true;
    setLoading(true);
    
    // Total timeout for the entire sequence
    const controller = new AbortController();
    const loadFailsafe = setTimeout(() => {
      console.error(`[AUTH] loadUserData TIMEOUT after 35s for ${authUserId}`);
      controller.abort();
    }, 35000);
    
    try {
      // 1. Fetch Profile with retry
      let profileRaw = null;
      let profileError = null;
      let attempt = 0;
      const maxAttempts = 3;

      while (attempt < maxAttempts) {
        attempt++;
        console.log(`[AUTH] Fetching profile for ${authUserId}... (Attempt ${attempt}/${maxAttempts})`);
        try {
          const res = await withTimeout(
            supabase
              .from('user_profiles')
              .select('*')
              .eq('auth_user_id', authUserId)
              .maybeSingle(),
            15000,
            `Dohvaćanje profila je vremenski isteklo (Baza podataka nije dostupna, pokušaj ${attempt}).`
          ) as any;
          
          profileRaw = res.data;
          profileError = res.error;
          
          if (!profileError) {
             break; // Success
          }
        } catch (e: any) {
          console.error(`[AUTH] Profile fetch attempt ${attempt} failed:`, e);
          if (attempt === maxAttempts) {
             throw new Error("Povezivanje s bazom podataka nije uspjelo nakon više pokušaja. Provjerite internetsku vezu i pokušajte ponovno.");
          }
          await new Promise(r => setTimeout(r, 1500)); // wait before retry
        }
      }

      console.log(`[AUTH] Profile Result for ${authUserId}:`, { hasData: !!profileRaw, error: profileError });

      if (profileError) {
        console.error('[AUTH] Profile fetch error:', profileError);
        throw new Error(`Greška pri dohvaćanju profila: ${profileError.message || 'Nepoznata greška'}`);
      }

      if (!profileRaw) {
        console.error('[AUTH] Profile record not found in DB for auth user:', authUserId);
        throw new Error('Profil korisnika nije pronađen. Molimo kontaktirajte administratora.');
      }

      const profile = mappers.user(profileRaw);
      console.log(`[AUTH] Profile loaded: ${profile.email} (${profile.id})`);

      // 2. Fetch Roles with retry
      let rolesRawResult = null;
      let rolesError = null;
      let roleAttempt = 0;

      while (roleAttempt < maxAttempts) {
        roleAttempt++;
        console.log(`[AUTH] Fetching roles for profile ${profile.id}... (Attempt ${roleAttempt}/${maxAttempts})`);
        try {
          const res = await withTimeout(
            supabase
              .from('user_school_roles')
              .select('*')
              .eq('user_id', profile.id),
            15000,
            `Dohvaćanje uloga je vremenski isteklo (pokušaj ${roleAttempt}).`
          ) as any;
          
          rolesRawResult = res.data;
          rolesError = res.error;
          
          if (!rolesError) {
             break; // Success
          }
        } catch (e: any) {
          console.error(`[AUTH] Roles fetch attempt ${roleAttempt} failed:`, e);
          if (roleAttempt === maxAttempts) {
             throw new Error("Dohvaćanje uloga nije uspjelo nakon više pokušaja. Pokušajte ponovno.");
          }
          await new Promise(r => setTimeout(r, 1500));
        }
      }

      console.log(`[AUTH] Roles Result for ${profile.id}:`, { count: rolesRawResult?.length, error: rolesError });

      if (rolesError) {
        console.error('[AUTH] Roles fetch error:', rolesError);
        throw new Error(`Greška pri dohvaćanju uloga: ${rolesError.message}`);
      }

      let rolesData = rolesRawResult || [];

      // Optional: Auto-repair enrollments if needed, but keep it tight
      try {
        const { data: enrollments } = await withTimeout(
          supabase
            .from('student_class_enrollments')
            .select('class_id, classes(school_id)')
            .eq('student_id', profile.id)
            .eq('status', 'ACTIVE'),
          10000,
          "Dohvaćanje upisa u razred je vremenski isteklo."
        ) as any;

        if (enrollments && enrollments.length > 0) {
          const enrolledSchoolIds = [...new Set(enrollments.map((e: any) => e.classes?.school_id).filter(Boolean))];
          const existingSchoolIds = rolesData.filter(r => r.role === Role.STUDENT).map(r => r.school_id);
          const missingSchoolIds = enrolledSchoolIds.filter(id => !existingSchoolIds.includes(id));

          if (missingSchoolIds.length > 0) {
            console.log(`[AUTH] Auto-repair: Adding ${missingSchoolIds.length} student roles`);
            const newRoles = missingSchoolIds.map(schoolId => ({
              user_id: profile.id,
              school_id: schoolId,
              role: Role.STUDENT,
              status: 'ACTIVE'
            }));
            
            await withTimeout(
              supabase.from('user_school_roles').insert(newRoles),
              3000,
              "Spremanje uloga je vremenski isteklo."
            );
            const { data: refetchedRoles } = await withTimeout(
              supabase.from('user_school_roles').select('*').eq('user_id', profile.id),
              2000,
              "Osvježavanje uloga je vremenski isteklo."
            ) as any;
            if (refetchedRoles) rolesData = refetchedRoles;
          }
        }
      } catch (e) {
        console.warn('[AUTH] Enrollment repair failed, non-critical:', e);
      }

      const roles = mapList(rolesData, mappers.userSchoolRole);
      
      setUser(profile);
      setUserSchoolRoles(prev => {
        if (JSON.stringify(prev) === JSON.stringify(roles)) return prev;
        return roles;
      });
      setError(null);
      
      console.log(`[AUTH] loadUserData SUCCESS in ${Date.now() - startTime}ms`);
    } catch (err: any) {
      console.error(`[AUTH] loadUserData FAILED after ${Date.now() - startTime}ms:`, err.message);
      setError(err.message || 'Neuspjelo učitavanje podataka.');
      setUser(null);
      setUserSchoolRoles([]);
    } finally {
      clearTimeout(loadFailsafe);
      isFetchingUserDataRef.current = false;
      setLoading(false);
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

  const reloadUserDataWrapper = async () => {
    if (supabaseUser) {
      await loadUserData(supabaseUser.id);
    }
  };

  const value = React.useMemo(() => ({
    user,
    supabaseUser,
    session,
    userSchoolRoles,
    loading,
    error,
    signOut,
    reloadUserData: reloadUserDataWrapper,
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
