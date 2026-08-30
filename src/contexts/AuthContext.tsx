import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { User as SupabaseUser, Session } from '@supabase/supabase-js';
import { User, Role, UserSchoolRole, isSchoolAdminUser, isSuperAdminUser, hasAnyRole } from '../types';
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
  isSuperAdmin: boolean;
  isSchoolAdmin: boolean;
  isMainAdmin: boolean;
  isStaff: boolean;
  isTeacher: boolean;
  isStudent: boolean;
  isParent: boolean;
  highestRole: Role | null;
  formattedRoles: string;
  isStudentPortal: boolean;
  isTeacherDomain: boolean;
  isStudentDomain: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const APP_VERSION = '1.0.5'; // Increment this for force logouts

const ROLE_PRIORITY: Record<Role, number> = {
  [Role.SUPER_ADMIN]: 0,
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
  [Role.SUPER_ADMIN]: 'Glavni administrator',
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
  const loadedUserIdRef = React.useRef<string | null>(null);
  const isLoadingUserRef = React.useRef(false);

  useEffect(() => {
    console.log("AUTH PROVIDER INIT");
    console.log('[AUTH] AuthProvider MOUNT');
    return () => console.log('[AUTH] AuthProvider UNMOUNT');
  }, []);

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
        console.error('[AUTH] CRITICAL: Loading timeout (30s) triggered. Force-failing loading state.');
        setLoading(false);
        if (!user && !error) {
          setError('Učitavanje podataka nije uspjelo u razumnom vremenu. Provjerite internetsku vezu.');
        }
      }, 30000);
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

        // Check for inactivity on browser/tab start
        const lastSavedActivityStr = localStorage.getItem('auth.lastActivity') || localStorage.getItem('lastActivity');
        const INACTIVITY_LIMIT_MS = 45 * 60 * 1000;
        let shouldForceLogout = false;

        if (session && lastSavedActivityStr) {
          const lastSavedActivity = parseInt(lastSavedActivityStr, 10);
          const timePassed = Date.now() - lastSavedActivity;
          if (timePassed > INACTIVITY_LIMIT_MS) {
            shouldForceLogout = true;
          }
        }

        if (session && shouldForceLogout) {
          console.warn('[AUTH] Session expired due to inactivity while application was closed/off. Signing out.');
          await supabase.auth.signOut();
          localStorage.removeItem('lastActivity');
          localStorage.removeItem('auth.lastActivity');
          localStorage.removeItem('selectedSchoolId');
          localStorage.removeItem('selectedClassId');
          localStorage.removeItem('selectedChildId');
          sessionStorage.clear();
          if (mounted) {
            setSession(null);
            setSupabaseUser(null);
            setUser(null);
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
          // Update lastActivity timestamp to now on successful run
          const nowTime = Date.now().toString();
          localStorage.setItem('lastActivity', nowTime);
          localStorage.setItem('auth.lastActivity', nowTime);
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
        if (event === "SIGNED_IN") {
          const incomingUserId = session?.user?.id ?? null;
          
          // Check for cached data after remount
          const cachedUserId = sessionStorage.getItem("auth.loadedUserId");
          const cachedAt = Number(sessionStorage.getItem("auth.loadedAt") || "0");
          const isFresh = Date.now() - cachedAt < 5 * 60 * 1000;

          if (
            incomingUserId &&
            cachedUserId === incomingUserId &&
            isFresh
          ) {
            console.log("[AUTH] Duplicate SIGNED_IN after remount ignored from sessionStorage");
            const cachedProfile = sessionStorage.getItem("auth.profile");
            const cachedRoles = sessionStorage.getItem("auth.roles");
            
            setSession(session);
            if (cachedProfile) setUser(JSON.parse(cachedProfile));
            if (cachedRoles) setUserSchoolRoles(JSON.parse(cachedRoles));
            
            setAuthInitialized(true);
            setLoading(false);
            return;
          }

          if (
            incomingUserId &&
            loadedUserIdRef.current === incomingUserId &&
            user &&
            userSchoolRoles.length > 0
          ) {
            console.log("[AUTH] Duplicate SIGNED_IN ignored, data already present.");
            setSession(session);
            setLoading(false);
            return;
          }

          if (isLoadingUserRef.current) {
            console.log("[AUTH] SIGNED_IN ignored because user data is already loading");
            setSession(session);
            return;
          }
          
          loadUserData(incomingUserId);
        } else if (event === "TOKEN_REFRESHED") {
          console.log("[AUTH] TOKEN_REFRESHED: Sesija osvježena, podaci ostaju isti.");
          setSession(session);
        }
      } else if (event === "SIGNED_OUT") {
        setUser(null);
        setUserSchoolRoles([]);
        setError(null);
        setLoading(false);
        sessionStorage.removeItem("auth.loadedUserId");
        sessionStorage.removeItem("auth.loadedAt");
        sessionStorage.removeItem("auth.profile");
        sessionStorage.removeItem("auth.roles");
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
    if (isLoadingUserRef.current) {
      console.log(`[AUTH] loadUserData already in progress for ${authUserId}, skipping.`);
      return;
    }

    const startTime = Date.now();
    console.log(`[AUTH] loadUserData START for ${authUserId}`);
    isLoadingUserRef.current = true;
    
    // Only set loading true if we don't have user data yet
    if (!user) {
      setLoading(true);
    }
    
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
        console.log('[AUTH] Profile record not found in DB for auth user:', authUserId);
        
        let userEmail = supabaseUser?.email;
        if (!userEmail) {
          const { data: { user: currUser } } = await supabase.auth.getUser();
          userEmail = currUser?.email;
        }
        
        if (userEmail === 'nikolad4487@gmail.com' || userEmail === 'skola@skolehr.xyz' || userEmail?.endsWith('@skolehr.xyz')) {
          console.log('[AUTH] Auto-provisioning MAIN_ADMIN profile for:', userEmail);
          const newProfile = {
            auth_user_id: authUserId,
            email: userEmail,
            name: userEmail === 'nikolad4487@gmail.com' ? 'Nikola Đurić (Admin)' : 'Administrator',
            role: 'MAIN_ADMIN',
            access_role: 'super_admin',
            is_first_login: false,
            requires_password_change: false,
            requires_authenticator_setup: false
          };
          
          const { data: insertedProfile, error: insertError } = await supabase
            .from('user_profiles')
            .insert(newProfile)
            .select()
            .single();
            
          if (insertError) {
            console.error('[AUTH] Error auto-provisioning profile:', insertError);
            throw new Error('Profil korisnika nije pronađen. Molimo kontaktirajte administratora.');
          }
          
          profileRaw = insertedProfile;
          
          // Also insert user_school_role for this user
          const newRole = {
            user_id: profileRaw.id,
            role: 'MAIN_ADMIN',
            status: 'ACTIVE'
          };
          
          const { error: roleInsertError } = await supabase
            .from('user_school_roles')
            .insert(newRole);
            
          if (roleInsertError) {
            console.error('[AUTH] Error auto-provisioning school role:', roleInsertError);
          }
        } else {
          throw new Error('Profil korisnika nije pronađen. Molimo kontaktirajte administratora.');
        }
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
      loadedUserIdRef.current = authUserId;
      
      // Store in cache for remount persistence
      sessionStorage.setItem("auth.loadedUserId", authUserId);
      sessionStorage.setItem("auth.loadedAt", Date.now().toString());
      sessionStorage.setItem("auth.profile", JSON.stringify(profile));
      sessionStorage.setItem("auth.roles", JSON.stringify(roles));
      
      console.log(`[AUTH] loadUserData SUCCESS in ${Date.now() - startTime}ms`);
    } catch (err: any) {
      console.error(`[AUTH] loadUserData FAILED after ${Date.now() - startTime}ms:`, err.message);
      setError(err.message || 'Neuspjelo učitavanje podataka.');
      setUser(null);
      setUserSchoolRoles([]);
    } finally {
      clearTimeout(loadFailsafe);
      isLoadingUserRef.current = false;
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
      localStorage.removeItem('lastActivity');
      localStorage.removeItem('auth.lastActivity');
      sessionStorage.clear();
    } catch (e) {
      console.error('Sign out error:', e);
    } finally {
      setLoading(false);
    }
  };

  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  console.log("HOSTNAME", hostname);

  const isTeacherDomain = hostname === "e-dnevnik.skolehr.xyz" || hostname === "ednevnik.skolehr.xyz";
  const isStudentDomain = hostname === "ocjene.skolehr.xyz";

  if (typeof window !== 'undefined' && hostname && !isTeacherDomain && !isStudentDomain && !hostname.includes('localhost') && !hostname.includes('run.app') && !hostname.includes('vercel.app') && !hostname.includes('127.0.0.1')) {
    console.warn("[AUTH] Unrecognized hostname:", hostname);
  }

  const portalType = import.meta.env.VITE_APP_PORTAL || 'staff';
  const isStudentPortal = isStudentDomain || (!isTeacherDomain && (portalType === 'student'));

  const effectiveSchoolRoles = React.useMemo(() => {
    if (isStudentPortal) {
      return userSchoolRoles.filter(r => r.role === Role.STUDENT || r.role === Role.PARENT);
    }
    return userSchoolRoles;
  }, [userSchoolRoles, isStudentPortal]);

  const isSuperAdmin = React.useMemo(() => {
    return isSuperAdminUser(user, effectiveSchoolRoles);
  }, [user, effectiveSchoolRoles]);

  const isSchoolAdmin = React.useMemo(() => {
    return isSchoolAdminUser(user, effectiveSchoolRoles);
  }, [user, effectiveSchoolRoles]);

  const isMainAdmin = React.useMemo(() => {
    return isSuperAdmin || isSchoolAdmin;
  }, [isSuperAdmin, isSchoolAdmin]);

  const isStaff = React.useMemo(() => 
    isSchoolAdmin || 
    isSuperAdmin ||
    effectiveSchoolRoles.some(r => [Role.TEACHER, Role.SCHOOL_ADMIN, Role.ADMIN, Role.SUPER_ADMIN, Role.MAIN_ADMIN, Role.HOMEROOM, Role.DEPUTY].includes(r.role))
  , [isSchoolAdmin, isSuperAdmin, effectiveSchoolRoles]);

  const isTeacher = React.useMemo(() => 
    effectiveSchoolRoles.some(r => [Role.TEACHER, Role.HOMEROOM, Role.DEPUTY].includes(r.role))
  , [effectiveSchoolRoles]);

  const isStudent = React.useMemo(() => 
    effectiveSchoolRoles.some(r => r.role === Role.STUDENT) && !isMainAdmin
  , [isMainAdmin, effectiveSchoolRoles]);

  const isParent = React.useMemo(() => 
    effectiveSchoolRoles.some(r => r.role === Role.PARENT)
  , [effectiveSchoolRoles]);

  const allRoles = React.useMemo(() => {
    const rolesSet = new Set<Role>();
    effectiveSchoolRoles.forEach(r => rolesSet.add(r.role));
    return Array.from(rolesSet);
  }, [effectiveSchoolRoles]);

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
    userSchoolRoles: effectiveSchoolRoles,
    loading,
    error,
    signOut,
    reloadUserData: reloadUserDataWrapper,
    isSuperAdmin,
    isSchoolAdmin,
    isMainAdmin,
    isStaff,
    isTeacher,
    isStudent,
    isParent,
    highestRole,
    formattedRoles,
    isStudentPortal,
    isTeacherDomain,
    isStudentDomain
  }), [user, supabaseUser, session, effectiveSchoolRoles, loading, error, isSuperAdmin, isSchoolAdmin, isMainAdmin, isStaff, isTeacher, isStudent, isParent, highestRole, formattedRoles, isStudentPortal, isTeacherDomain, isStudentDomain]);

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
