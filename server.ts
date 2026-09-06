import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import fs from "fs";
import crypto from "crypto";
import { GoogleGenAI, Type } from "@google/genai";
import { verifyPin, hashPin } from "./src/pinUtils.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Flat file JSON DB for fallback / guaranteed local persistence
const isVercel = process.env.VERCEL === "1";
const DATA_DIR = isVercel 
  ? path.join("/tmp", "data")
  : path.join(__dirname, "data");
const SOURCE_DATA_DIR = path.join(process.cwd(), "data");

try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (err: any) {
  console.warn(`[SERVER] Warning: Failed to create DATA_DIR at ${DATA_DIR}:`, err.message);
}

function initJsonFile(filename: string) {
  const filePath = path.join(DATA_DIR, filename);
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify([], null, 2), "utf-8");
    }
  } catch (err: any) {
    console.warn(`[SERVER] Warning: Failed to initialize JSON file ${filename}:`, err.message);
  }
}

initJsonFile("lektire.json");
initJsonFile("pedagoska_dokumentacija.json");
initJsonFile("student_pedagogical_profiles.json");
initJsonFile("student_pedagogical_year_notes.json");
initJsonFile("daily_notes.json");
initJsonFile("overall_success_audit_logs.json");
initJsonFile("final_thesis.json");
initJsonFile("practicum_placements.json");
initJsonFile("practicum_logs.json");
initJsonFile("practicum_evaluations.json");
initJsonFile("student_registrations.json");
initJsonFile("student_transfers.json");
initJsonFile("competitions.json");
initJsonFile("payments.json");
initJsonFile("final_exam_defense_schedule.json");
initJsonFile("final_exam_defense_commission_members.json");
initJsonFile("matura_registrations.json");
initJsonFile("matura_settings.json");
initJsonFile("matura_exam_schedule.json");
initJsonFile("matura_results.json");
initJsonFile("matura_objections.json");
initJsonFile("matura_study_applications.json");
initJsonFile("matura_study_programs.json");

function readJsonFile(filename: string): any[] {
  try {
    const filePath = path.join(DATA_DIR, filename);
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error reading flat JSON file ${filename}:`, error);
    return [];
  }
}

function writeJsonFile(filename: string, data: any[]) {
  try {
    const filePath = path.join(DATA_DIR, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (error) {
    console.error(`Error writing flat JSON file ${filename}:`, error);
  }
}

function normalizeSupabaseUrl(value: string | undefined): string {
  const cleaned = String(value || "").trim().replace(/^['"]|['"]$/g, "");
  if (!cleaned) return "";
  if (/^https?:\/\//i.test(cleaned)) return cleaned.replace(/\/+$/, "");
  if (/^[a-z0-9-]+\.supabase\.co$/i.test(cleaned)) return `https://${cleaned}`;
  return cleaned.replace(/\/+$/, "");
}

function readBundledJsonFile(filename: string): any[] {
  try {
    const filePath = path.join(SOURCE_DATA_DIR, filename);
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error reading bundled JSON file ${filename}:`, error);
    return [];
  }
}

const FALLBACK_SUPABASE_URL = "https://hkqlbeetlvrplaeubncc.supabase.co";
const configuredSupabaseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
const configuredSupabaseUrlLooksValid = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(configuredSupabaseUrl);
const supabaseUrl = configuredSupabaseUrlLooksValid ? configuredSupabaseUrl : FALLBACK_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

// Supabase Admin Client (Service Role)
let supabaseAdmin: any;
let supabaseAuthClient: any;
if (supabaseUrl && supabaseServiceKey) {
  console.log("[SERVER] Supabase admin URL configured:", supabaseUrl);
  console.log("[SERVER] Supabase URL source:", configuredSupabaseUrlLooksValid ? "environment" : "fallback");
  console.log("[SERVER] Supabase service key configured:", Boolean(supabaseServiceKey));
  console.log("[SERVER] Supabase anon key configured:", Boolean(supabaseAnonKey));
  supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  supabaseAuthClient = createClient(supabaseUrl, supabaseAnonKey || supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
} else {
  console.warn("[SERVER] Supabase credentials missing. Admin features and seeder will be unavailable.", {
    hasSupabaseUrl: Boolean(supabaseUrl),
    configuredSupabaseUrl,
    usingFallbackSupabaseUrl: !configuredSupabaseUrlLooksValid,
    hasServiceRoleKey: Boolean(supabaseServiceKey),
    hasAnonKey: Boolean(supabaseAnonKey)
  });
}

async function signInWithPasswordDirect(email: string, password: string) {
  const authKey = supabaseAnonKey || supabaseServiceKey;
  if (!supabaseUrl || !authKey) {
    return {
      data: null,
      error: {
        name: "MissingSupabaseAuthConfig",
        message: "Supabase Auth configuration is missing.",
        status: 500
      }
    };
  }

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": authKey,
        "Authorization": `Bearer ${authKey}`
      },
      body: JSON.stringify({ email, password })
    });

    const raw = await response.text();
    console.log("[LOGIN_API] Direct Supabase Auth status:", response.status);
    console.log("[LOGIN_API] Direct Supabase Auth raw length:", raw.length);

    let parsed: any = null;
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch (parseError) {
        console.error("[LOGIN_API] Direct Supabase Auth JSON parse error:", parseError);
      }
    }

    if (!response.ok) {
      return {
        data: null,
        error: {
          name: "SupabaseAuthHttpError",
          message: parsed?.error_description || parsed?.msg || parsed?.message || raw || "Supabase Auth request failed.",
          status: response.status
        }
      };
    }

    return {
      data: {
        user: parsed?.user,
        session: {
          access_token: parsed?.access_token,
          refresh_token: parsed?.refresh_token,
          expires_in: parsed?.expires_in,
          expires_at: parsed?.expires_at,
          token_type: parsed?.token_type,
          user: parsed?.user
        }
      },
      error: null
    };
  } catch (error: any) {
    console.error("[LOGIN_API] Direct Supabase Auth fetch failed:", {
      name: error?.name,
      message: error?.message,
      cause: error?.cause?.message || String(error?.cause || "")
    });
    return {
      data: null,
      error: {
        name: error?.name || "SupabaseAuthFetchError",
        message: error?.message || "fetch failed",
        cause: error?.cause?.message || String(error?.cause || ""),
        status: 503
      }
    };
  }
}

async function startServer() {
  try {
    const app = express();
    const PORT = 3000;

    app.use((req: any, res: any, next: any) => {
      if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
        next();
      } else {
        express.json()(req, res, next);
      }
    });

    // Run startup migrations for final exam defense schedule tables if supabase is available
    if (supabaseAdmin) {
      try {
        console.log("[SERVER] Automatically checking and running startup DDL migrations for final exam defense schedules...");
        const ddlQuery = `
          CREATE TABLE IF NOT EXISTS public.final_exam_defense_schedule (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            school_id uuid NOT NULL,
            school_year text NOT NULL,
            class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
            defense_time text NOT NULL,
            classroom text NOT NULL,
            created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now()
          );

          CREATE TABLE IF NOT EXISTS public.final_exam_defense_commission_members (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            schedule_id uuid NOT NULL REFERENCES public.final_exam_defense_schedule(id) ON DELETE CASCADE,
            teacher_profile_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
            is_homeroom_teacher boolean DEFAULT false,
            created_at timestamptz DEFAULT now(),
            UNIQUE(schedule_id, teacher_profile_id)
          );
          
          ALTER TABLE public.school_events ADD COLUMN IF NOT EXISTS classroom text;
        `;
        if (typeof supabaseAdmin.query === 'function') {
          await supabaseAdmin.query(ddlQuery);
          console.log("[SERVER] Startup migrations executed successfully.");
        } else {
          console.warn("[SERVER] supabaseAdmin.query is not a function. Table creation script skipped (falling back onto flat JSON).");
        }
      } catch (migrationErr: any) {
        console.error("[SERVER] Startup migration error:", migrationErr.message);
      }
    }

    // Middleware to log requests
    app.use((req, res, next) => {
      console.log(`[${req.method}] ${req.url}`);
      next();
    });

    app.get("/api/health/env", (_req, res) => {
      const supabaseUrlLooksValid = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl);
      res.json({
        success: true,
        environment: {
          vercel: process.env.VERCEL === "1",
          nodeEnv: process.env.NODE_ENV || null
        },
        supabase: {
          hasUrl: Boolean(supabaseUrl),
          configuredUrlPresent: Boolean(configuredSupabaseUrl),
          configuredUrlLooksValid: configuredSupabaseUrlLooksValid,
          usingFallbackUrl: !configuredSupabaseUrlLooksValid,
          urlLooksValid: supabaseUrlLooksValid,
          urlHost: supabaseUrl ? (() => {
            try {
              return new URL(supabaseUrl).host;
            } catch {
              return "INVALID_URL";
            }
          })() : null,
          hasAnonKey: Boolean(supabaseAnonKey),
          anonKeyLooksLikeJwt: /^eyJ/i.test(supabaseAnonKey || ""),
          hasServiceRoleKey: Boolean(supabaseServiceKey),
          serviceRoleKeyLooksLikeJwt: /^eyJ/i.test(supabaseServiceKey || "")
        }
      });
    });

    // In-memory caches for backend session inactivity monitoring
    const tokenUserCacheForInactivity = new Map<string, { userId: string; expires: number }>();
    const userLastActivityMap = new Map<string, number>();
    const INACTIVITY_LIMIT_MS = 45 * 60 * 1000;

    app.use(async (req, res, next) => {
      // 1. Only intercept /api/* routes, excluding non-session/pre-session setup endpoints
      if (!req.url.startsWith("/api/")) {
        return next();
      }

      const excludedRoutes = [
        "/api/auth/login",
        "/api/verify-totp",
        "/api/verify-totp-test"
      ];

      // Check if the current URL starts with any excluded path
      const isExcluded = excludedRoutes.some(route => req.url.startsWith(route));
      if (isExcluded) {
        return next();
      }

      // 2. Check authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return next();
      }

      const token = authHeader.replace("Bearer ", "");
      if (!token) {
        return next();
      }

      try {
        // Resolve userId from cache or Supabase Auth
        let userId: string | null = null;
        const now = Date.now();
        const cached = tokenUserCacheForInactivity.get(token);

        if (cached && cached.expires > now) {
          userId = cached.userId;
        } else if (supabaseAdmin) {
          const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
          if (!authError && user) {
            userId = user.id;
            tokenUserCacheForInactivity.set(token, {
              userId: user.id,
              expires: now + 30000 // Cache resolved user ID for 30 seconds for high-performance
            });
          }
        }

        if (userId) {
          // Check last activity
          const lastActivity = userLastActivityMap.get(userId);
          const clientLastActivityHeader = req.headers["x-last-activity"];

          if (lastActivity) {
            const passed = now - lastActivity;
            if (passed > INACTIVITY_LIMIT_MS) {
              console.warn(`[BACKEND INACTIVITY] Session expired for user ${userId}. ${passed}ms since last activity.`);
              userLastActivityMap.delete(userId);
              return res.status(401).json({ error: "Session expired due to inactivity" });
            }
          } else if (clientLastActivityHeader) {
            // Fallback to client-asserted last activity (highly robust across server reboots)
            const clientTime = parseInt(clientLastActivityHeader as string, 10);
            if (!isNaN(clientTime)) {
              const passed = now - clientTime;
              if (passed > INACTIVITY_LIMIT_MS) {
                console.warn(`[BACKEND INACTIVITY] Session expired (client header) for user ${userId}. ${passed}ms since client last activity.`);
                return res.status(401).json({ error: "Session expired due to inactivity" });
              }
            }
          }

          // Active session: reset timer on both server and mark active
          userLastActivityMap.set(userId, now);
        }
      } catch (err) {
        console.error("[BACKEND INACTIVITY] Error checking session inactivity in middleware:", err);
      }

      next();
    });

    const notePrivilegedRoles = new Set(["TEACHER", "HOMEROOM", "HOMEROOM_TEACHER", "ADMIN", "SCHOOL_ADMIN", "MAIN_ADMIN", "SUPER_ADMIN"]);

    async function resolveAuthenticatedUser(req: any) {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      const authHeader = req.headers.authorization || "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.replace("Bearer ", "") : "";
      if (!token) {
        return { error: "Missing authorization header", status: 401 };
      }

      const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
      if (authError || !authData?.user) {
        return { error: "Invalid session token", status: 401 };
      }

      const authUserId = authData.user.id;
      let { data: profile } = await supabaseAdmin
        .from("user_profiles")
        .select("id, auth_user_id, name, email, role, access_role, school_id, active_school_id")
        .eq("auth_user_id", authUserId)
        .maybeSingle();

      if (!profile) {
        const { data: fallbackProfile } = await supabaseAdmin
          .from("user_profiles")
          .select("id, auth_user_id, name, email, role, access_role, school_id, active_school_id")
          .eq("id", authUserId)
          .maybeSingle();
        profile = fallbackProfile;
      }

      const userId = profile?.id || authUserId;
      const { data: roles } = await supabaseAdmin
        .from("user_school_roles")
        .select("school_id, role")
        .eq("user_id", userId);

      return { userId, profile, roles: roles || [], token };
    }

    function fullNameFromProfile(profile: any) {
      if (!profile) return "Nepoznato";
      const first = String(profile.name || profile.first_name || "").trim();
      const last = String(profile.surname || profile.last_name || "").trim();
      if (profile.full_name) return profile.full_name;
      if (last && first && !first.toLowerCase().includes(last.toLowerCase())) return `${first} ${last}`;
      return first || last || "Nepoznato";
    }

    function canSeeFullNoteTimestamp(auth: any, schoolId?: string | null) {
      const schoolRoles = (auth.roles || [])
        .filter((role: any) => !schoolId || role.school_id === schoolId)
        .map((role: any) => role.role);
      return schoolRoles.some(role => notePrivilegedRoles.has(String(role)));
    }

    function serializeStudentNote(note: any, author: any, showFullTimestamp: boolean) {
      const createdAt = note.created_at ? new Date(note.created_at) : new Date();
      const createdAtValue = showFullTimestamp
        ? createdAt.toLocaleString("hr-HR", {
            timeZone: "Europe/Zagreb",
            day: "numeric",
            month: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
          })
        : createdAt.toLocaleDateString("hr-HR", { timeZone: "Europe/Zagreb" });

      return {
        id: note.id,
        student_id: note.student_id,
        subject_id: note.subject_id,
        class_id: note.class_id,
        school_id: note.school_id,
        text_content: note.content,
        content: note.content,
        reference_date: note.date,
        date: note.date,
        created_at: createdAtValue,
        updated_at: note.updated_at,
        author_id: note.teacher_id,
        teacher_id: note.teacher_id,
        author_name: fullNameFromProfile(author),
        author: author ? { id: author.id, name: fullNameFromProfile(author) } : null
      };
    }

    async function fetchStudentNoteAuthorMap(notes: any[]) {
      const ids = Array.from(new Set(notes.map(note => note.teacher_id).filter(Boolean)));
      if (ids.length === 0) return new Map<string, any>();
      const { data: profiles } = await supabaseAdmin
        .from("user_profiles")
        .select("id, auth_user_id, name")
        .in("id", ids);

      const authorMap = new Map<string, any>();
      (profiles || []).forEach((profile: any) => {
        if (profile.id) authorMap.set(profile.id, profile);
        if (profile.auth_user_id) authorMap.set(profile.auth_user_id, profile);
      });

      const missingIds = ids.filter(id => !authorMap.has(id));
      if (missingIds.length > 0) {
        const { data: authProfiles } = await supabaseAdmin
          .from("user_profiles")
          .select("id, auth_user_id, name")
          .in("auth_user_id", missingIds);

        (authProfiles || []).forEach((profile: any) => {
          if (profile.id) authorMap.set(profile.id, profile);
          if (profile.auth_user_id) authorMap.set(profile.auth_user_id, profile);
        });
      }

      return authorMap;
    }

    async function canManageStandaloneNote(auth: any, note: any) {
      if (note.teacher_id === auth.userId) return true;
      const schoolRoles = (auth.roles || [])
        .filter((role: any) => !note.school_id || role.school_id === note.school_id)
        .map((role: any) => role.role);
      return schoolRoles.some(role => ["ADMIN", "SCHOOL_ADMIN", "MAIN_ADMIN", "SUPER_ADMIN"].includes(String(role)));
    }

    const adminRoles = new Set(["ADMIN", "SCHOOL_ADMIN", "MAIN_ADMIN", "SUPER_ADMIN"]);
    const deletionReasons = new Set([
      "WRONG_GRADE_VALUE",
      "WRONG_STUDENT",
      "WRONG_GRADING_ELEMENT",
      "EXAM_CANCELED_OR_INSPECTION",
      "TECHNICAL_ERROR_OR_DUPLICATE"
    ]);

    function hasAdminRole(auth: any, schoolId?: string | null) {
      const profileRole = String(auth?.profile?.role || auth?.profile?.access_role || auth?.profile?.globalRole || "").toUpperCase();
      if (adminRoles.has(profileRole)) return true;

      return (auth.roles || []).some((role: any) => {
        const roleName = String(role.role || "").toUpperCase();
        return adminRoles.has(roleName) && (!schoolId || !role.school_id || role.school_id === schoolId);
      });
    }

    function isHomeroomTeacherForClass(auth: any, classBook: any) {
      return classBook?.homeroom_teacher_id === auth.userId;
    }

    function authUserIds(auth: any) {
      return new Set([
        auth?.userId,
        auth?.profile?.id,
        auth?.profile?.auth_user_id
      ].filter(Boolean).map(String));
    }

    function isRecordCreatedByAuthUser(record: any, auth: any) {
      const ids = authUserIds(auth);
      return ids.has(String(record?.teacher_id || record?.teacherId || record?.created_by || record?.createdBy || ""));
    }

    async function canTeachFinalGradeSubject(auth: any, finalGrade: any) {
      const ids = Array.from(authUserIds(auth));
      if (ids.length === 0 || !finalGrade?.class_id || !finalGrade?.subject_id) return false;

      const { data, error } = await supabaseAdmin
        .from("class_subject_teachers")
        .select("id")
        .eq("class_id", finalGrade.class_id)
        .eq("subject_id", finalGrade.subject_id)
        .in("teacher_id", ids)
        .limit(1);

      if (error) {
        console.warn("[SERVER] Final grade subject assignment check failed:", error.message);
        return false;
      }

      return Boolean(data?.length);
    }

    function isWithinHours(createdAt: string | undefined, hours: number) {
      const createdTime = createdAt ? new Date(createdAt).getTime() : Number.NaN;
      if (!Number.isFinite(createdTime)) return false;
      return Date.now() - createdTime <= hours * 60 * 60 * 1000;
    }

    function isMissingColumnError(error: any, columnName: string) {
      const message = String(error?.message || error?.details || "");
      return error?.code === "42703" || error?.code === "PGRST204" || message.includes(columnName);
    }

    async function fetchClassBookForLocking(classId: string) {
      const withLock = await supabaseAdmin
        .from("classes")
        .select("id, school_id, homeroom_teacher_id, is_locked")
        .eq("id", classId)
        .maybeSingle();

      if (!withLock.error) return withLock;

      if (!isMissingColumnError(withLock.error, "is_locked")) {
        return withLock;
      }

      const withoutLock = await supabaseAdmin
        .from("classes")
        .select("id, school_id, homeroom_teacher_id")
        .eq("id", classId)
        .maybeSingle();

      if (withoutLock.data) {
        withoutLock.data.is_locked = false;
        withoutLock.data.lock_column_missing = true;
      }

      return withoutLock;
    }

    async function verifyTotpForProfile(profileId: string, totpCode?: string) {
      if (!totpCode) {
        return { ok: false, status: 400, code: "TOTP_REQUIRED", error: "Potreban je TOTP kod." };
      }

      let { data: profile, error: profileError } = await supabaseAdmin
        .from("user_profiles")
        .select("id, auth_user_id, authenticator_secret")
        .eq("id", profileId)
        .maybeSingle();

      if (profileError || !profile) {
        const { data: fallbackProfile, error: fallbackError } = await supabaseAdmin
          .from("user_profiles")
          .select("id, auth_user_id, authenticator_secret")
          .eq("auth_user_id", profileId)
          .maybeSingle();
        profile = fallbackProfile;
        profileError = fallbackError;
      }

      if (profileError) {
        return { ok: false, status: 500, code: "TOTP_LOOKUP_FAILED", error: profileError.message };
      }
      if (!profile) {
        return { ok: false, status: 404, code: "USER_NOT_FOUND", error: "Korisnički profil nije pronađen." };
      }
      if (!profile.authenticator_secret) {
        return { ok: false, status: 403, code: "TOTP_NOT_CONFIGURED", error: "Korisnik nema postavljen autentifikator." };
      }

      const isValid = profile.authenticator_secret === "123456"
        ? totpCode === "123456"
        : authenticator.check(totpCode, profile.authenticator_secret);

      if (!isValid) {
        return { ok: false, status: 400, code: "INVALID_TOTP", error: "Neispravan TOTP kod." };
      }

      return { ok: true };
    }

    async function writeImmutableFinalGradeAudit(params: {
      finalGrade: any;
      classBook: any;
      adminId: string;
      reason: string;
      detailedNote: string;
      deletedAt: string;
    }) {
      const details = JSON.stringify({
        deletedRecord: params.finalGrade,
        classBook: {
          id: params.classBook?.id,
          isLocked: Boolean(params.classBook?.is_locked)
        },
        adminId: params.adminId,
        deletedAt: params.deletedAt,
        deletionReason: params.reason,
        detailedNote: params.detailedNote
      });

      const { error } = await supabaseAdmin.from("audit_logs").insert({
        action_type: "DELETE_FINAL_GRADE",
        record_id: params.finalGrade.id,
        user_id: params.adminId,
        user_role: "ADMIN",
        details,
        reason: params.reason,
        created_at: params.deletedAt
      });

      if (error) throw error;
    }

    app.patch("/api/classes/:id/classbook-lock", async (req, res) => {
      try {
        const auth = await resolveAuthenticatedUser(req);
        if (auth.error) return res.status(auth.status).json({ error: auth.error });

        const { data: classBook, error: classError } = await fetchClassBookForLocking(req.params.id);

        if (classError) throw classError;
        if (!classBook) return res.status(404).json({ error: "Imenik nije pronađen." });

        if (!hasAdminRole(auth, classBook.school_id) && !isHomeroomTeacherForClass(auth, classBook)) {
          return res.status(403).json({ code: "UNAUTHORIZED_ROLE", error: "Samo razrednik ili admin mogu zaključati ili otključati imenik." });
        }

        if (classBook.lock_column_missing) {
          return res.status(409).json({
            code: "CLASS_LOCK_COLUMN_MISSING",
            error: "Baza još nema stupac classes.is_locked. Primijenite migraciju 20260901000000_add_classbook_lock_for_final_grades.sql."
          });
        }

        const isLocked = Boolean(req.body?.is_locked ?? req.body?.isLocked);
        const { data, error } = await supabaseAdmin
          .from("classes")
          .update({
            is_locked: isLocked,
            locked_at: isLocked ? new Date().toISOString() : null,
            locked_by: isLocked ? auth.userId : null,
            updated_at: new Date().toISOString()
          })
          .eq("id", req.params.id)
          .select("*")
          .single();

        if (error) throw error;
        res.json({ success: true, data });
      } catch (err: any) {
        console.error("[SERVER] PATCH /api/classes/:id/classbook-lock error:", err);
        res.status(500).json({ error: err.message });
      }
    });

    app.delete("/api/final-grades/:id", async (req, res) => {
      try {
        const auth = await resolveAuthenticatedUser(req);
        if (auth.error) return res.status(auth.status).json({ error: auth.error });

        const { data: finalGrade, error: finalGradeError } = await supabaseAdmin
          .from("final_grades")
          .select("*")
          .eq("id", req.params.id)
          .maybeSingle();

        if (finalGradeError) throw finalGradeError;
        if (!finalGrade) return res.status(404).json({ error: "Zaključna ocjena nije pronađena." });

        const { data: classBook, error: classError } = await fetchClassBookForLocking(finalGrade.class_id);

        if (classError) throw classError;
        if (!classBook) return res.status(404).json({ error: "Imenik nije pronađen." });

        const isAdmin = hasAdminRole(auth, classBook.school_id);
        const isCreator = isRecordCreatedByAuthUser(finalGrade, auth);
        const isWithinGracePeriod = isWithinHours(finalGrade.created_at, 48);
        const canUseTeacherGracePeriod = isCreator || await canTeachFinalGradeSubject(auth, finalGrade);

        if (classBook.is_locked && !isAdmin) {
          return res.status(423).json({ code: "CLASS_LOCKED", error: "Imenik je zaključan. Nastavnik ne može mijenjati ili brisati zaključne ocjene." });
        }

        if (!classBook.is_locked && isWithinGracePeriod && canUseTeacherGracePeriod) {
          const { error: deleteError } = await supabaseAdmin
            .from("final_grades")
            .delete()
            .eq("id", finalGrade.id);
          if (deleteError) throw deleteError;

          return res.json({ success: true });
        }

        if (isAdmin) {
          const { totpCode, totp_code, reason, detailedNote, detailed_note, note } = req.body || {};
          const selectedReason = reason;
          const selectedNote = String(detailedNote ?? detailed_note ?? note ?? "").trim();

          if (!deletionReasons.has(String(selectedReason))) {
            return res.status(400).json({ code: "DELETION_REASON_REQUIRED", error: "Odaberite razlog brisanja zaključne ocjene." });
          }
          if (!selectedNote) {
            return res.status(400).json({ code: "DETAILED_NOTE_REQUIRED", error: "Upišite detaljnu napomenu za audit zapis." });
          }

          const totpResult = await verifyTotpForProfile(auth.userId, totpCode || totp_code);
          if (!totpResult.ok) {
            return res.status(totpResult.status || 400).json({ code: totpResult.code, error: totpResult.error });
          }

          const deletedAt = new Date().toISOString();
          const { error: deleteError } = await supabaseAdmin
            .from("final_grades")
            .delete()
            .eq("id", finalGrade.id);
          if (deleteError) throw deleteError;

          await writeImmutableFinalGradeAudit({
            finalGrade,
            classBook,
            adminId: auth.userId,
            reason: selectedReason,
            detailedNote: selectedNote,
            deletedAt
          });

          return res.json({ success: true });
        }

        if (!canUseTeacherGracePeriod) {
          return res.status(403).json({ code: "UNAUTHORIZED_ROLE", error: "Možete obrisati samo zaključne ocjene koje ste Vi unijeli." });
        }

        if (!isWithinGracePeriod) {
          return res.status(403).json({ code: "TIME_LIMIT_EXCEEDED", error: "Zaključnu ocjenu možete obrisati samo unutar 48 sati od unosa." });
        }

        const { error: deleteError } = await supabaseAdmin
          .from("final_grades")
          .delete()
          .eq("id", finalGrade.id);
        if (deleteError) throw deleteError;

        res.json({ success: true });
      } catch (err: any) {
        console.error("[SERVER] DELETE /api/final-grades/:id error:", err);
        res.status(500).json({ error: err.message });
      }
    });

    app.get("/api/student-notes", async (req, res) => {
      try {
        const auth = await resolveAuthenticatedUser(req);
        if (auth.error) return res.status(auth.status).json({ error: auth.error });

        const { studentId, subjectId, classId } = req.query;
        if (!studentId || !subjectId || !classId) {
          return res.status(400).json({ error: "Missing studentId, subjectId or classId" });
        }

        const { data: notes, error } = await supabaseAdmin
          .from("student_notes")
          .select("*")
          .eq("student_id", studentId)
          .eq("subject_id", subjectId)
          .eq("class_id", classId)
          .order("date", { ascending: false })
          .order("created_at", { ascending: false });

        if (error) throw error;
        const schoolId = notes?.[0]?.school_id || null;
        const showFullTimestamp = canSeeFullNoteTimestamp(auth, schoolId);
        const authorMap = await fetchStudentNoteAuthorMap(notes || []);
        res.json({
          success: true,
          data: (notes || []).map((note: any) => serializeStudentNote(note, authorMap.get(note.teacher_id), showFullTimestamp))
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post("/api/student-notes", async (req, res) => {
      try {
        const auth = await resolveAuthenticatedUser(req);
        if (auth.error) return res.status(auth.status).json({ error: auth.error });

        const { student_id, studentId, subject_id, subjectId, text_content, textContent, reference_date, referenceDate, class_id, classId, school_id, schoolId } = req.body || {};
        const now = new Date().toISOString();
        const payload = {
          student_id: student_id || studentId,
          subject_id: subject_id || subjectId,
          class_id: class_id || classId,
          school_id: school_id || schoolId || null,
          content: text_content || textContent,
          date: reference_date || referenceDate,
          teacher_id: auth.userId,
          created_at: now,
          updated_at: now
        };

        if (!payload.student_id || !payload.subject_id || !payload.class_id || !payload.content || !payload.date) {
          return res.status(400).json({ error: "Missing required note fields" });
        }

        const { data, error } = await supabaseAdmin
          .from("student_notes")
          .insert(payload)
          .select("*")
          .single();

        if (error) throw error;
        res.json({ success: true, data: serializeStudentNote(data, auth.profile, canSeeFullNoteTimestamp(auth, data.school_id)) });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.patch("/api/student-notes/:id", async (req, res) => {
      try {
        const auth = await resolveAuthenticatedUser(req);
        if (auth.error) return res.status(auth.status).json({ error: auth.error });

        const { data: existing, error: fetchError } = await supabaseAdmin
          .from("student_notes")
          .select("*")
          .eq("id", req.params.id)
          .maybeSingle();
        if (fetchError) throw fetchError;
        if (!existing) return res.status(404).json({ error: "Note not found" });
        if (!(await canManageStandaloneNote(auth, existing))) return res.status(403).json({ error: "Not authorized to edit this note" });

        const { text_content, textContent, reference_date, referenceDate } = req.body || {};
        const updatePayload: any = { updated_at: new Date().toISOString() };
        if (text_content !== undefined || textContent !== undefined) updatePayload.content = text_content ?? textContent;
        if (reference_date !== undefined || referenceDate !== undefined) updatePayload.date = reference_date ?? referenceDate;

        const { data, error } = await supabaseAdmin
          .from("student_notes")
          .update(updatePayload)
          .eq("id", req.params.id)
          .select("*")
          .single();

        if (error) throw error;
        res.json({ success: true, data: serializeStudentNote(data, auth.profile, canSeeFullNoteTimestamp(auth, data.school_id)) });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.delete("/api/student-notes/:id", async (req, res) => {
      try {
        const auth = await resolveAuthenticatedUser(req);
        if (auth.error) return res.status(auth.status).json({ error: auth.error });

        const { data: existing, error: fetchError } = await supabaseAdmin
          .from("student_notes")
          .select("*")
          .eq("id", req.params.id)
          .maybeSingle();
        if (fetchError) throw fetchError;
        if (!existing) return res.status(404).json({ error: "Note not found" });
        if (!(await canManageStandaloneNote(auth, existing))) return res.status(403).json({ error: "Not authorized to delete this note" });

        const { error } = await supabaseAdmin
          .from("student_notes")
          .delete()
          .eq("id", req.params.id);
        if (error) throw error;
        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

  // TOTP Verification
  app.post("/api/verify-totp", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      const { authUserId, totpCode } = req.body;
      
      let { data: profile, error: profileError } = await supabaseAdmin
        .from('user_profiles')
        .select('id, auth_user_id, authenticator_secret')
        .eq('id', authUserId)
        .maybeSingle();

      if (profileError || !profile) {
        const { data: p2, error: pe2 } = await supabaseAdmin
          .from('user_profiles')
          .select('id, auth_user_id, authenticator_secret')
          .eq('auth_user_id', authUserId)
          .maybeSingle();
        if (p2) {
          profile = p2;
          profileError = null;
        }
      }

      const userId = authUserId;
      const secret = profile ? profile.authenticator_secret : null;
      const token = totpCode;

      console.log("VERIFY USER", userId);
      console.log("HAS SECRET", !!secret);
      console.log("TOKEN", token);

      if (profileError) {
        return res.status(500).json({ success: false, error: `Greška baze podataka: ${profileError.message}` });
      }

      if (!profile) {
        return res.status(404).json({ success: false, error: `Profil nije pronađen za ID ${authUserId}` });
      }
        
      if (!profile.authenticator_secret) {
        return res.status(403).json({ success: false, error: "Korisnik nema postavljen autentifikator." });
      }
      
      let isValid = false;
      let refusalReason = "";

      if (profile.authenticator_secret === '123456') {
        isValid = totpCode === '123456';
        if (!isValid) refusalReason = "Testni kod nije ispravan (očekivano '123456').";
      } else {
        isValid = authenticator.check(totpCode, profile.authenticator_secret);
        if (!isValid) refusalReason = "Uneseni kod je neispravan za ovaj autentifikator.";
      }

      if (!isValid) {
        return res.status(400).json({ success: false, error: refusalReason || "Neispravan autentifikator kod." });
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("[SERVER] TOTP Verification Error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Test route for TOTP endpoint availability check
  app.get("/api/verify-totp-test", (req, res) => {
    res.json({
      success: true,
      message: "verify-totp api works"
    });
  });

  // School Years CRUD endpoints via Supabase Admin (Service Role)
  app.get("/api/school-years", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      const schoolId = (req.query.schoolId || req.query.school_id) as string;
      let query = supabaseAdmin.from("school_years").select("*");
      if (schoolId) {
        query = query.eq("school_id", schoolId);
      }
      query = query.order("starts_at", { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      res.json({ success: true, data: data || [] });
    } catch (err: any) {
      console.error("[SERVER] GET /api/school-years error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/school-years", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      const school_id = req.body.school_id || req.body.schoolId;
      if (!school_id) {
        return res.status(400).json({ success: false, error: "school_id je obavezan." });
      }
      if (!req.body.name) {
        return res.status(400).json({ success: false, error: "Naziv školske godine je obavezan." });
      }

      const payload = {
        name: req.body.name,
        starts_at: req.body.starts_at || req.body.startsAt || null,
        ends_at: req.body.ends_at || req.body.endsAt || null,
        status: req.body.status || (req.body.is_active ? 'ACTIVE' : 'ARCHIVED'),
        is_active: req.body.is_active !== undefined ? !!req.body.is_active : (req.body.status === 'ACTIVE'),
        school_id
      };

      console.log("SAVE SCHOOL YEAR PAYLOAD", payload);

      const { data, error } = await supabaseAdmin
        .from("school_years")
        .insert([payload])
        .select()
        .single();

      if (error) throw error;
      console.log("[SERVER] School year created successfully:", data);
      res.json({ success: true, data });
    } catch (err: any) {
      console.error("[SERVER] POST /api/school-years error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.put("/api/school-years/:id", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      const { id } = req.params;
      const payload: any = {
        name: req.body.name,
        starts_at: req.body.starts_at || req.body.startsAt || null,
        ends_at: req.body.ends_at || req.body.endsAt || null,
        status: req.body.status || (req.body.is_active ? 'ACTIVE' : 'ARCHIVED'),
        is_active: req.body.is_active !== undefined ? !!req.body.is_active : (req.body.status === 'ACTIVE')
      };
      if (req.body.school_id || req.body.schoolId) {
        payload.school_id = req.body.school_id || req.body.schoolId;
      }

      console.log("SAVE SCHOOL YEAR PAYLOAD (EDIT)", payload);

      const { data, error } = await supabaseAdmin
        .from("school_years")
        .update(payload)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      res.json({ success: true, data });
    } catch (err: any) {
      console.error("[SERVER] PUT /api/school-years/:id error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/school-years/:id/activate", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      const { id } = req.params;
      let schoolId = req.body.school_id || req.body.schoolId;

      if (!schoolId) {
        const { data: targetYear } = await supabaseAdmin
          .from("school_years")
          .select("school_id")
          .eq("id", id)
          .single();
        if (targetYear) {
          schoolId = targetYear.school_id;
        }
      }

      if (schoolId) {
        await supabaseAdmin
          .from("school_years")
          .update({ is_active: false, status: "ARCHIVED" })
          .eq("school_id", schoolId)
          .neq("id", id);
      }

      const { data, error } = await supabaseAdmin
        .from("school_years")
        .update({ is_active: true, status: "ACTIVE" })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      res.json({ success: true, data });
    } catch (err: any) {
      console.error("[SERVER] POST /api/school-years/:id/activate error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete("/api/school-years/:id", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      const { id } = req.params;
      const { error } = await supabaseAdmin
        .from("school_years")
        .delete()
        .eq("id", id);

      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      console.error("[SERVER] DELETE /api/school-years/:id error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Programs CRUD endpoints via Supabase Admin (Service Role)
  app.get("/api/programs", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      const schoolId = (req.query.schoolId || req.query.school_id) as string;
      let query = supabaseAdmin.from("programs").select("*");
      if (schoolId) {
        query = query.eq("school_id", schoolId);
      }
      query = query.order("name", { ascending: true });
      const { data, error } = await query;
      if (error) throw error;
      res.json({ success: true, data: data || [] });
    } catch (err: any) {
      console.error("[SERVER] GET /api/programs error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/programs", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      const school_id = req.body.school_id || req.body.schoolId;
      if (!school_id) {
        return res.status(400).json({ success: false, error: "school_id je obavezan." });
      }
      if (!req.body.name) {
        return res.status(400).json({ success: false, error: "Naziv programa je obavezan." });
      }

      const payload = {
        name: req.body.name,
        duration_years: Number(req.body.duration_years || req.body.durationYears || 4),
        type: req.body.type || 'COMMERCIALIST_4Y',
        continuation_type: req.body.continuation_type || req.body.continuationType || 'NONE',
        module_or_track: req.body.module_or_track || req.body.moduleOrTrack || null,
        school_id
      };

      console.log("SAVE PROGRAM PAYLOAD", payload);

      const { data, error } = await supabaseAdmin
        .from("programs")
        .insert([payload])
        .select()
        .single();

      if (error) throw error;
      res.json({ success: true, data });
    } catch (err: any) {
      console.error("[SERVER] POST /api/programs error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.put("/api/programs/:id", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      const { id } = req.params;
      const payload: any = {
        name: req.body.name,
        duration_years: Number(req.body.duration_years || req.body.durationYears || 4),
        type: req.body.type,
        continuation_type: req.body.continuation_type || req.body.continuationType || 'NONE',
        module_or_track: req.body.module_or_track !== undefined ? req.body.module_or_track : (req.body.moduleOrTrack || null)
      };
      if (req.body.school_id || req.body.schoolId) {
        payload.school_id = req.body.school_id || req.body.schoolId;
      }

      console.log("SAVE PROGRAM PAYLOAD (EDIT)", payload);

      const { data, error } = await supabaseAdmin
        .from("programs")
        .update(payload)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      res.json({ success: true, data });
    } catch (err: any) {
      console.error("[SERVER] PUT /api/programs/:id error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete("/api/programs/:id", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ success: false, error: "ID programa je obavezan." });
      }

      console.log("[SERVER] DELETE PROGRAM REQUEST FOR ID:", id);

      // Check if program exists
      const { data: existingProgram, error: fetchErr } = await supabaseAdmin
        .from("programs")
        .select("id, name, school_id, module_or_track")
        .eq("id", id)
        .maybeSingle();

      console.log("[SERVER] EXISTING PROGRAM BEFORE DELETE:", existingProgram);

      if (fetchErr) {
        console.error("[SERVER] Error checking existing program:", fetchErr);
      }

      // Check if any student class enrollments are tied directly
      const { data: enrollments } = await supabaseAdmin
        .from("student_class_enrollments")
        .select("id")
        .eq("program_id", id)
        .limit(5);

      if (enrollments && enrollments.length > 0) {
        return res.status(400).json({
          success: false,
          error: "Program se ne može obrisati jer postoje učenici ili upisi povezani s njim."
        });
      }

      // Check if classes reference this program
      const { data: linkedClasses } = await supabaseAdmin
        .from("classes")
        .select("id, name")
        .eq("program_id", id)
        .limit(5);

      if (linkedClasses && linkedClasses.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Program se ne može obrisati jer je dodijeljen razrednim odjelima/grupama (${linkedClasses.map(c => c.name).join(", ")}).`
        });
      }

      // Execute delete
      const { data: deletedData, error } = await supabaseAdmin
        .from("programs")
        .delete()
        .eq("id", id)
        .select();

      if (error) throw error;

      console.log("[SERVER] DELETE PROGRAM SUCCESSFUL FOR ID:", id, "Deleted records:", deletedData);

      return res.status(200).json({
        success: true,
        deletedId: id,
        data: deletedData
      });
    } catch (err: any) {
      console.error("[SERVER] DELETE /api/programs/:id error:", err);
      return res.status(400).json({ success: false, error: err.message || "Greška pri brisanju programa." });
    }
  });

  // Alias for /api/admin/programs/:id
  app.delete("/api/admin/programs/:id", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ success: false, error: "ID programa je obavezan." });
      }

      console.log("[SERVER] DELETE ADMIN PROGRAM REQUEST FOR ID:", id);

      const { data: existingProgram } = await supabaseAdmin
        .from("programs")
        .select("id, name, school_id, module_or_track")
        .eq("id", id)
        .maybeSingle();

      console.log("[SERVER] EXISTING PROGRAM BEFORE DELETE (ADMIN ALIAS):", existingProgram);

      const { data: enrollments } = await supabaseAdmin
        .from("student_class_enrollments")
        .select("id")
        .eq("program_id", id)
        .limit(5);

      if (enrollments && enrollments.length > 0) {
        return res.status(400).json({
          success: false,
          error: "Program se ne može obrisati jer postoje učenici ili upisi povezani s njim."
        });
      }

      const { data: linkedClasses } = await supabaseAdmin
        .from("classes")
        .select("id, name")
        .eq("program_id", id)
        .limit(5);

      if (linkedClasses && linkedClasses.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Program se ne može obrisati jer je dodijeljen razrednim odjelima/grupama (${linkedClasses.map(c => c.name).join(", ")}).`
        });
      }

      const { data: deletedData, error } = await supabaseAdmin
        .from("programs")
        .delete()
        .eq("id", id)
        .select();

      if (error) throw error;

      return res.status(200).json({
        success: true,
        deletedId: id,
        data: deletedData
      });
    } catch (err: any) {
      console.error("[SERVER] DELETE /api/admin/programs/:id error:", err);
      return res.status(400).json({ success: false, error: err.message || "Greška pri brisanju programa." });
    }
  });

  // Bulk schedule assignment POST endpoint
  app.post("/api/admin/bulk-schedule-assign", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      const { classId, dayOfWeek, shift, startPeriod, consecutivePeriods, subjectId, teacherId, classroom } = req.body;
      console.log("BACKEND BODY", req.body);
      
      const missing = [];
      if (classId == null) missing.push('classId');
      if (dayOfWeek == null) missing.push('dayOfWeek');
      if (shift == null) missing.push('shift');
      if (startPeriod == null) missing.push('startPeriod');
      if (consecutivePeriods == null) missing.push('consecutivePeriods');
      if (subjectId == null) missing.push('subjectId');
      
      if (missing.length > 0) {
        console.error("Missing required parameters in body:", JSON.stringify(req.body), "Missing:", missing);
        return res.status(400).json({ success: false, error: `Nedostaju obavezni podaci za dodjelu rasporeda: ${missing.join(', ')}` });
      }

      const start = Number(startPeriod);
      const count = Number(consecutivePeriods);
      const end = start + count - 1;

      // Assign each consecutive period
      for (let p = start; p <= end; p++) {
        // 1. Upsert or find schedule_cell
        const { data: cell, error: cellErr } = await supabaseAdmin
          .from('schedule_cells')
          .upsert({
            class_id: classId,
            day_of_week: dayOfWeek,
            shift: shift,
            period_number: p
          }, {
            onConflict: 'class_id,day_of_week,shift,period_number'
          })
          .select()
          .maybeSingle();

        if (cellErr || !cell) {
          throw new Error(cellErr?.message || `Neuspjelo kreiranje ćelije za period ${p}`);
        }

        // 2. Insert new schedule_cell_subjects
        const { error: insErr } = await supabaseAdmin
          .from('schedule_cell_subjects')
          .insert({
            schedule_cell_id: cell.id,
            subject_id: subjectId,
            teacher_id: teacherId || null,
            classroom: classroom || null
          });

        if (insErr) {
          throw insErr;
        }
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("[SERVER] Bulk Schedule Assign Error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Bulk schedule assignment DELETE endpoint
  app.delete("/api/admin/bulk-schedule-assign", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      const { classId, dayOfWeek, shift, subjectId } = req.query;

      if (!classId || !dayOfWeek || !shift || !subjectId) {
        return res.status(400).json({ success: false, error: "Nedostaju parametri pretrage za brisanje bloka" });
      }

      // Find all schedule_cells for this class, day and shift
      const { data: cells, error: cellsErr } = await supabaseAdmin
        .from('schedule_cells')
        .select('id')
        .eq('class_id', classId)
        .eq('day_of_week', dayOfWeek)
        .eq('shift', shift);

      if (cellsErr) {
        throw cellsErr;
      }

      if (cells && cells.length > 0) {
        const cellIds = cells.map((c: any) => c.id);

        // Delete subject assignments matching this subjectId in these cells
        const { error: delErr } = await supabaseAdmin
          .from('schedule_cell_subjects')
          .delete()
          .in('schedule_cell_id', cellIds)
          .eq('subject_id', subjectId);

        if (delErr) {
          throw delErr;
        }
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("[SERVER] Bulk Schedule Delete Error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Sync class subjects endpoint
  app.post("/api/admin/sync-class-subjects", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      const { classId } = req.body;
      if (!classId) return res.status(400).json({ success: false, error: "Missing classId" });

      // Get class details to get school_id
      const { data: cls } = await supabaseAdmin.from('classes').select('school_id').eq('id', classId).single();
      const schoolId = cls?.school_id;

      // 1. Get Canonical subjects from class_subjects
      const { data: canonicalSubjects, error: csError } = await supabaseAdmin
        .from('class_subjects')
        .select('subject_id')
        .eq('class_id', classId);
      if (csError) throw csError;
      
      const canonicalIds = new Set((canonicalSubjects || []).map(cs => cs.subject_id));

      // 2. Get Current entries from class_subject_teachers
      const { data: assignments, error: astError } = await supabaseAdmin
        .from('class_subject_teachers')
        .select('id, subject_id')
        .eq('class_id', classId);
      if (astError) throw astError;

      // 3. Perform Sync
      // A. Delete orphans (subject_id not in canonical)
      const toDelete = (assignments || []).filter(a => !canonicalIds.has(a.subject_id));
      for (const item of toDelete) {
        await supabaseAdmin.from('class_subject_teachers').delete().eq('id', item.id);
      }
      
      // B. Ensure existence in class_subject_teachers (subject_id in canonical but not assigned)
      const currentAssignedIds = new Set((assignments || []).map(a => a.subject_id));
      const toAdd = Array.from(canonicalIds).filter(id => !currentAssignedIds.has(id));
      
      for (const subjectId of toAdd) {
         await supabaseAdmin.from('class_subject_teachers').insert([{
             class_id: classId,
             subject_id: subjectId,
             school_id: schoolId
         }]);
      }

      res.json({ success: true, results: { deleted: toDelete.length, added: toAdd.length } });
    } catch (err: any) {
      console.error("Sync error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Audit Log
  app.post("/api/audit-log", async (req, res) => {
      try {
          if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
          const { actionType, recordId, userId, userRole, details, reason } = req.body;
          
          const { error } = await supabaseAdmin.from('audit_logs').insert({
              action_type: actionType,
              record_id: recordId,
              user_id: userId,
              user_role: userRole,
              details: details,
              reason: reason,
              created_at: new Date().toISOString()
          });
          
          if (error) throw error;
          res.json({ success: true });
      } catch (err: any) {
          res.status(500).json({ error: err.message });
      }
  });

  // Sync class subjects endpoint
  app.post("/api/admin/sync-class-subjects", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      const { classId } = req.body;
      if (!classId) return res.status(400).json({ success: false, error: "Missing classId" });

      const { data: canonicalSubjects, error: csError } = await supabaseAdmin
        .from('class_subjects')
        .select('subject_id')
        .eq('class_id', classId);
      if (csError) throw csError;
      
      const canonicalIds = new Set((canonicalSubjects || []).map(cs => cs.subject_id));

      const { data: assignments, error: astError } = await supabaseAdmin
        .from('class_subject_teachers')
        .select('id, subject_id')
        .eq('class_id', classId);
      if (astError) throw astError;

      const toDelete = (assignments || []).filter(a => !canonicalIds.has(a.subject_id));
      let deletedCount = 0;
      for (const item of toDelete) {
        await supabaseAdmin.from('class_subject_teachers').delete().eq('id', item.id);
        deletedCount++;
      }
      
      res.json({ success: true, results: { deleted: deletedCount } });
    } catch (err: any) {
      console.error("Sync error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Overall Success Audit Logs
  app.post("/api/overall-success-audit-logs", async (req, res) => {
    try {
      const { executorId, studentId, classId, action, details } = req.body;
      let dbInserted = false;
      let dbErrorMsg = "";

      // 1. Try DB insert
      if (supabaseAdmin) {
        try {
          const { error } = await supabaseAdmin.from('overall_success_audit_logs').insert({
            executor_id: executorId,
            student_id: studentId,
            class_id: classId,
            action: action,
            details: details,
            created_at: new Date().toISOString()
          });
          if (error) {
            dbErrorMsg = error.message;
          } else {
            dbInserted = true;
          }
        } catch (dbErr: any) {
          dbErrorMsg = dbErr.message;
        }
      }

      // 2. Guaranteed local file persistence fallback
      const logs = readJsonFile("overall_success_audit_logs.json");
      const newLog = {
        id: crypto.randomUUID(),
        executor_id: executorId,
        student_id: studentId,
        class_id: classId,
        action: action,
        details: details,
        db_persisted: dbInserted,
        db_error: dbErrorMsg,
        created_at: new Date().toISOString()
      };
      logs.push(newLog);
      writeJsonFile("overall_success_audit_logs.json", logs);

      res.json({ success: true, db_persisted: dbInserted, error: dbErrorMsg || null });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/overall-success-audit-logs", (req, res) => {
    try {
      const { studentId, classId } = req.query;
      let logs = readJsonFile("overall_success_audit_logs.json");
      if (studentId) {
        logs = logs.filter(l => l.student_id === studentId);
      }
      if (classId) {
        logs = logs.filter(l => l.class_id === classId);
      }
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });


  // Final Thesis Applications APIs
  app.get("/api/final-thesis", async (req, res) => {
    try {
      const { studentId, mentorId, classId, schoolId } = req.query;
      let dbData: any[] = [];
      if (supabaseAdmin) {
        try {
          let query = supabaseAdmin.from('final_thesis').select('*');
          if (studentId) query = query.eq('student_id', studentId);
          if (mentorId) query = query.eq('mentor_id', mentorId);
          if (classId) query = query.eq('class_id', classId);
          if (schoolId) query = query.eq('school_id', schoolId);
          
          const { data, error } = await query;
          if (data && !error) {
            dbData = data;
          } else if (error && error.code !== 'PGRST205') {
            console.error("Error reading final_thesis from DB:", error);
          }
        } catch (err: any) {
          if (err?.code !== 'PGRST205') console.error("Error connecting to DB for final_thesis:", err);
        }
      }

      // Merge with local fallback JSON to ensure full persistence
      let localData = readJsonFile("final_thesis.json");
      if (studentId) localData = localData.filter(d => d.student_id === studentId);
      if (mentorId) localData = localData.filter(d => d.mentor_id === mentorId);
      if (classId) localData = localData.filter(d => d.class_id === classId);
      if (schoolId) localData = localData.filter(d => d.school_id === schoolId);

      const mergedMap = new Map();
      localData.forEach(item => mergedMap.set(item.id, item));
      dbData.forEach(item => mergedMap.set(item.id, item));
      const merged = Array.from(mergedMap.values());

      res.json(merged);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  const ALLOWED_DB_FIELDS = [
    'id', 'student_id', 'school_year_id', 'thesis_title', 'mentor_name',
    'creation_grade', 'defense_grade', 'creation_date', 'defense_date',
    'exam_period', 'created_at', 'mentor_id', 'status', 'final_grade',
    'final_grade_date', 'application_classification_number',
    'application_registry_number', 'application_data_entered_at',
    'accepted_at', 'accepted_by', 'student_note', 'updated_at',
    'rejected_at', 'rejected_by', 'rejection_note' // in case these applied
  ];

  function sanitizeForDb(data: any) {
    const clean: any = {};
    for (const key of Object.keys(data)) {
      if (ALLOWED_DB_FIELDS.includes(key) && data[key] !== undefined) {
        clean[key] = data[key];
      }
    }
    return clean;
  }

  const normalizeFinalThesisClassName = (value: any) =>
    String(value || '').trim().toUpperCase().replace(/\s+/g, '');

  async function assertFinalThesisClassAllowed(classId: any) {
    if (!classId || classId === 'N/A' || !supabaseAdmin) return;

    const { data: rawClazz, error } = await supabaseAdmin
      .from('classes')
      .select('name, grade_level, programs:program_id(duration_years)')
      .eq('id', classId)
      .maybeSingle();

    if (error || !rawClazz) {
      if (error) console.error("FINAL THESIS CLASS ACCESS CHECK ERROR:", error);
      return;
    }

    const clazz = Array.isArray(rawClazz) ? rawClazz[0] : rawClazz;
    const rawProgram = clazz?.programs;
    const program = Array.isArray(rawProgram) ? rawProgram[0] : rawProgram;
    const isFourthContinuationClass = normalizeFinalThesisClassName(clazz?.name) === '4.K';
    const isFinalProgramYear = Boolean(
      clazz?.grade_level &&
      program?.duration_years &&
      Number(clazz.grade_level) === Number(program.duration_years)
    );

    if (isFourthContinuationClass || !isFinalProgramYear) {
      const forbiddenError: any = new Error('Završni radovi nisu dostupni za odabrani razred.');
      forbiddenError.statusCode = 403;
      throw forbiddenError;
    }
  }

  app.post("/api/final-thesis", async (req, res) => {
    try {
      const appData = req.body;
      await assertFinalThesisClassAllowed(appData.class_id);

      if (!appData.id) {
        appData.id = crypto.randomUUID();
      }
      appData.status = 'CREATED';
      appData.submitted_at = new Date().toISOString();
      appData.created_at = new Date().toISOString();
      appData.updated_at = new Date().toISOString();

      let dbInserted = false;
      if (supabaseAdmin) {
        try {
          const dbPayload = sanitizeForDb(appData);
          console.log("FINAL THESIS SAVE PAYLOAD (POST)", dbPayload);
          const { data, error } = await supabaseAdmin.from('final_thesis').insert(dbPayload).select();
          console.log("FINAL THESIS SAVE RESULT (POST)", data, error);
          if (!error) dbInserted = true;
          else if (error.code !== 'PGRST205') console.error("DB insert error for final thesis app:", error);
        } catch (dbErr: any) {
          if (dbErr?.code !== 'PGRST205') console.error("DB connection error for final thesis app:", dbErr);
        }
      }

      const apps = readJsonFile("final_thesis.json");
      apps.push({ ...appData, db_persisted: dbInserted });
      writeJsonFile("final_thesis.json", apps);

      res.json({ success: true, data: appData, db_persisted: dbInserted });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  app.put("/api/final-thesis/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      await assertFinalThesisClassAllowed(updates.class_id);

      updates.updated_at = new Date().toISOString();

      let dbUpdated = false;
      if (supabaseAdmin) {
        try {
          const dbUpdates = sanitizeForDb(updates);
          console.log("FINAL THESIS SAVE PAYLOAD (PUT)", dbUpdates);
          const { data, error } = await supabaseAdmin.from('final_thesis').update(dbUpdates).eq('id', id).select();
          console.log("FINAL THESIS SAVE RESULT (PUT)", data, error);
          if (!error) dbUpdated = true;
          else if (error.code !== 'PGRST205') console.error("DB update error for final thesis app:", error);
        } catch (dbErr: any) {
          if (dbErr?.code !== 'PGRST205') console.error("DB connection error for final thesis app:", dbErr);
        }
      }

      const apps = readJsonFile("final_thesis.json");
      const idx = apps.findIndex(a => a.id === id);
      if (idx !== -1) {
        apps[idx] = { ...apps[idx], ...updates, db_updated: dbUpdated };
        writeJsonFile("final_thesis.json", apps);
      } else {
        apps.push({ id, ...updates, db_updated: dbUpdated });
        writeJsonFile("final_thesis.json", apps);
      }

      res.json({ success: true, db_updated: dbUpdated });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  app.delete("/api/final-thesis/:id", async (req, res) => {
    try {
      const { id } = req.params;
      let dbDeleted = false;
      if (supabaseAdmin) {
        try {
          const { error } = await supabaseAdmin.from('final_thesis').delete().eq('id', id);
          if (!error) dbDeleted = true;
          else if (error.code !== 'PGRST205') console.error("DB delete error for final thesis app:", error);
        } catch (dbErr: any) {
          if (dbErr?.code !== 'PGRST205') console.error("DB connection error for final thesis app delete:", dbErr);
        }
      }

      const apps = readJsonFile("final_thesis.json");
      const filtered = apps.filter(a => a.id !== id);
      writeJsonFile("final_thesis.json", filtered);

      res.json({ success: true, db_deleted: dbDeleted });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  const MATURA_LEVELS = new Set(["A_RAZINA", "B_RAZINA", "JEDNA_RAZINA"]);
  const MATURA_ELECTIVE_SUBJECTS = new Set(["Biologija", "Povijest", "Geografija", "Politika i gospodarstvo", "Fizika", "Logika", "Filozofija", "Likovna umjetnost", "Psihologija", "Informatika", "Kemija", "Sociologija", "Vjeronauk", "Glazbena umjetnost", "Etika"]);

  function normalizeMaturaSubject(value: any) {
    return String(value || '').trim();
  }

  function normalizeMaturaLevel(value: any) {
    const raw = String(value || '').trim().toUpperCase();
    if (raw === 'A' || raw === 'A_RAZINA') return 'A_RAZINA';
    if (raw === 'B' || raw === 'B_RAZINA') return 'B_RAZINA';
    return 'JEDNA_RAZINA';
  }

  function toLegacyMaturaLevel(value: any) {
    const normalized = normalizeMaturaLevel(value);
    if (normalized === 'A_RAZINA') return 'A';
    if (normalized === 'B_RAZINA') return 'B';
    return '-';
  }

  function maturaLevelDbCandidates(value: any) {
    const normalized = normalizeMaturaLevel(value);
    if (normalized === 'A_RAZINA') return ['A', 'A_RAZINA'];
    if (normalized === 'B_RAZINA') return ['B', 'B_RAZINA'];
    return ['ONE', '-', 'JEDNA_RAZINA', 'Jedna razina', 'JEDNA', 'ONE_LEVEL'];
  }

  function getZagrebOffsetMinutes(date: Date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Zagreb',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const value = (type: string) => Number(parts.find(part => part.type === type)?.value || 0);
    const asUtc = Date.UTC(
      value('year'),
      value('month') - 1,
      value('day'),
      value('hour'),
      value('minute'),
      value('second')
    );
    return (asUtc - date.getTime()) / 60000;
  }

  function normalizeMaturaExamDateTime(value: any) {
    const raw = String(value || '').trim();
    const localMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (localMatch) {
      const [, year, month, day, hour, minute, second = '00'] = localMatch;
      const utcGuess = new Date(Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second)
      ));
      const offsetMinutes = getZagrebOffsetMinutes(utcGuess);
      return new Date(utcGuess.getTime() - offsetMinutes * 60000).toISOString();
    }
    return raw;
  }

  function getMaturaSettingsRecord(schoolId?: any) {
    const settings = readJsonFile("matura_settings.json");
    return settings.find(item => !schoolId || item.school_id === schoolId) || null;
  }

  async function loadMaturaSettingsRecord(schoolId?: any) {
    if (supabaseAdmin) {
      try {
        let query = supabaseAdmin.from("matura_settings").select("*");
        if (schoolId) query = query.eq("school_id", schoolId);
        const { data, error } = await query.order("updated_at", { ascending: false }).limit(1);
        if (!error) return (Array.isArray(data) ? data[0] : null) || null;
        if (error.code !== "PGRST205" && error.code !== "42P01") console.error("DB matura settings window read error:", error);
      } catch (dbErr: any) {
        if (dbErr?.code !== "PGRST205" && dbErr?.code !== "42P01") console.error("DB matura settings window read connection error:", dbErr);
      }
    }
    return getMaturaSettingsRecord(schoolId);
  }

  function ensureDateWindow(settings: any, startsKey: string | null, endsKey: string | null, notStartedMessage: string, expiredMessage: string) {
    const now = new Date();
    if (startsKey && settings?.[startsKey] && now < new Date(settings[startsKey])) {
      return notStartedMessage;
    }
    if (endsKey && settings?.[endsKey] && now > new Date(settings[endsKey])) {
      return expiredMessage;
    }
    return "";
  }

  function mergeRowsById(primary: any[] = [], fallback: any[] = []) {
    const rows = new Map<string, any>();
    [...fallback, ...primary].forEach((item) => {
      if (!item) return;
      rows.set(String(item.id || crypto.randomUUID()), item);
    });
    return Array.from(rows.values());
  }

  app.get("/api/matura-registrations", async (req, res) => {
    try {
      const { studentId, classId, schoolId } = req.query;
      if (supabaseAdmin) {
        try {
          let query = supabaseAdmin.from("matura_registrations").select("*");
          if (studentId) query = query.eq("student_id", studentId);
          if (classId) query = query.eq("class_id", classId);
          if (schoolId) query = query.eq("school_id", schoolId);
          const { data, error } = await query.order("status", { ascending: true }).order("subject_name", { ascending: true });
          if (!error) return res.json(data || []);
          if (error.code !== "PGRST205" && error.code !== "42P01") console.error("DB matura registrations read error:", error);
        } catch (dbErr: any) {
          if (dbErr?.code !== "PGRST205" && dbErr?.code !== "42P01") console.error("DB matura registrations read connection error:", dbErr);
        }
      }

      let registrations = readJsonFile("matura_registrations.json");

      if (studentId) registrations = registrations.filter(item => item.student_id === studentId);
      if (classId) registrations = registrations.filter(item => item.class_id === classId);
      if (schoolId) registrations = registrations.filter(item => item.school_id === schoolId);

      registrations.sort((a, b) => {
        const byStatus = String(a.status || '').localeCompare(String(b.status || ''));
        if (byStatus !== 0) return byStatus;
        return String(a.subject_name || '').localeCompare(String(b.subject_name || ''), 'hr');
      });

      res.json(registrations);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/matura-registrations", async (req, res) => {
    try {
      const payload = req.body || {};
      const studentId = String(payload.student_id || '').trim();
      const subjectName = normalizeMaturaSubject(payload.subject_name);
      const level = String(payload.level || '').trim();

      if (!studentId || !subjectName || !MATURA_LEVELS.has(level)) {
        return res.status(400).json({ error: "Učenik, predmet i razina mature su obavezni." });
      }

      const windowError = ensureDateWindow(
        await loadMaturaSettingsRecord(payload.school_id),
        "registration_opens_at",
        "registration_closes_at",
        "Rok za prijavu ispita državne mature još nije započeo.",
        "Rok za prijavu ispita državne mature je istekao."
      );
      if (windowError) return res.status(400).json({ error: windowError });

      const registrations = readJsonFile("matura_registrations.json");
      const now = new Date().toISOString();

      if (supabaseAdmin) {
        try {
          const { data: existingRows, error: existingError } = await supabaseAdmin
            .from("matura_registrations")
            .select("*")
            .eq("student_id", studentId)
            .ilike("subject_name", subjectName)
            .limit(1);

          if (existingError) {
            if (existingError.code !== "PGRST205" && existingError.code !== "42P01") console.error("DB matura registration lookup error:", existingError);
          } else {
            const existing = Array.isArray(existingRows) ? existingRows[0] : null;
            if (!existing) {
              const { data: activeRows, error: activeError } = await supabaseAdmin
                .from("matura_registrations")
                .select("subject_name")
                .eq("student_id", studentId)
                .eq("status", "REGISTERED");

              if (activeError) {
                if (activeError.code !== "PGRST205" && activeError.code !== "42P01") console.error("DB matura active count error:", activeError);
              } else {
                const activeStudentRegistrations = activeRows || [];
                const electiveCount = activeStudentRegistrations.filter((item: any) => MATURA_ELECTIVE_SUBJECTS.has(normalizeMaturaSubject(item.subject_name))).length;
                const requiredCount = activeStudentRegistrations.length - electiveCount;
                if (MATURA_ELECTIVE_SUBJECTS.has(subjectName) && electiveCount >= 6) {
                  return res.status(400).json({ error: "Možete prijaviti najviše 6 izbornih ispita državne mature." });
                }
                if (!MATURA_ELECTIVE_SUBJECTS.has(subjectName) && requiredCount >= 3) {
                  return res.status(400).json({ error: "Možete prijaviti najviše 3 obavezna ispita državne mature." });
                }
              }
            }

            const dbPayload = {
              student_id: studentId,
              class_id: payload.class_id || null,
              school_id: payload.school_id || null,
              subject_name: subjectName,
              level,
              status: "REGISTERED",
              exam_location: String(payload.exam_location || '').trim() || null,
              created_by: studentId,
              updated_by: studentId,
              updated_at: now,
            };

            const dbQuery = existing
              ? supabaseAdmin.from("matura_registrations").update(dbPayload).eq("id", existing.id).select().single()
              : supabaseAdmin.from("matura_registrations").insert({ ...dbPayload, created_at: now }).select().single();
            const { data, error } = await dbQuery;
            if (!error) {
              return res.json({ success: true, data });
            }
            if (error.code !== "PGRST205" && error.code !== "42P01") console.error("DB matura registration write error:", error);
          }
        } catch (dbErr: any) {
          if (dbErr?.code !== "PGRST205" && dbErr?.code !== "42P01") console.error("DB matura registration write connection error:", dbErr);
        }
      }

      const existingIndex = registrations.findIndex(item =>
        item.student_id === studentId &&
        normalizeMaturaSubject(item.subject_name).toLowerCase() === subjectName.toLowerCase()
      );

      if (existingIndex === -1) {
        const activeStudentRegistrations = registrations.filter(item => item.student_id === studentId && item.status === "REGISTERED");
        const electiveCount = activeStudentRegistrations.filter(item => MATURA_ELECTIVE_SUBJECTS.has(normalizeMaturaSubject(item.subject_name))).length;
        const requiredCount = activeStudentRegistrations.length - electiveCount;
        if (MATURA_ELECTIVE_SUBJECTS.has(subjectName) && electiveCount >= 6) {
          return res.status(400).json({ error: "Možete prijaviti najviše 6 izbornih ispita državne mature." });
        }
        if (!MATURA_ELECTIVE_SUBJECTS.has(subjectName) && requiredCount >= 3) {
          return res.status(400).json({ error: "Možete prijaviti najviše 3 obavezna ispita državne mature." });
        }
      }

      const nextRecord = {
        ...(existingIndex >= 0 ? registrations[existingIndex] : {}),
        id: existingIndex >= 0 ? registrations[existingIndex].id : crypto.randomUUID(),
        student_id: studentId,
        class_id: payload.class_id || null,
        school_id: payload.school_id || null,
        subject_name: subjectName,
        level,
        status: "REGISTERED",
        exam_location: String(payload.exam_location || '').trim() || null,
        created_at: existingIndex >= 0 ? registrations[existingIndex].created_at : now,
        updated_at: now,
      };

      if (existingIndex >= 0) {
        registrations[existingIndex] = nextRecord;
      } else {
        registrations.push(nextRecord);
      }

      writeJsonFile("matura_registrations.json", registrations);
      res.json({ success: true, data: nextRecord });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/matura-registrations/:id/cancel", async (req, res) => {
    try {
      const { id } = req.params;
      const { student_id, school_id } = req.body || {};
      const windowError = ensureDateWindow(
        await loadMaturaSettingsRecord(school_id),
        null,
        "cancellation_closes_at",
        "",
        "Rok za odjavu ispita državne mature je istekao."
      );
      if (windowError) return res.status(400).json({ error: windowError });
      if (supabaseAdmin) {
        try {
          let query = supabaseAdmin.from("matura_registrations").select("*").eq("id", id).limit(1);
          const { data: existingRows, error: readError } = await query;
          if (!readError) {
            const existing = Array.isArray(existingRows) ? existingRows[0] : null;
            if (!existing) return res.status(404).json({ error: "Prijava mature nije pronađena." });
            if (student_id && existing.student_id !== student_id) {
              return res.status(403).json({ error: "Možete odjaviti samo vlastitu prijavu mature." });
            }
            const { data, error } = await supabaseAdmin
              .from("matura_registrations")
              .update({ status: "CANCELED", updated_by: student_id || existing.student_id, updated_at: new Date().toISOString() })
              .eq("id", id)
              .select()
              .single();
            if (!error) return res.json({ success: true, data });
            if (error.code !== "PGRST205" && error.code !== "42P01") console.error("DB matura registration cancel error:", error);
          } else if (readError.code !== "PGRST205" && readError.code !== "42P01") {
            console.error("DB matura registration cancel lookup error:", readError);
          }
        } catch (dbErr: any) {
          if (dbErr?.code !== "PGRST205" && dbErr?.code !== "42P01") console.error("DB matura registration cancel connection error:", dbErr);
        }
      }

      const registrations = readJsonFile("matura_registrations.json");
      const index = registrations.findIndex(item => item.id === id);

      if (index === -1) {
        return res.status(404).json({ error: "Prijava mature nije pronađena." });
      }

      if (student_id && registrations[index].student_id !== student_id) {
        return res.status(403).json({ error: "Možete odjaviti samo vlastitu prijavu mature." });
      }

      registrations[index] = {
        ...registrations[index],
        status: "CANCELED",
        updated_at: new Date().toISOString(),
      };

      writeJsonFile("matura_registrations.json", registrations);
      res.json({ success: true, data: registrations[index] });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/matura-settings", async (req, res) => {
    try {
      const { schoolId } = req.query;
      const localSettings = readJsonFile("matura_settings.json");
      const localRecord = localSettings.find(item => !schoolId || item.school_id === schoolId) || null;
      if (supabaseAdmin) {
        try {
          let query = supabaseAdmin.from("matura_settings").select("*");
          if (schoolId) query = query.eq("school_id", schoolId);
          const { data, error } = await query.order("updated_at", { ascending: false }).limit(1);
          if (!error) return res.json((Array.isArray(data) ? data[0] : null) || localRecord || null);
          if (error.code !== "PGRST205" && error.code !== "42P01") console.error("DB matura settings read error:", error);
        } catch (dbErr: any) {
          if (dbErr?.code !== "PGRST205" && dbErr?.code !== "42P01") console.error("DB matura settings read connection error:", dbErr);
        }
      }
      res.json(localRecord);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/matura-settings", async (req, res) => {
    try {
      const payload = req.body || {};
      const schoolId = String(payload.school_id || '').trim();
      if (!schoolId) return res.status(400).json({ error: "Škola je obavezna." });

      const settings = readJsonFile("matura_settings.json");
      const now = new Date().toISOString();
      const index = settings.findIndex(item => item.school_id === schoolId);
      const record = {
        ...(index >= 0 ? settings[index] : {}),
        id: index >= 0 ? settings[index].id : crypto.randomUUID(),
        school_id: schoolId,
        registration_opens_at: payload.registration_opens_at || null,
        registration_closes_at: payload.registration_closes_at || null,
        cancellation_closes_at: payload.cancellation_closes_at || null,
        study_program_changes_opens_at: payload.study_program_changes_opens_at || null,
        study_program_changes_close_at: payload.study_program_changes_close_at || null,
        study_program_withdrawal_closes_at: payload.study_program_withdrawal_closes_at || null,
        objection_opens_at: payload.objection_opens_at || null,
        objection_closes_at: payload.objection_closes_at || null,
        updated_at: now,
        created_at: index >= 0 ? settings[index].created_at : now,
      };
      if (supabaseAdmin) {
        try {
          const { data, error } = await supabaseAdmin
            .from("matura_settings")
            .upsert(record, { onConflict: "school_id" })
            .select()
            .single();
          if (!error) {
            if (index >= 0) settings[index] = data;
            else settings.push(data);
            writeJsonFile("matura_settings.json", settings);
            return res.json({ success: true, data });
          }
          if (error.code !== "PGRST205" && error.code !== "42P01") console.error("DB matura settings write error:", error);
          if (isVercel) return res.status(500).json({ error: `Rokovi nisu spremljeni u bazu: ${error.message}` });
        } catch (dbErr: any) {
          if (dbErr?.code !== "PGRST205" && dbErr?.code !== "42P01") console.error("DB matura settings write connection error:", dbErr);
          if (isVercel) return res.status(500).json({ error: `Rokovi nisu spremljeni u bazu: ${dbErr?.message || "greška baze"}` });
        }
      }
      if (isVercel) {
        return res.status(500).json({ error: "Rokovi nisu spremljeni jer Supabase admin veza nije dostupna na Vercelu." });
      }
      if (index >= 0) settings[index] = record;
      else settings.push(record);
      writeJsonFile("matura_settings.json", settings);
      res.json({ success: true, data: record });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/matura-exam-schedule", async (req, res) => {
    try {
      const { schoolId } = req.query;
      const normalizeScheduleRow = (item: any) => ({
        ...item,
        exam_at: item.exam_at || item.starts_at,
        starts_at: item.starts_at || item.exam_at,
        subject_name: normalizeMaturaSubject(item.subject_name || item.subject),
        subject: normalizeMaturaSubject(item.subject || item.subject_name),
        level: normalizeMaturaLevel(item.level),
      });
      let localItems = readJsonFile("matura_exam_schedule.json").map(normalizeScheduleRow);
      if (schoolId) localItems = localItems.filter(item => item.school_id === schoolId || !item.school_id);
      if (supabaseAdmin) {
        try {
          let query = supabaseAdmin.from("matura_exam_schedule").select("*");
          if (schoolId) query = query.or(`school_id.eq.${schoolId},school_id.is.null`);
          const { data, error } = await query;
          if (!error) {
            const merged = mergeRowsById((data || []).map(normalizeScheduleRow), localItems);
            merged.sort((a, b) => String(a.exam_at || '').localeCompare(String(b.exam_at || '')));
            return res.json(merged);
          }
          if (error.code !== "PGRST205" && error.code !== "42P01") console.error("DB matura schedule read error:", error);
        } catch (dbErr: any) {
          if (dbErr?.code !== "PGRST205" && dbErr?.code !== "42P01") console.error("DB matura schedule read connection error:", dbErr);
        }
      }
      localItems.sort((a, b) => String(a.exam_at || '').localeCompare(String(b.exam_at || '')));
      res.json(localItems);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/matura-exam-schedule", async (req, res) => {
    try {
      const payload = req.body || {};
      if (!payload.subject_name || !payload.exam_at) {
        return res.status(400).json({ error: "Predmet i vrijeme ispita su obavezni." });
      }
      const items = readJsonFile("matura_exam_schedule.json");
      const now = new Date().toISOString();
      const subjectName = normalizeMaturaSubject(payload.subject_name);
      const level = normalizeMaturaLevel(payload.level);
      const examAt = normalizeMaturaExamDateTime(payload.exam_at);
      const makeScheduleRecord = (overrides: Partial<Record<string, any>> = {}) => ({
        id: crypto.randomUUID(),
        school_id: payload.school_id || null,
        subject: subjectName,
        subject_name: subjectName,
        level: toLegacyMaturaLevel(level),
        exam_at: examAt,
        starts_at: examAt,
        room: String(payload.room || '').trim() || null,
        note: String(payload.note || '').trim() || null,
        created_at: now,
        updated_at: now,
        ...overrides,
      });
      const records = [makeScheduleRecord()];
      if (subjectName === "Hrvatski jezik") {
        const essayDate = new Date(examAt);
        if (!Number.isNaN(essayDate.getTime())) {
          essayDate.setDate(essayDate.getDate() + 1);
          records[0].room = "Test + sažetak";
          records.push(makeScheduleRecord({
            id: crypto.randomUUID(),
            exam_at: essayDate.toISOString(),
            starts_at: essayDate.toISOString(),
            room: "Esej",
          }));
        }
      }
      if (supabaseAdmin) {
        try {
          let lastError: any = null;
          for (const dbLevel of maturaLevelDbCandidates(level)) {
            const candidateRecords = records.map(item => ({ ...item, level: dbLevel }));
            const { data, error } = await supabaseAdmin
              .from("matura_exam_schedule")
              .insert(candidateRecords)
              .select();
            if (!error) {
              items.push(...(data || candidateRecords));
              writeJsonFile("matura_exam_schedule.json", items);
              return res.json({ success: true, data: data || candidateRecords });
            }
            lastError = error;
            if (error.code !== "23514") break;
          }
          const error = lastError;
          if (error.code !== "PGRST205" && error.code !== "42P01") console.error("DB matura schedule write error:", error);
          if (isVercel) return res.status(500).json({ error: `Termin nije spremljen u bazu: ${error.message}` });
        } catch (dbErr: any) {
          if (dbErr?.code !== "PGRST205" && dbErr?.code !== "42P01") console.error("DB matura schedule write connection error:", dbErr);
          if (isVercel) return res.status(500).json({ error: `Termin nije spremljen u bazu: ${dbErr?.message || "greška baze"}` });
        }
      }
      if (isVercel) {
        return res.status(500).json({ error: "Termin nije spremljen jer Supabase admin veza nije dostupna na Vercelu." });
      }
      items.push(...records);
      writeJsonFile("matura_exam_schedule.json", items);
      res.json({ success: true, data: records });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/matura-exam-schedule/:id", async (req, res) => {
    try {
      if (supabaseAdmin) {
        try {
          const { error } = await supabaseAdmin.from("matura_exam_schedule").delete().eq("id", req.params.id);
          if (!error) return res.json({ success: true });
          if (error.code !== "PGRST205" && error.code !== "42P01") console.error("DB matura schedule delete error:", error);
        } catch (dbErr: any) {
          if (dbErr?.code !== "PGRST205" && dbErr?.code !== "42P01") console.error("DB matura schedule delete connection error:", dbErr);
        }
      }
      const items = readJsonFile("matura_exam_schedule.json");
      writeJsonFile("matura_exam_schedule.json", items.filter(item => item.id !== req.params.id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/matura-results", (req, res) => {
    try {
      const { studentId, schoolId } = req.query;
      let items = readJsonFile("matura_results.json");
      if (studentId) items = items.filter(item => item.student_id === studentId);
      if (schoolId) items = items.filter(item => item.school_id === schoolId || !item.school_id);
      res.json(items);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  const getMaturaGradeNumber = (grade: any) => {
    const match = String(grade || "").match(/\((\d)\)|^(\d)$/);
    return Number(match?.[1] || match?.[2] || 0);
  };

  const isPassingMaturaResult = (result: any) => (
    String(result?.status || "Uredno pristupanje") === "Uredno pristupanje" &&
    getMaturaGradeNumber(result?.grade) > 1
  );

  const getMaturaResultScore = (result: any) => (
    getMaturaGradeNumber(result?.grade) * 100000 +
    Number(result?.percentage || 0) * 100 +
    Number(result?.points || 0)
  );

  const calculateMaturaResultStats = (record: any, registrations: any[], results: any[]) => {
    const subjectName = normalizeMaturaSubject(record.subject_name);
    const level = normalizeMaturaLevel(record.level);
    const sameExamRegistrations = registrations.filter(item =>
      item?.status === "REGISTERED" &&
      normalizeMaturaSubject(item?.subject_name).toLowerCase() === subjectName.toLowerCase() &&
      normalizeMaturaLevel(item?.level) === level &&
      (!record.school_id || !item?.school_id || item.school_id === record.school_id)
    );
    const participantsCount = sameExamRegistrations.length;
    const comparableResults = [
      ...results.filter(item => !(
        item.student_id === record.student_id &&
        normalizeMaturaSubject(item.subject_name).toLowerCase() === subjectName.toLowerCase() &&
        normalizeMaturaLevel(item.level) === level
      )),
      record,
    ].filter(item =>
      sameExamRegistrations.some(registration => registration.student_id === item.student_id) &&
      normalizeMaturaSubject(item.subject_name).toLowerCase() === subjectName.toLowerCase() &&
      normalizeMaturaLevel(item.level) === level &&
      isPassingMaturaResult(item)
    );

    if (!isPassingMaturaResult(record)) {
      return {
        rank: null,
        participants_count: participantsCount || null,
        percentile: null,
      };
    }

    comparableResults.sort((a, b) => getMaturaResultScore(b) - getMaturaResultScore(a));
    const rank = comparableResults.findIndex(item => item.student_id === record.student_id) + 1;
    const percentile = participantsCount > 0 && rank > 0
      ? Math.max(1, Math.min(100, Math.round(((participantsCount - rank + 1) / participantsCount) * 100)))
      : null;

    return {
      rank: rank > 0 ? rank : null,
      participants_count: participantsCount || null,
      percentile,
    };
  };

  app.post("/api/matura-results", async (req, res) => {
    try {
      const payload = req.body || {};
      if (!payload.student_id || !payload.subject_name) {
        return res.status(400).json({ error: "Učenik i predmet su obavezni." });
      }
      const items = readJsonFile("matura_results.json");
      let registrations = readJsonFile("matura_registrations.json");
      if (supabaseAdmin) {
        try {
          let query = supabaseAdmin.from("matura_registrations").select("*");
          if (payload.school_id) query = query.eq("school_id", payload.school_id);
          const { data, error } = await query;
          if (!error) registrations = data || registrations;
          else if (error.code !== "PGRST205" && error.code !== "42P01") console.error("DB matura registrations stats read error:", error);
        } catch (dbErr: any) {
          if (dbErr?.code !== "PGRST205" && dbErr?.code !== "42P01") console.error("DB matura registrations stats connection error:", dbErr);
        }
      }
      const now = new Date().toISOString();
      const index = items.findIndex(item =>
        item.student_id === payload.student_id &&
        normalizeMaturaSubject(item.subject_name).toLowerCase() === normalizeMaturaSubject(payload.subject_name).toLowerCase() &&
        String(item.level || "JEDNA_RAZINA") === String(payload.level || "JEDNA_RAZINA")
      );
      const record = {
        ...(index >= 0 ? items[index] : {}),
        id: index >= 0 ? items[index].id : crypto.randomUUID(),
        student_id: payload.student_id,
        school_id: payload.school_id || null,
        subject_name: normalizeMaturaSubject(payload.subject_name),
        level: payload.level || "JEDNA_RAZINA",
        status: payload.status || "Uredno pristupanje",
        points: Number(payload.points || 0),
        max_points: Number(payload.max_points || 100),
        percentage: Number(payload.percentage || 0),
        grade: String(payload.grade || '').trim() || null,
        updated_at: now,
        created_at: index >= 0 ? items[index].created_at : now,
      };
      Object.assign(record, calculateMaturaResultStats(record, registrations, items));
      if (index >= 0) items[index] = record;
      else items.push(record);
      const recordSubject = normalizeMaturaSubject(record.subject_name).toLowerCase();
      const recordLevel = normalizeMaturaLevel(record.level);
      items.forEach(item => {
        if (
          normalizeMaturaSubject(item.subject_name).toLowerCase() === recordSubject &&
          normalizeMaturaLevel(item.level) === recordLevel &&
          (!record.school_id || !item.school_id || item.school_id === record.school_id)
        ) {
          Object.assign(item, calculateMaturaResultStats(item, registrations, items));
        }
      });
      writeJsonFile("matura_results.json", items);
      res.json({ success: true, data: record });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/matura-objections", (req, res) => {
    try {
      const { studentId, schoolId } = req.query;
      let items = readJsonFile("matura_objections.json");
      if (studentId) items = items.filter(item => item.student_id === studentId);
      if (schoolId) items = items.filter(item => item.school_id === schoolId || !item.school_id);
      res.json(items);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/matura-objections", async (req, res) => {
    try {
      const payload = req.body || {};
      const settings = await loadMaturaSettingsRecord(payload.school_id);
      const nowDate = new Date();
      if (settings?.objection_opens_at && nowDate < new Date(settings.objection_opens_at)) {
        return res.status(400).json({ error: "Rok za unos prigovora još nije započeo." });
      }
      if (settings?.objection_closes_at && nowDate > new Date(settings.objection_closes_at)) {
        return res.status(400).json({ error: "Rok za unos prigovora je istekao." });
      }
      if (!payload.student_id || !payload.subject_name || !String(payload.text || '').trim()) {
        return res.status(400).json({ error: "Predmet i tekst prigovora su obavezni." });
      }
      const items = readJsonFile("matura_objections.json");
      const now = new Date().toISOString();
      const record = {
        id: crypto.randomUUID(),
        student_id: payload.student_id,
        school_id: payload.school_id || null,
        subject_name: normalizeMaturaSubject(payload.subject_name),
        text: String(payload.text).trim(),
        status: "ZAPRIMLJENO",
        created_at: now,
        updated_at: now,
      };
      items.push(record);
      writeJsonFile("matura_objections.json", items);
      res.json({ success: true, data: record });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  function normalizeStudyProgramRecord(item: any) {
    const name = item.name || `${item.faculty || ''} - ${item.component || ''} - ${item.study_name || ''} - ${item.city || ''}`.replace(/\s+-\s+-\s+/g, ' - ');
    const requiredExams = Array.isArray(item.required_exams) ? item.required_exams : [];
    const electiveExams = Array.isArray(item.elective_exams) ? item.elective_exams : [];
    const participationFee = String(item.participation_fee || '').trim();
    const quotaInfo = `${Number(item.citizen_quota || 0)} mjesta za državljane RH, ${Number(item.foreign_quota || 0)} mjesta za strane državljane`;
    return {
      ...item,
      name,
      institution: item.institution || item.faculty || null,
      participation_fee: participationFee || null,
      info: item.info || (participationFee ? `${quotaInfo}, participacija: ${participationFee}` : quotaInfo),
      requirements: item.requirements || {
        requiredLevels: Object.fromEntries(requiredExams.map((exam: any) => [exam.subject_name, exam.level || '-'])),
        electiveRules: Object.fromEntries(electiveExams.map((exam: any) => [exam.subject_name, exam.is_required ? '+' : '-'])),
      },
    };
  }

  app.get("/api/matura-study-programs", async (req, res) => {
    try {
      const { schoolId, activeOnly } = req.query;
      let seedItems = readBundledJsonFile("matura_study_programs.json");
      if (schoolId) seedItems = seedItems.filter(item => item.school_id === schoolId || !item.school_id);
      if (activeOnly !== "false") seedItems = seedItems.filter(item => item.is_active !== false);
      if (supabaseAdmin) {
        try {
          let query = supabaseAdmin.from("matura_study_programs").select("*");
          if (schoolId) query = query.or(`school_id.eq.${schoolId},school_id.is.null`);
          if (activeOnly !== "false") query = query.eq("is_active", true);
          const { data, error } = await query.order("faculty", { ascending: true }).order("study_name", { ascending: true });
          if (!error) {
            const merged = mergeRowsById(data || [], seedItems);
            merged.sort((a, b) => String(a.faculty || '').localeCompare(String(b.faculty || ''), 'hr') || String(a.study_name || '').localeCompare(String(b.study_name || ''), 'hr'));
            return res.json(merged.map(normalizeStudyProgramRecord));
          }
          if (error.code !== "PGRST205" && error.code !== "42P01") console.error("DB matura study programs read error:", error);
        } catch (dbErr: any) {
          if (dbErr?.code !== "PGRST205" && dbErr?.code !== "42P01") console.error("DB matura study programs read connection error:", dbErr);
        }
      }

      let items = readJsonFile("matura_study_programs.json");
      items = mergeRowsById(items, seedItems);
      if (schoolId) items = items.filter(item => item.school_id === schoolId || !item.school_id);
      if (activeOnly !== "false") items = items.filter(item => item.is_active !== false);
      items.sort((a, b) => String(a.faculty || '').localeCompare(String(b.faculty || ''), 'hr') || String(a.study_name || '').localeCompare(String(b.study_name || ''), 'hr'));
      res.json(items.map(normalizeStudyProgramRecord));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/matura-study-programs", async (req, res) => {
    try {
      const payload = req.body || {};
      const now = new Date().toISOString();
      const faculty = String(payload.faculty || '').trim();
      const studyName = String(payload.study_name || '').trim();
      const city = String(payload.city || '').trim();
      if (!faculty || !studyName || !city) {
        return res.status(400).json({ error: "Fakultet, studij i mjesto izvođenja su obavezni." });
      }

      const record = {
        id: payload.id || crypto.randomUUID(),
        school_id: payload.school_id || null,
        faculty,
        component: String(payload.component || '').trim() || null,
        study_name: studyName,
        study_type: String(payload.study_type || '').trim() || null,
        city,
        participation_fee: String(payload.participation_fee || '').trim() || null,
        institution_type: String(payload.institution_type || 'Javna sveučilišta').trim(),
        area: String(payload.area || '').trim() || null,
        field: String(payload.field || '').trim() || null,
        quota_type: String(payload.quota_type || 'Bez posebne kvote').trim(),
        admission_round: String(payload.admission_round || 'LJETNI').trim(),
        is_active: payload.is_active !== false,
        citizen_quota: Number(payload.citizen_quota || 0),
        foreign_quota: Number(payload.foreign_quota || 0),
        school_gpa_weight: Number(payload.school_gpa_weight || 0),
        required_exams: Array.isArray(payload.required_exams) ? payload.required_exams : [],
        elective_exams: Array.isArray(payload.elective_exams) ? payload.elective_exams : [],
        special_achievements: Array.isArray(payload.special_achievements) ? payload.special_achievements : [],
        health_considerations: Array.isArray(payload.health_considerations) ? payload.health_considerations : [],
        created_by: payload.created_by || null,
        updated_by: payload.updated_by || payload.created_by || null,
        created_at: payload.created_at || now,
        updated_at: now,
      };

      if (supabaseAdmin) {
        try {
          const { data, error } = await supabaseAdmin
            .from("matura_study_programs")
            .upsert(record, { onConflict: "id" })
            .select()
            .single();
          if (!error) return res.json({ success: true, data: normalizeStudyProgramRecord(data) });
          if (error.code !== "PGRST205" && error.code !== "42P01") console.error("DB matura study programs write error:", error);
        } catch (dbErr: any) {
          if (dbErr?.code !== "PGRST205" && dbErr?.code !== "42P01") console.error("DB matura study programs write connection error:", dbErr);
        }
      }

      const all = readJsonFile("matura_study_programs.json").filter(item => item.id !== record.id);
      writeJsonFile("matura_study_programs.json", [...all, record]);
      res.json({ success: true, data: normalizeStudyProgramRecord(record) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/matura-study-programs/:id", async (req, res) => {
    try {
      const { id } = req.params;
      if (supabaseAdmin) {
        try {
          const { error } = await supabaseAdmin.from("matura_study_programs").delete().eq("id", id);
          if (!error) return res.json({ success: true });
          if (error.code !== "PGRST205" && error.code !== "42P01") console.error("DB matura study programs delete error:", error);
        } catch (dbErr: any) {
          if (dbErr?.code !== "PGRST205" && dbErr?.code !== "42P01") console.error("DB matura study programs delete connection error:", dbErr);
        }
      }
      const items = readJsonFile("matura_study_programs.json").filter(item => item.id !== id);
      writeJsonFile("matura_study_programs.json", items);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/matura-study-applications", async (req, res) => {
    try {
      const { studentId } = req.query;
      if (supabaseAdmin) {
        try {
          let query = supabaseAdmin.from("matura_study_applications").select("*");
          if (studentId) query = query.eq("student_id", studentId);
          const { data, error } = await query.order("priority_index", { ascending: true });
          if (!error) return res.json(data || []);
          if (error.code !== "PGRST205" && error.code !== "42P01") console.error("DB matura study applications read error:", error);
        } catch (dbErr: any) {
          if (dbErr?.code !== "PGRST205" && dbErr?.code !== "42P01") console.error("DB matura study applications read connection error:", dbErr);
        }
      }
      let items = readJsonFile("matura_study_applications.json");
      if (studentId) items = items.filter(item => item.student_id === studentId);
      if (studentId && items.some(item => !item.study_program_id)) {
        const all = readJsonFile("matura_study_applications.json").filter(item => item.student_id !== studentId || item.study_program_id);
        writeJsonFile("matura_study_applications.json", all);
        items = items.filter(item => item.study_program_id);
      }
      items.sort((a, b) => Number(a.priority_index || 0) - Number(b.priority_index || 0));
      res.json(items);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/matura-study-applications", async (req, res) => {
    try {
      const payload = req.body || {};
      const studentId = String(payload.student_id || '').trim();
      const programs = Array.isArray(payload.programs) ? payload.programs : [];
      if (!studentId) return res.status(400).json({ error: "Učenik je obavezan." });
      if (programs.length > 10) return res.status(400).json({ error: "Moguće je odabrati najviše 10 studijskih programa." });

      const windowError = ensureDateWindow(
        await loadMaturaSettingsRecord(payload.school_id),
        "study_program_changes_opens_at",
        "study_program_changes_close_at",
        "Rok za prijavu studijskih programa još nije započeo.",
        "Rok za prijavu/brisanje studijskih programa je istekao."
      );
      if (windowError) return res.status(400).json({ error: windowError });

      const all = readJsonFile("matura_study_applications.json").filter(item => item.student_id !== studentId);
      const now = new Date().toISOString();
      const next = programs.map((program: any, index: number) => ({
        id: program.id || crypto.randomUUID(),
        student_id: studentId,
        priority_index: index + 1,
        study_program_id: program.study_program_id || program.id || null,
        name: String(program.name || '').trim(),
        city: String(program.city || '').trim() || null,
        institution: String(program.institution || '').trim() || null,
        requirements: program.requirements || null,
        is_currently_admitted: index === 0,
        created_at: program.created_at || now,
        updated_at: now,
      })).filter((program: any) => program.name && program.study_program_id);
      if (supabaseAdmin) {
        try {
          const { error: deleteError } = await supabaseAdmin
            .from("matura_study_applications")
            .delete()
            .eq("student_id", studentId);
          if (deleteError) {
            if (deleteError.code !== "PGRST205" && deleteError.code !== "42P01") console.error("DB matura study applications delete-before-write error:", deleteError);
          } else if (next.length === 0) {
            writeJsonFile("matura_study_applications.json", all);
            return res.json({ success: true, data: [] });
          } else {
            const { data, error } = await supabaseAdmin
              .from("matura_study_applications")
              .insert(next)
              .select()
              .order("priority_index", { ascending: true });
            if (!error) {
              writeJsonFile("matura_study_applications.json", [...all, ...(data || [])]);
              return res.json({ success: true, data: data || [] });
            }
            if (error.code !== "PGRST205" && error.code !== "42P01") console.error("DB matura study applications write error:", error);
          }
        } catch (dbErr: any) {
          if (dbErr?.code !== "PGRST205" && dbErr?.code !== "42P01") console.error("DB matura study applications write connection error:", dbErr);
        }
      }
      writeJsonFile("matura_study_applications.json", [...all, ...next]);
      res.json({ success: true, data: next });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });


  // ==========================================
  // Final Exam Defense Schedules & Commission Members APIs
  // ==========================================
  app.get("/api/final-exam-defense-schedules", async (req, res) => {
    try {
      const { schoolId, classId } = req.query;
      let dbSchedules: any[] = [];
      let dbMembers: any[] = [];

      if (supabaseAdmin) {
        try {
          let sQuery = supabaseAdmin.from('final_exam_defense_schedule').select('*');
          if (schoolId) sQuery = sQuery.eq('school_id', schoolId);
          if (classId) sQuery = sQuery.eq('class_id', classId);
          const { data: sData, error: sErr } = await sQuery;
          if (sData && !sErr) {
            dbSchedules = sData;
            
            const scheduleIds = dbSchedules.map(s => s.id);
            if (scheduleIds.length > 0) {
              const { data: mData, error: mErr } = await supabaseAdmin
                .from('final_exam_defense_commission_members')
                .select('*')
                .in('schedule_id', scheduleIds);
              if (mData && !mErr) {
                dbMembers = mData;
              }
            }
          }
        } catch (dbErr) {
          console.error("DB reading defense schedules error:", dbErr);
        }
      }

      // Merge with flat-file local fallback
      let localSchedules = readJsonFile("final_exam_defense_schedule.json");
      let localMembers = readJsonFile("final_exam_defense_commission_members.json");

      if (schoolId) {
        localSchedules = localSchedules.filter(s => s.school_id === schoolId);
      }
      if (classId) {
        localSchedules = localSchedules.filter(s => s.class_id === classId);
      }

      const mergedSchedulesMap = new Map();
      localSchedules.forEach(s => mergedSchedulesMap.set(s.id, s));
      dbSchedules.forEach(s => mergedSchedulesMap.set(s.id, s));
      const mergedSchedules = Array.from(mergedSchedulesMap.values());

      const mergedMembersMap = new Map();
      localMembers.forEach(m => mergedMembersMap.set(m.id, m));
      dbMembers.forEach(m => mergedMembersMap.set(m.id, m));
      const mergedMembers = Array.from(mergedMembersMap.values());

      // Wrap up members inside schedule
      const result = mergedSchedules.map(schedule => {
        const membersForSchedule = mergedMembers.filter(m => m.schedule_id === schedule.id);
        return {
          ...schedule,
          members: membersForSchedule
        };
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/final-exam-defense-schedules", async (req, res) => {
    try {
      const { school_id, school_year, class_id, defense_time, classroom, teacher_ids, homeroom_teacher_id } = req.body;
      
      if (!school_id || !school_year || !class_id || !defense_time || !classroom) {
        return res.status(400).json({ error: "Nedostaju obavezni podaci za raspored obrane" });
      }

      const scheduleId = crypto.randomUUID();
      const newSchedule = {
        id: scheduleId,
        school_id,
        school_year,
        class_id,
        defense_time,
        classroom,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const newMembers: any[] = [];
      if (teacher_ids && Array.isArray(teacher_ids)) {
        teacher_ids.forEach((teacherId: string) => {
          newMembers.push({
            id: crypto.randomUUID(),
            schedule_id: scheduleId,
            teacher_profile_id: teacherId,
            is_homeroom_teacher: teacherId === homeroom_teacher_id,
            created_at: new Date().toISOString()
          });
        });
      }

      let dbSaved = false;
      if (supabaseAdmin) {
        try {
          const { error: sErr } = await supabaseAdmin.from('final_exam_defense_schedule').insert(newSchedule);
          if (!sErr) {
            if (newMembers.length > 0) {
              const { error: mErr } = await supabaseAdmin.from('final_exam_defense_commission_members').insert(newMembers);
              if (!mErr) {
                dbSaved = true;
              } else {
                console.error("DB error inserting defense commission members:", mErr);
              }
            } else {
              dbSaved = true;
            }
          } else {
            console.error("DB error inserting defense schedule:", sErr);
          }
        } catch (dbErr) {
          console.error("DB error connecting for defense schedule post:", dbErr);
        }
      }

      // Save to flat files for fallback persistence
      const localSchedules = readJsonFile("final_exam_defense_schedule.json");
      localSchedules.push(newSchedule);
      writeJsonFile("final_exam_defense_schedule.json", localSchedules);

      const localMembers = readJsonFile("final_exam_defense_commission_members.json");
      localMembers.push(...newMembers);
      writeJsonFile("final_exam_defense_commission_members.json", localMembers);

      res.json({ success: true, data: { ...newSchedule, members: newMembers }, db_persisted: dbSaved });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/final-exam-defense-schedules/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { defense_time, classroom, teacher_ids, homeroom_teacher_id } = req.body;

      let dbUpdated = false;
      if (supabaseAdmin) {
        try {
          const updates: any = { updated_at: new Date().toISOString() };
          if (defense_time) updates.defense_time = defense_time;
          if (classroom) updates.classroom = classroom;

          const { error: sErr } = await supabaseAdmin.from('final_exam_defense_schedule').update(updates).eq('id', id);
          if (!sErr) {
            await supabaseAdmin.from('final_exam_defense_commission_members').delete().eq('schedule_id', id);
            
            const newMembers: any[] = [];
            if (teacher_ids && Array.isArray(teacher_ids)) {
              teacher_ids.forEach((teacherId: string) => {
                newMembers.push({
                  id: crypto.randomUUID(),
                  schedule_id: id,
                  teacher_profile_id: teacherId,
                  is_homeroom_teacher: teacherId === homeroom_teacher_id,
                  created_at: new Date().toISOString()
                });
              });
            }

            if (newMembers.length > 0) {
              const { error: mErr } = await supabaseAdmin.from('final_exam_defense_commission_members').insert(newMembers);
              if (!mErr) {
                dbUpdated = true;
              } else {
                console.error("DB commission members update error:", mErr);
              }
            } else {
              dbUpdated = true;
            }
          } else {
            console.error("DB schedule update error:", sErr);
          }
        } catch (dbErr) {
          console.error("DB error connecting for defense schedule update:", dbErr);
        }
      }

      // Local JSON update
      const localSchedules = readJsonFile("final_exam_defense_schedule.json");
      const sIdx = localSchedules.findIndex(s => s.id === id);
      if (sIdx !== -1) {
        if (defense_time) localSchedules[sIdx].defense_time = defense_time;
        if (classroom) localSchedules[sIdx].classroom = classroom;
        localSchedules[sIdx].updated_at = new Date().toISOString();
        writeJsonFile("final_exam_defense_schedule.json", localSchedules);
      }

      let localMembers = readJsonFile("final_exam_defense_commission_members.json");
      localMembers = localMembers.filter(m => m.schedule_id !== id);
      
      const newLocalMembers: any[] = [];
      if (teacher_ids && Array.isArray(teacher_ids)) {
        teacher_ids.forEach((teacherId: string) => {
          newLocalMembers.push({
            id: crypto.randomUUID(),
            schedule_id: id,
            teacher_profile_id: teacherId,
            is_homeroom_teacher: teacherId === homeroom_teacher_id,
            created_at: new Date().toISOString()
          });
        });
      }
      localMembers.push(...newLocalMembers);
      writeJsonFile("final_exam_defense_commission_members.json", localMembers);

      res.json({ success: true, db_updated: dbUpdated });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/final-exam-defense-schedules/:id", async (req, res) => {
    try {
      const { id } = req.params;
      let dbDeleted = false;
      if (supabaseAdmin) {
        try {
          // Delete members first in case no cascade exists
          const { error: membersErr } = await supabaseAdmin.from('final_exam_defense_commission_members').delete().eq('schedule_id', id);
          if (membersErr) {
            console.error("DB members delete error:", membersErr);
            return res.status(500).json({ error: membersErr.message, details: membersErr });
          }
          
          const { error: sErr } = await supabaseAdmin.from('final_exam_defense_schedule').delete().eq('id', id);
          if (!sErr) {
            dbDeleted = true;
          } else {
            console.error("DB schedule delete error:", sErr);
            return res.status(500).json({ error: sErr.message, details: sErr });
          }
        } catch (dbErr: any) {
          console.error("DB connection error for schedule delete:", dbErr);
          return res.status(500).json({ error: dbErr.message });
        }
      }

      const localSchedules = readJsonFile("final_exam_defense_schedule.json");
      const filteredSchedules = localSchedules.filter(s => s.id !== id);
      writeJsonFile("final_exam_defense_schedule.json", filteredSchedules);

      const localMembers = readJsonFile("final_exam_defense_commission_members.json");
      const filteredMembers = localMembers.filter(m => m.schedule_id !== id);
      writeJsonFile("final_exam_defense_commission_members.json", filteredMembers);

      res.json({ success: true, db_deleted: dbDeleted });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });


  // ==========================================
  // School Events (Školski Kalendar) APIs
  // ==========================================
  function getSchoolYearFromDate(dateStr: string): string {
    if (!dateStr) return "2025/2026";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "2025/2026";
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // 1-12
    if (month >= 9) {
      return `${year}/${year + 1}`;
    } else {
      return `${year - 1}/${year}`;
    }
  }

  function getWeekNumber(dateStr: string): number {
    if (!dateStr) return 1;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 1;
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return weekNo;
  }

  app.get("/api/school-events", async (req, res) => {
    try {
      const { schoolId } = req.query;

      if (supabaseAdmin) {
        let query = supabaseAdmin.from("school_events").select("*");
        if (schoolId) {
          query = query.eq("school_id", schoolId);
        }
        const { data, error } = await query.order("start_date", { ascending: true });
        if (!error && data) {
          const mappedData = data.map((row: any) => ({
            id: row.id,
            school_id: row.school_id,
            school_year: row.school_year,
            date: row.start_date,
            start_date: row.start_date,
            end_date: row.end_date,
            time: row.start_time,
            type: row.event_type,
            title: row.title,
            notes: row.description,
            classroom: row.classroom,
            is_instructional_day: row.is_instructional_day
          }));
          return res.json(mappedData);
        }
        if (error && error.code !== "PGRST205") {
          console.error("[SERVER] Supabase school_events query error:", error);
          return res.status(500).json({ error: `Baza podataka: [${error.code}] ${error.message}` });
        }
      }

      let events = readJsonFile("school_events.json");
      if (schoolId) {
        events = events.filter((e: any) => e.school_id === schoolId || e.schoolId === schoolId);
      }
      res.json(events);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/school-events", async (req, res) => {
    try {
      const eventData = req.body;

      const school_id = eventData.school_id || eventData.schoolId;
      const date = eventData.date || eventData.start_date;
      const school_year = eventData.school_year || getSchoolYearFromDate(date);
      const type = eventData.type;
      const title = eventData.title || "";
      const reason = eventData.reason || title || "";
      const is_instructional_day = eventData.is_instructional_day !== undefined ? !!eventData.is_instructional_day : null;

      // 8. Validate mandatory fields
      if (!school_id) {
        return res.status(400).json({
          success: false,
          error: "Id škole (school_id) je obavezan.",
          details: "school_id is required."
        });
      }
      if (!date) {
        return res.status(400).json({
          success: false,
          error: "Datum (date) je obavezan.",
          details: "date is required."
        });
      }
      if (!school_year) {
        return res.status(400).json({
          success: false,
          error: "Školska godina (school_year) je obavezna.",
          details: "school_year is required."
        });
      }
      if (!type) {
        return res.status(400).json({
          success: false,
          error: "Kategorija događaja (type) je obavezna.",
          details: "type is required."
        });
      }
      if (!title && !reason) {
        return res.status(400).json({
          success: false,
          error: "Prigoda/naziv događaja (title/reason) je obavezan.",
          details: "title or reason is required."
        });
      }
      if (is_instructional_day === null) {
        return res.status(400).json({
          success: false,
          error: "Indikator nastavnog dana (is_instructional_day) je obavezan.",
          details: "is_instructional_day is required."
        });
      }

      if (!eventData.id) {
        eventData.id = crypto.randomUUID();
      }

      const payload = {
        id: eventData.id,
        school_id,
        school_year,
        event_type: type,
        title: title || reason || type,
        description: eventData.notes || eventData.reason || null,
        start_date: eventData.start_date || date,
        end_date: eventData.end_date || date,
        start_time: eventData.start_time || eventData.time || null,
        end_time: eventData.end_time || null,
        classroom: eventData.classroom || null,
        is_instructional_day
      };

      console.log("SAVE SCHOOL CALENDAR PAYLOAD:", payload);

      if (supabaseAdmin) {
        const { error } = await supabaseAdmin.from("school_events").upsert(payload);
        if (error) {
          // 7. Add console.error in catch / error handling
          console.error("SAVE SCHOOL CALENDAR ERROR", error);
          // 4. Return Supabase error parameters
          return res.status(500).json({
            success: false,
            error: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code
          });
        }
        return res.json({ success: true, data: payload });
      }

      eventData.created_at = new Date().toISOString();
      eventData.school_year = school_year;
      eventData.school_id = school_id;
      eventData.is_instructional_day = is_instructional_day;
      const events = readJsonFile("school_events.json");
      events.push(eventData);
      writeJsonFile("school_events.json", events);
      res.json({ success: true, data: eventData });
    } catch (error: any) {
      // 7. Add console.error in catch
      console.error("SAVE SCHOOL CALENDAR ERROR", error);
      // 3. Return actual error in standard error envelope
      res.status(500).json({
        success: false,
        error: error.message,
        details: error
      });
    }
  });

  app.delete("/api/school-events/:id", async (req, res) => {
    try {
      const { id } = req.params;

      if (supabaseAdmin) {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        if (isUuid) {
          const { error } = await supabaseAdmin.from("school_events").delete().eq("id", id);
          if (error) {
            console.error("DELETE SCHOOL CALENDAR ERROR", error);
            return res.status(500).json({
              success: false,
              error: error.message,
              details: error.details,
              hint: error.hint,
              code: error.code
            });
          }
          return res.json({ success: true });
        }
      }

      const events = readJsonFile("school_events.json");
      const filtered = events.filter((e: any) => e.id !== id);
      writeJsonFile("school_events.json", filtered);
      res.json({ success: true });
    } catch (error: any) {
      console.error("DELETE SCHOOL CALENDAR ERROR", error);
      res.status(500).json({
        success: false,
        error: error.message,
        details: error
      });
    }
  });

  app.post("/api/admin/delete-school-event", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      const { id } = req.body;
      if (!id) {
        return res.status(400).json({ success: false, error: "Missing event id" });
      }

      // Query the event row first to return it on success
      const { data: event, error: getError } = await supabaseAdmin
        .from("school_events")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (getError || !event) {
        return res.status(404).json({ success: false, error: getError?.message || "Event not found" });
      }

      // Delete from table
      const { error: deleteError } = await supabaseAdmin
        .from("school_events")
        .delete()
        .eq("id", id);

      if (deleteError) {
        return res.status(500).json({ success: false, error: deleteError.message });
      }

      // Return the expected deleted event mapped payload
      res.json({
        success: true,
        data: {
          id: event.id,
          school_id: event.school_id,
          school_year: event.school_year,
          date: event.start_date,
          start_date: event.start_date,
          end_date: event.end_date,
          time: event.start_time,
          type: event.event_type,
          title: event.title,
          notes: event.description,
          classroom: event.classroom,
          is_instructional_day: event.is_instructional_day
        }
      });
    } catch (err: any) {
      console.error("[SERVER] delete-school-event error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });


  // ==========================================
  // School Documents (Interni dokumenti škole) APIs
  // ==========================================
  app.get("/api/school-documents", (req, res) => {
    try {
      const { schoolId } = req.query;
      let docs = readJsonFile("school_documents.json");
      if (schoolId) {
        docs = docs.filter((d: any) => d.school_id === schoolId || d.schoolId === schoolId);
      }
      res.json(docs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/school-documents", (req, res) => {
    try {
      const docData = req.body;
      if (!docData.id) {
        docData.id = crypto.randomUUID();
      }
      docData.created_at = new Date().toISOString();
      const docs = readJsonFile("school_documents.json");
      docs.push(docData);
      writeJsonFile("school_documents.json", docs);
      res.json({ success: true, data: docData });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/school-documents/:id", (req, res) => {
    try {
      const { id } = req.params;
      const docs = readJsonFile("school_documents.json");
      const filtered = docs.filter((d: any) => d.id !== id);
      writeJsonFile("school_documents.json", filtered);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // Fallback audit logging API
  // ==========================================
  app.get("/api/audit-logs", (req, res) => {
    try {
      const { schoolId } = req.query;
      let logs = readJsonFile("system_audit_logs.json");
      if (schoolId) {
        logs = logs.filter((l: any) => l.school_id === schoolId);
      }
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/audit-logs", (req, res) => {
    try {
      const logData = req.body;
      if (!logData.id) {
        logData.id = crypto.randomUUID();
      }
      logData.created_at = new Date().toISOString();
      const logs = readJsonFile("system_audit_logs.json");
      logs.push(logData);
      writeJsonFile("system_audit_logs.json", logs);
      res.json({ success: true, data: logData });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });


  // 1. Lektire APIs
  const checkLektirePermission = async (authHeader: string | undefined, classId: string): Promise<{ authorized: boolean; error?: string; userId?: string }> => {
    if (!supabaseAdmin) return { authorized: false, error: "Database admin client not configured" };
    if (!authHeader) return { authorized: false, error: "Missing authorization header" };
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return { authorized: false, error: "Invalid token" };

    const userId = user.id;

    // 1. Check if user is an Administrator
    const { data: roles } = await supabaseAdmin
      .from('user_school_roles')
      .select('role')
      .eq('user_id', userId)
      .in('role', ['MAIN_ADMIN', 'ADMIN', 'SCHOOL_ADMIN']);

    if (roles && roles.length > 0) {
      return { authorized: true, userId };
    }

    // 2. Check if user is a Croatian Language teacher for classId
    // Get Croatian language subjects
    const { data: subjects } = await supabaseAdmin
      .from('subjects')
      .select('id')
      .ilike('name', '%hrvatski%');

    if (subjects && subjects.length > 0) {
      const subjectIds = subjects.map(s => s.id);
      const { data: assignment } = await supabaseAdmin
        .from('class_subject_teachers')
        .select('id')
        .eq('class_id', classId)
        .eq('teacher_id', userId)
        .in('subject_id', subjectIds)
        .limit(1);

      if (assignment && assignment.length > 0) {
        return { authorized: true, userId };
      }
    }

    return { authorized: false, error: "Nemate ovlasti za pristup lektiri za ovaj razred.", userId };
  };

  app.get("/api/lektire", async (req, res) => {
    try {
      const { classId, subjectId, schoolId, schoolYearId } = req.query;
      if (!classId) return res.status(400).json({ error: "classId is required" });
      
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");

      const permCheck = await checkLektirePermission(req.headers.authorization, classId as string);
      if (!permCheck.authorized) return res.status(403).json({ error: permCheck.error });

      let query = supabaseAdmin.from("reading_assignments").select("*").eq("class_id", classId);
      
      if (subjectId) {
        query = query.eq("subject_id", subjectId);
      }
      
      if (schoolId) {
        query = query.eq("school_id", schoolId);
      }
      
      if (schoolYearId) {
        query = query.eq("school_year_id", schoolYearId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      // Console logs requested by user
      if (error || !data) {
        console.log("READING ASSIGNMENTS RESULT", { data, error });
      }
      
      res.json(data || []);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/lektire", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      
      const { classId, subjectId, completedDate, title, processingDetails, createdBy, schoolId, schoolYearId, teacherId } = req.body;
      
      if (!classId || !subjectId || !title) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const permCheck = await checkLektirePermission(req.headers.authorization, classId);
      if (!permCheck.authorized) return res.status(403).json({ error: permCheck.error });
      
      const payload = {
        class_id: classId,
        subject_id: subjectId,
        title,
        author: null,
        processing_method: null,
        processing_details: processingDetails || null,
        processed_at: completedDate || new Date().toISOString(),
        created_by: createdBy || permCheck.userId || null,
        teacher_id: teacherId || permCheck.userId || null,
        school_id: schoolId || null,
        school_year_id: schoolYearId || null
      };

      console.log("SAVE READING PAYLOAD", payload);

      const { data, error } = await supabaseAdmin
        .from("reading_assignments")
        .insert(payload)
        .select()
        .single();
        
      console.log("SAVE READING RESULT", { data, error });

      if (error) {
        if (error?.code === '23505') {
          return res.status(409).json({ error: "Lektira s ovim naslovom i datumom već postoji za ovaj razred." });
        }
        throw error;
      }
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/lektire/:id", async (req, res) => {
    try {
      const { id } = req.params;
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      
      // Fetch existing reading assignment to get class_id
      const { data: existing, error: findError } = await supabaseAdmin
        .from("reading_assignments")
        .select("class_id")
        .eq("id", id)
        .maybeSingle();

      if (findError || !existing) {
        return res.status(404).json({ error: "Lektira nije pronađena." });
      }

      const permCheck = await checkLektirePermission(req.headers.authorization, existing.class_id);
      if (!permCheck.authorized) return res.status(403).json({ error: permCheck.error });

      const { title, completedDate, processingDetails } = req.body;
      
      const payload = {
        title,
        processing_details: processingDetails || null,
        processed_at: completedDate,
        updated_at: new Date().toISOString()
      };

      console.log("SAVE READING PAYLOAD", payload);

      const { data, error } = await supabaseAdmin
        .from("reading_assignments")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
      
      console.log("SAVE READING RESULT", { data, error });

      if (error) {
        if (error?.code === '23505') {
          return res.status(409).json({ error: "Lektira s ovim naslovom i datumom već postoji za ovaj razred." });
        }
        throw error;
      }
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/lektire/:id", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      const { id } = req.params;

      // Fetch existing reading assignment to get class_id
      const { data: existing, error: findError } = await supabaseAdmin
        .from("reading_assignments")
        .select("class_id")
        .eq("id", id)
        .maybeSingle();

      if (findError || !existing) {
        return res.status(404).json({ error: "Lektira nije pronađena." });
      }

      const permCheck = await checkLektirePermission(req.headers.authorization, existing.class_id);
      if (!permCheck.authorized) return res.status(403).json({ error: permCheck.error });

      const { error } = await supabaseAdmin
        .from("reading_assignments")
        .delete()
        .eq("id", id);
      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Pedagoska Dokumentacija RESTructured APIs
  app.get("/api/student-pedagogical-profile", async (req, res) => {
    try {
      const { studentId } = req.query;
      if (!studentId) {
        return res.status(400).json({ error: "studentId is required" });
      }

      // Fetch the real, current program_adjustment directly from the user_profiles table if database is online
      let dbProgramAdjustment = "NONE";
      if (supabaseAdmin) {
        try {
          const { data: userProf, error: userProfErr } = await supabaseAdmin
            .from("user_profiles")
            .select("program_adjustment")
            .eq("id", studentId)
            .maybeSingle();
          if (!userProfErr && userProf) {
            dbProgramAdjustment = userProf.program_adjustment || "NONE";
          }
        } catch (dbErr) {
          console.warn("Failed to query program_adjustment from user_profiles in GET:", dbErr);
        }
      }

      let profile: any = null;

      if (supabaseAdmin) {
        try {
          const { data, error } = await supabaseAdmin
            .from("student_pedagogical_profiles")
            .select("*")
            .eq("student_id", studentId)
            .maybeSingle();
          if (!error && data) {
            profile = data;
          }
        } catch (dbErr) {
          // If the table doesn't exist, log a warning instead of breaking
          console.warn("student_pedagogical_profiles query failed or table doesn't exist:", dbErr);
        }
      }

      if (!profile) {
        // JSON Fallback
        let list = readJsonFile("student_pedagogical_profiles.json");
        profile = list.find(p => p.student_id === studentId || p.studentId === studentId);
        if (!profile) {
          profile = {
            student_id: studentId,
            education_program: "",
            visit_reason: "",
            disabilities: "",
            accommodations: "",
            support_types: "",
            practical_training: "",
            documentation: "",
            program_adjustment: "NONE",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
        }
      }

      // ALWAYS override program_adjustment with the real value from user_profiles
      profile.program_adjustment = dbProgramAdjustment;

      // Console log loaded profile as requested
      console.log("LOAD PEDAGOGICAL PROFILE", profile);
      console.log("LOADED PROGRAM ADJUSTMENT", profile?.program_adjustment);

      res.json(profile);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  const handleStudentPedagogicalProfile = async (req: any, res: any) => {
    try {
      console.log("[PEDAGOGICAL_PROFILE] Received state update payload:", req.body);
      const payload = req.body || {};
      const studentId = payload.studentId || payload.student_id;
      
      if (!studentId) {
        console.error("[PEDAGOGICAL_PROFILE] Missing studentId in request body:", payload);
        return res.status(400).json({ error: "studentId is required" });
      }

      const valAdjustment = payload.program_adjustment || payload.programAdjustment || payload.value || "NONE";
      console.log(`[PEDAGOGICAL_PROFILE] Saving profile for student: ${studentId}, adjustment value: ${valAdjustment}`);

      const dbPayload = {
        student_id: studentId,
        education_program: payload.education_program || payload.educationProgram || "",
        visit_reason: payload.visit_reason || payload.visitReason || "",
        disabilities: payload.disabilities || "",
        accommodations: payload.accommodations || "",
        support_types: payload.support_types || payload.supportTypes || "",
        practical_training: payload.practical_training || payload.practicalTraining || "",
        documentation: payload.documentation || "",
        updated_at: new Date().toISOString()
      };

      if (supabaseAdmin) {
        try {
          console.log(`[PEDAGOGICAL_PROFILE] Updating user_profiles table directly config...`);
          const { error: profileUpdError } = await supabaseAdmin
            .from("user_profiles")
            .update({ program_adjustment: valAdjustment })
            .eq("id", studentId);
          if (profileUpdError) {
            console.error("[PEDAGOGICAL_PROFILE] Supabase profile update column error:", profileUpdError);
          }
        } catch (dbErr) {
          console.error("[PEDAGOGICAL_PROFILE] Executing user_profiles update caught error:", dbErr);
        }

        try {
          console.log(`[PEDAGOGICAL_PROFILE] Inserting/Upserting details into student_pedagogical_profiles table...`);
          const { data, error } = await supabaseAdmin
            .from("student_pedagogical_profiles")
            .upsert(dbPayload, { onConflict: "student_id" })
            .select("*")
            .maybeSingle();
          
          if (!error && data) {
            const merged = { ...data, program_adjustment: valAdjustment };
            console.log("[PEDAGOGICAL_PROFILE] Database record upserted successfully:", merged);
            return res.json(merged);
          } else if (error) {
            console.error("[PEDAGOGICAL_PROFILE] Supabase student_pedagogical_profiles upsert returned error:", error);
          }
        } catch (dbErr: any) {
          console.error("[PEDAGOGICAL_PROFILE] Executing student_pedagogical_profiles table upsert threw exception:", dbErr);
        }
        
        console.log("[INFO] Synchronization fallback: using local JSON storage.");
      }

      // JSON Fallback
      let list = readJsonFile("student_pedagogical_profiles.json");
      const idx = list.findIndex(p => p.student_id === studentId || p.studentId === studentId);
      const newProfile = {
        id: idx >= 0 ? list[idx].id : Math.random().toString(36).substring(2, 9) + '-' + Date.now(),
        ...dbPayload,
        program_adjustment: valAdjustment,
        created_at: idx >= 0 ? (list[idx].created_at || new Date().toISOString()) : new Date().toISOString()
      };

      if (idx >= 0) {
        list[idx] = newProfile;
      } else {
        list.push(newProfile);
      }
      
      writeJsonFile("student_pedagogical_profiles.json", list);
      console.log("[PEDAGOGICAL_PROFILE] Fallback saved successfully:", newProfile);
      res.json(newProfile);
    } catch (err: any) {
      console.error("[PEDAGOGICAL_PROFILE] CRITICAL error inside handleStudentPedagogicalProfile handler:", err);
      res.status(500).json({ error: err.message, stack: err.stack });
    }
  };

  app.post("/api/student-pedagogical-profile", handleStudentPedagogicalProfile);
  app.put("/api/student-pedagogical-profile", handleStudentPedagogicalProfile);
  app.patch("/api/student-pedagogical-profile", handleStudentPedagogicalProfile);

  app.get("/api/student-pedagogical-year-notes", async (req, res) => {
    try {
      const { studentId, classId, schoolYearId } = req.query;
      if (!studentId || !classId || !schoolYearId) {
        return res.status(400).json({ error: "studentId, classId and schoolYearId are required" });
      }

      if (supabaseAdmin) {
        const { data, error } = await supabaseAdmin
          .from("student_pedagogical_year_notes")
          .select("*")
          .eq("student_id", studentId)
          .eq("class_id", classId)
          .eq("school_year_id", schoolYearId)
          .maybeSingle();
        if (!error && data) {
          return res.json(data);
        }
      }

      // JSON Fallback
      let list = readJsonFile("student_pedagogical_year_notes.json");
      let note = list.find(p => p.student_id === studentId && p.class_id === classId && p.school_year_id === schoolYearId);
      if (!note) {
        note = {
          student_id: studentId,
          class_id: classId,
          school_year_id: schoolYearId,
          recommendations: "",
          counselor_notes: "",
          yearly_observations: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      }
      res.json(note);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/student-pedagogical-year-notes", async (req, res) => {
    try {
      const payload = req.body;
      const { studentId, classId, schoolYearId } = payload;
      if (!studentId || !classId || !schoolYearId) {
        return res.status(400).json({ error: "studentId, classId and schoolYearId are required" });
      }

      const dbPayload = {
        student_id: studentId,
        class_id: classId,
        school_year_id: schoolYearId,
        recommendations: payload.recommendations || "",
        counselor_notes: payload.counselor_notes || "",
        yearly_observations: Array.isArray(payload.yearly_observations) ? payload.yearly_observations : [],
        updated_at: new Date().toISOString()
      };

      if (supabaseAdmin) {
        const { data, error } = await supabaseAdmin
          .from("student_pedagogical_year_notes")
          .upsert(dbPayload, { onConflict: "student_id,school_year_id,class_id" })
          .select("*")
          .maybeSingle();
        if (!error && data) {
          return res.json(data);
        } else {
          console.log("[INFO] Synchronization fallback for notes: using local JSON storage.");
        }
      }

      // JSON Fallback
      let list = readJsonFile("student_pedagogical_year_notes.json");
      const idx = list.findIndex(p => p.student_id === studentId && p.class_id === classId && p.school_year_id === schoolYearId);
      const newNote = {
        id: idx >= 0 ? list[idx].id : Math.random().toString(36).substring(2, 9) + '-' + Date.now(),
        ...dbPayload,
        created_at: idx >= 0 ? list[idx].created_at : new Date().toISOString()
      };

      if (idx >= 0) {
        list[idx] = newNote;
      } else {
        list.push(newNote);
      }
      writeJsonFile("student_pedagogical_year_notes.json", list);
      res.json(newNote);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/pedagoska-dokumentacija", (req, res) => {
    try {
      const { classId, studentId } = req.query;
      let list = readJsonFile("pedagoska_dokumentacija.json");
      if (classId) {
        list = list.filter(p => p.class_id === classId || p.classId === classId);
      }
      if (studentId) {
        list = list.filter(p => p.student_id === studentId || p.studentId === studentId);
      }
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/pedagoska-dokumentacija", (req, res) => {
    try {
      const payload = req.body;
      if (!payload.studentId || !payload.classId || !payload.schoolYear) {
        return res.status(400).json({ error: "Missing required fields: studentId, classId, schoolYear" });
      }
      
      const list = readJsonFile("pedagoska_dokumentacija.json");
      const newDoc = {
        id: Math.random().toString(36).substring(2, 9) + '-' + Date.now(),
        student_id: payload.studentId,
        studentId: payload.studentId,
        class_id: payload.classId,
        classId: payload.classId,
        school_year: payload.schoolYear,
        schoolYear: payload.schoolYear,
        education_program: payload.educationProgram || "",
        educationProgram: payload.educationProgram || "",
        assistance_form: payload.assistanceForm || "",
        assistanceForm: payload.assistanceForm || "",
        difficulties: payload.difficulties || "",
        visit_reason: payload.visitReason || "",
        visitReason: payload.visitReason || "",
        interview_date: payload.interviewDate || null,
        interviewDate: payload.interviewDate || null,
        interviewer_name: payload.interviewerName || "",
        interviewerName: payload.interviewerName || "",
        record_type: payload.recordType || "",
        recordType: payload.recordType || "",
        problem_description: payload.problemDescription || "",
        problemDescription: payload.problemDescription || "",
        measures_taken: payload.measuresTaken || "",
        measuresTaken: payload.measuresTaken || "",
        teacher_recommendational_notes: payload.teacherRecommendationalNotes || "",
        teacherRecommendationalNotes: payload.teacherRecommendationalNotes || "",
        parent_recommendational_notes: payload.parentRecommendationalNotes || "",
        parentRecommendationalNotes: payload.parentRecommendationalNotes || "",
        confidential_notes: payload.confidentialNotes || "",
        confidentialNotes: payload.confidentialNotes || "",
        attachments: payload.attachments || [],
        status: payload.status || "OPEN",
        created_by: payload.createdBy || null,
        createdBy: payload.createdBy || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      list.push(newDoc);
      writeJsonFile("pedagoska_dokumentacija.json", list);
      res.json(newDoc);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/pedagoska-dokumentacija/:id", (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const list = readJsonFile("pedagoska_dokumentacija.json");
      const idx = list.findIndex(p => p.id === id);
      if (idx === -1) return res.status(404).json({ error: "Document not found" });
      
      const item = list[idx];
      const updatedItem = {
        ...item,
        education_program: updates.educationProgram !== undefined ? updates.educationProgram : item.education_program,
        educationProgram: updates.educationProgram !== undefined ? updates.educationProgram : item.educationProgram,
        assistance_form: updates.assistanceForm !== undefined ? updates.assistanceForm : item.assistance_form,
        assistanceForm: updates.assistanceForm !== undefined ? updates.assistanceForm : item.assistanceForm,
        difficulties: updates.difficulties !== undefined ? updates.difficulties : item.difficulties,
        visit_reason: updates.visitReason !== undefined ? updates.visitReason : item.visit_reason,
        visitReason: updates.visitReason !== undefined ? updates.visitReason : item.visitReason,
        interview_date: updates.interviewDate !== undefined ? updates.interviewDate : item.interview_date,
        interviewDate: updates.interviewDate !== undefined ? updates.interviewDate : item.interviewDate,
        interviewer_name: updates.interviewerName !== undefined ? updates.interviewerName : item.interviewer_name,
        interviewerName: updates.interviewerName !== undefined ? updates.interviewerName : item.interviewerName,
        record_type: updates.recordType !== undefined ? updates.recordType : item.record_type,
        recordType: updates.recordType !== undefined ? updates.recordType : item.recordType,
        problem_description: updates.problemDescription !== undefined ? updates.problemDescription : item.problem_description,
        problemDescription: updates.problemDescription !== undefined ? updates.problemDescription : item.problemDescription,
        measures_taken: updates.measuresTaken !== undefined ? updates.measuresTaken : item.measures_taken,
        measuresTaken: updates.measuresTaken !== undefined ? updates.measuresTaken : item.measures_taken,
        teacher_recommendational_notes: updates.teacherRecommendationalNotes !== undefined ? updates.teacherRecommendationalNotes : item.teacher_recommendational_notes,
        teacherRecommendationalNotes: updates.teacherRecommendationalNotes !== undefined ? updates.teacherRecommendationalNotes : item.teacherRecommendationalNotes,
        parent_recommendational_notes: updates.parentRecommendationalNotes !== undefined ? updates.parentRecommendationalNotes : item.parent_recommendational_notes,
        parentRecommendationalNotes: updates.parentRecommendationalNotes !== undefined ? updates.parentRecommendationalNotes : item.parentRecommendationalNotes,
        confidential_notes: updates.confidentialNotes !== undefined ? updates.confidentialNotes : item.confidential_notes,
        confidentialNotes: updates.confidentialNotes !== undefined ? updates.confidentialNotes : item.confidentialNotes,
        attachments: updates.attachments !== undefined ? updates.attachments : item.attachments,
        status: updates.status !== undefined ? updates.status : item.status,
        updated_at: new Date().toISOString()
      };
      
      list[idx] = updatedItem;
      writeJsonFile("pedagoska_dokumentacija.json", list);
      res.json(updatedItem);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/pedagoska-dokumentacija/:id", (req, res) => {
    try {
      const { id } = req.params;
      let list = readJsonFile("pedagoska_dokumentacija.json");
      list = list.filter(p => p.id !== id);
      writeJsonFile("pedagoska_dokumentacija.json", list);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Daily Notes APIs
  app.get("/api/daily-notes", (req, res) => {
    try {
      const { classId, date, schoolYearId } = req.query;
      if (!classId || !date) {
        return res.status(400).json({ error: "classId and date are required" });
      }
      
      let list = readJsonFile("daily_notes.json");
      list = list.filter(n => (n.class_id === classId || n.classId === classId) && n.date === date);
      
      if (schoolYearId) {
        list = list.filter(n => n.school_year_id === schoolYearId || n.schoolYearId === schoolYearId);
      }
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/daily-notes", (req, res) => {
    try {
      const { classId, schoolYearId, date, content, createdBy, authorName } = req.body;
      if (!classId || !date || !content) {
        return res.status(400).json({ error: "Missing required fields: classId, date, content" });
      }
      
      const list = readJsonFile("daily_notes.json");
      const newNote = {
        id: Math.random().toString(36).substring(2, 9) + '-' + Date.now(),
        class_id: classId,
        classId,
        school_year_id: schoolYearId || null,
        schoolYearId: schoolYearId || null,
        date,
        content,
        created_by: createdBy || null,
        createdBy: createdBy || null,
        authorName: authorName || "Nastavnik",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      list.push(newNote);
      writeJsonFile("daily_notes.json", list);
      res.json(newNote);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/daily-notes/:id", (req, res) => {
    try {
      const { id } = req.params;
      const { content } = req.body;
      if (!content) return res.status(400).json({ error: "content is required" });
      
      const list = readJsonFile("daily_notes.json");
      const idx = list.findIndex(n => n.id === id);
      if (idx === -1) return res.status(404).json({ error: "Note not found" });
      
      const item = list[idx];
      list[idx] = {
        ...item,
        content,
        updated_at: new Date().toISOString()
      };
      
      writeJsonFile("daily_notes.json", list);
      res.json(list[idx]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/daily-notes/:id", (req, res) => {
    try {
      const { id } = req.params;
      let list = readJsonFile("daily_notes.json");
      list = list.filter(n => n.id !== id);
      writeJsonFile("daily_notes.json", list);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Temporary Migration Endpoint - to be removed later
  app.post("/api/admin/update-program-years", async (req, res) => {
    try {
        if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
        
        const { data: programs, error: fetchErr } = await supabaseAdmin
          .from('programs')
          .select('*');
        
        if (fetchErr) throw fetchErr;

        for (const program of programs) {
           let years = 4;
           if (program.name.toLowerCase().includes('kuhar') || 
               program.name.toLowerCase().includes('konobar') || 
               program.name.toLowerCase().includes('slastičar')) {
               years = 3;
           }
           
           await supabaseAdmin
             .from('programs')
             .update({ duration_years: years })
             .eq('id', program.id);
        }
        
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/run-initial-setup", async (req, res) => {
    try {
        if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
        const sql = `
CREATE TABLE IF NOT EXISTS public.school_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id TEXT NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  school_year text NOT NULL,
  event_type text NOT NULL,
  title text,
  description text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  start_time time,
  end_time time,
  is_instructional_day boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.final_exam_defense_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id TEXT NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  school_year text NOT NULL,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  defense_time time NOT NULL,
  classroom text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.final_exam_defense_commission_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.final_exam_defense_schedule(id) ON DELETE CASCADE,
  teacher_profile_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  is_homeroom_teacher boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(schedule_id, teacher_profile_id)
);
        `;
        const { error } = await (supabaseAdmin as any).query(sql);
        if (error) throw error;
        res.json({ success: true });
    } catch (err: any) {
        console.error("[SERVER] Setup migration error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/admin/run-thesis-migration2", async (req, res) => {
    try {
        if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
        const sql = `
ALTER TABLE public.final_thesis
ADD COLUMN IF NOT EXISTS mentor_id uuid REFERENCES public.user_profiles(id),
ADD COLUMN IF NOT EXISTS status text DEFAULT 'CREATED',
ADD COLUMN IF NOT EXISTS final_grade integer,
ADD COLUMN IF NOT EXISTS final_grade_date date,
ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES public.classes(id),
ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id),
ADD COLUMN IF NOT EXISTS application_classification_number text,
ADD COLUMN IF NOT EXISTS application_registry_number text,
ADD COLUMN IF NOT EXISTS application_data_entered_at timestamptz,
ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
ADD COLUMN IF NOT EXISTS accepted_by uuid REFERENCES public.user_profiles(id),
ADD COLUMN IF NOT EXISTS student_note text,
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES public.user_profiles(id),
ADD COLUMN IF NOT EXISTS rejection_note text;

CREATE TABLE IF NOT EXISTS public.final_thesis_committee_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  final_thesis_id uuid NOT NULL REFERENCES public.final_thesis(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.user_profiles(id),
  created_at timestamptz DEFAULT now()
);
        `;
        const { error } = await supabaseAdmin.query(sql);
        if (error) throw error;
        
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/run-audit-migration", async (req, res) => {
    try {
        if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
        const sql1 = fs.readFileSync("migrations/20260603000001_notifications.sql", "utf8");
        const sql2 = fs.readFileSync("migrations/20260603000002_notification_triggers.sql", "utf8");
        
        await supabaseAdmin.query(sql1);
        await supabaseAdmin.query(sql2);
        
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
  });

  // Core e-Dnevnik to Supabase Synchronization Service
  async function syncEdnevnikUsers(options: { schoolId?: string; triggeredBy?: string; autoFix?: boolean; singleEmail?: string }) {
    if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");

    const { schoolId, triggeredBy, autoFix = true, singleEmail } = options;
    const DEFAULT_PIN_HASH = '$2b$10$EEbRoX3UU0AtHm3CMZSABOXxL9ghae0./0eeeBuKVpYEsAaDdXQ72'; // bcrypt for '1234'
    const DEFAULT_SCHOOL_ID = schoolId || 'srednja-kola-glina-zagreb';

    const reportDetails: any[] = [];
    let newUsersCount = 0;
    let updatedUsersCount = 0;

    // 1. Fetch all Auth Users from Supabase Auth
    let authUsers: any[] = [];
    try {
      const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.listUsers();
      if (!authErr && authData) {
        authUsers = authData.users || [];
      }
    } catch (err: any) {
      console.warn("[SYNC] Error fetching auth users:", err);
    }

    if (singleEmail) {
      const targetLower = singleEmail.trim().toLowerCase();
      authUsers = authUsers.filter((u: any) => u.email?.toLowerCase() === targetLower);
    }

    // 2. Fetch public database state
    let profileQuery = supabaseAdmin.from('user_profiles').select('*');
    if (singleEmail) {
      profileQuery = profileQuery.ilike('email', singleEmail.trim());
    }
    const { data: dbProfiles, error: profErr } = await profileQuery;
    if (profErr) throw profErr;

    const { data: dbSchoolRoles } = await supabaseAdmin.from('user_school_roles').select('*');
    const { data: dbSchools } = await supabaseAdmin.from('schools').select('*');
    const { data: dbClasses } = await supabaseAdmin.from('classes').select('*');

    const profilesByAuthId = new Map<string, any>();
    const profilesByEmail = new Map<string, any>();
    const profilesById = new Map<string, any>();

    (dbProfiles || []).forEach((p: any) => {
      if (p.auth_user_id) profilesByAuthId.set(p.auth_user_id, p);
      if (p.email) profilesByEmail.set(p.email.toLowerCase(), p);
      profilesById.set(p.id, p);
    });

    const schoolRolesSet = new Set<string>();
    (dbSchoolRoles || []).forEach((r: any) => {
      schoolRolesSet.add(`${r.user_id}_${r.school_id}_${r.role}`);
    });

    const targetSchoolId = dbSchools?.find((s: any) => s.id === DEFAULT_SCHOOL_ID)?.id || dbSchools?.[0]?.id || DEFAULT_SCHOOL_ID;

    // Step A: Process Auth Users -> Ensure linked user_profiles & user_school_roles exist
    for (const authUser of authUsers) {
      const emailLower = (authUser.email || '').toLowerCase();
      if (!emailLower) continue;

      let profile = profilesByAuthId.get(authUser.id) || profilesByEmail.get(emailLower);

      if (profile) {
        let updated = false;
        if (!profile.auth_user_id || profile.auth_user_id !== authUser.id) {
          if (autoFix) {
            const { error: linkErr } = await supabaseAdmin
              .from('user_profiles')
              .update({ auth_user_id: authUser.id })
              .eq('id', profile.id);
            if (!linkErr) {
              profile.auth_user_id = authUser.id;
              updated = true;
            }
          }
        }

        const isStaffRole = ['TEACHER', 'HOMEROOM', 'DEPUTY', 'SCHOOL_ADMIN', 'ADMIN', 'MAIN_ADMIN'].includes(profile.role) || profile.access_role === 'super_admin';
        if (isStaffRole && !profile.pin_hash) {
          if (autoFix) {
            await supabaseAdmin
              .from('user_profiles')
              .update({ pin_hash: DEFAULT_PIN_HASH })
              .eq('id', profile.id);
            profile.pin_hash = DEFAULT_PIN_HASH;
            updated = true;
          }
        }

        if (updated) {
          updatedUsersCount++;
          reportDetails.push({
            email: profile.email,
            name: profile.name,
            role: profile.role || 'USER',
            status: 'UPDATED',
            message: 'Povezan auth_user_id / ažurirane postavke'
          });
        } else {
          reportDetails.push({
            email: profile.email,
            name: profile.name,
            role: profile.role || 'USER',
            status: 'OK',
            message: 'Profil i Auth već sinkronizirani'
          });
        }
      } else {
        if (autoFix) {
          const username = emailLower.split('@')[0];
          let assignedRole = 'STUDENT';
          let accessRole = 'user';

          if (emailLower.includes('admin') || emailLower === 'nikolad4487@gmail.com' || emailLower === 'skola@skolehr.xyz') {
            assignedRole = 'MAIN_ADMIN';
            accessRole = 'super_admin';
          } else if (emailLower.includes('ravnatelj') || emailLower.includes('satnicar') || emailLower.includes('tajnistvo')) {
            assignedRole = 'SCHOOL_ADMIN';
            accessRole = 'SCHOOL_ADMIN';
          } else if (emailLower.includes('prof') || emailLower.includes('nastavnik')) {
            assignedRole = 'TEACHER';
            accessRole = 'TEACHER';
          }

          const isStaff = ['TEACHER', 'HOMEROOM', 'SCHOOL_ADMIN', 'MAIN_ADMIN', 'ADMIN'].includes(assignedRole);

          const newProfilePayload: any = {
            auth_user_id: authUser.id,
            email: emailLower,
            name: authUser.user_metadata?.full_name || authUser.user_metadata?.name || username.replace('.', ' '),
            role: assignedRole,
            access_role: accessRole,
            school_id: targetSchoolId,
            active_school_id: targetSchoolId,
            is_first_login: false,
            requires_password_change: false,
            requires_authenticator_setup: false,
            pin_hash: isStaff ? DEFAULT_PIN_HASH : null
          };

          const { data: createdProf, error: createErr } = await supabaseAdmin
            .from('user_profiles')
            .insert(newProfilePayload)
            .select()
            .single();

          if (!createErr && createdProf) {
            profile = createdProf;
            profilesById.set(profile.id, profile);
            profilesByAuthId.set(authUser.id, profile);
            profilesByEmail.set(emailLower, profile);
            newUsersCount++;

            reportDetails.push({
              email: emailLower,
              name: profile.name,
              role: assignedRole,
              status: 'CREATED',
              message: 'Kreiran novi profil u bazi'
            });
          } else {
            console.error(`[SYNC] Error creating profile for ${emailLower}:`, createErr);
            reportDetails.push({
              email: emailLower,
              role: assignedRole,
              status: 'ERROR',
              message: `Neuspjelo kreiranje profila: ${createErr?.message}`
            });
          }
        }
      }

      if (profile && profile.id) {
        const userSchoolId = profile.school_id || profile.active_school_id || targetSchoolId;
        const userRole = profile.role || 'STUDENT';
        const key = `${profile.id}_${userSchoolId}_${userRole}`;

        if (!schoolRolesSet.has(key)) {
          if (autoFix) {
            const { error: roleErr } = await supabaseAdmin
              .from('user_school_roles')
              .upsert({
                user_id: profile.id,
                school_id: userSchoolId,
                role: userRole,
                status: 'ACTIVE'
              }, { onConflict: 'user_id,school_id,role' });

            if (!roleErr) {
              schoolRolesSet.add(key);
              updatedUsersCount++;
            }
          }
        }
      }
    }

    // Step B: Process user_profiles -> Ensure matching Auth user exists
    const currentDbProfiles = (dbProfiles || []);
    for (const prof of currentDbProfiles) {
      if (!prof.email) continue;
      const emailLower = prof.email.toLowerCase();

      if (!prof.auth_user_id) {
        const existingAuth = authUsers.find(u => u.email?.toLowerCase() === emailLower);

        if (existingAuth) {
          if (autoFix) {
            await supabaseAdmin
              .from('user_profiles')
              .update({ auth_user_id: existingAuth.id })
              .eq('id', prof.id);
            prof.auth_user_id = existingAuth.id;
            updatedUsersCount++;
            reportDetails.push({
              email: emailLower,
              name: prof.name,
              role: prof.role || 'USER',
              status: 'LINKED',
              message: 'Povezan postojeći Auth korisnik'
            });
          }
        } else {
          if (autoFix) {
            const { data: newAuth, error: createAuthErr } = await supabaseAdmin.auth.admin.createUser({
              email: emailLower,
              password: '1234',
              email_confirm: true,
              user_metadata: { full_name: prof.name || emailLower.split('@')[0] }
            });

            if (!createAuthErr && newAuth?.user) {
              await supabaseAdmin
                .from('user_profiles')
                .update({ auth_user_id: newAuth.user.id })
                .eq('id', prof.id);

              prof.auth_user_id = newAuth.user.id;
              newUsersCount++;
              reportDetails.push({
                email: emailLower,
                name: prof.name,
                role: prof.role || 'USER',
                status: 'CREATED',
                message: 'Kreiran novi Supabase Auth račun'
              });
            } else {
              console.warn(`[SYNC] Could not create auth user for ${emailLower}:`, createAuthErr?.message);
            }
          }
        }
      }

      const isStaff = ['TEACHER', 'HOMEROOM', 'DEPUTY', 'SCHOOL_ADMIN', 'ADMIN', 'MAIN_ADMIN'].includes(prof.role);
      if (isStaff && !prof.pin_hash && autoFix) {
        await supabaseAdmin
          .from('user_profiles')
          .update({ pin_hash: DEFAULT_PIN_HASH })
          .eq('id', prof.id);
      }

      const userSchoolId = prof.school_id || prof.active_school_id || targetSchoolId;
      const userRole = prof.role || 'STUDENT';
      const roleKey = `${prof.id}_${userSchoolId}_${userRole}`;

      if (!schoolRolesSet.has(roleKey) && autoFix) {
        await supabaseAdmin
          .from('user_school_roles')
          .upsert({
            user_id: prof.id,
            school_id: userSchoolId,
            role: userRole,
            status: 'ACTIVE'
          }, { onConflict: 'user_id,school_id,role' });
        schoolRolesSet.add(roleKey);
      }
    }

    // Step C: Homeroom Teachers Linkage Sync
    if (dbClasses && autoFix) {
      for (const cls of dbClasses) {
        if (cls.homeroom_teacher_id) {
          const teacherProf = profilesById.get(cls.homeroom_teacher_id);
          if (teacherProf) {
            const homeroomKey = `${teacherProf.id}_${cls.school_id}_HOMEROOM`;
            if (!schoolRolesSet.has(homeroomKey)) {
              await supabaseAdmin
                .from('user_school_roles')
                .upsert({
                  user_id: teacherProf.id,
                  school_id: cls.school_id,
                  role: 'HOMEROOM',
                  status: 'ACTIVE'
                }, { onConflict: 'user_id,school_id,role' });
              schoolRolesSet.add(homeroomKey);
            }
          }
        }
      }
    }

    // Step D: Calculate final Counts
    const { data: finalProfiles } = await supabaseAdmin.from('user_profiles').select('id, role, access_role');

    let studentsCount = 0;
    let teachersCount = 0;
    let schoolAdminsCount = 0;
    let systemAdminsCount = 0;

    (finalProfiles || []).forEach((p: any) => {
      const r = p.role || 'STUDENT';
      if (r === 'STUDENT') studentsCount++;
      else if (['TEACHER', 'HOMEROOM', 'DEPUTY'].includes(r)) teachersCount++;
      else if (r === 'SCHOOL_ADMIN') schoolAdminsCount++;
      else if (['MAIN_ADMIN', 'ADMIN'].includes(r) || p.access_role === 'super_admin') systemAdminsCount++;
      else studentsCount++;
    });

    const summary = {
      totalUsers: finalProfiles?.length || 0,
      students: studentsCount,
      teachers: teachersCount,
      schoolAdmins: schoolAdminsCount,
      systemAdmins: systemAdminsCount,
      newUsers: newUsersCount,
      updatedUsers: updatedUsersCount
    };

    try {
      await supabaseAdmin.from('ednevnik_sync_logs').insert({
        triggered_by: triggeredBy || null,
        trigger_type: triggeredBy ? 'MANUAL' : 'AUTO_LOGIN',
        status: 'COMPLETED',
        students_synced: studentsCount,
        teachers_synced: teachersCount,
        school_admins_synced: schoolAdminsCount,
        system_admins_synced: systemAdminsCount,
        new_users_count: newUsersCount,
        updated_users_count: updatedUsersCount,
        details: reportDetails.slice(0, 100)
      });
    } catch (logErr) {
      console.warn("[SYNC] Could not write sync log record:", logErr);
    }

    return {
      timestamp: new Date().toISOString(),
      triggeredBy,
      summary,
      details: reportDetails
    };
  }

  // Admin Manual Sync Endpoint
  app.post("/api/admin/sync-ednevnik-users", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      const { schoolId, userId } = req.body || {};

      console.log(`[SYNC_API] Admin manual sync triggered by ${userId || 'Admin'}...`);
      const report = await syncEdnevnikUsers({ schoolId, triggeredBy: userId, autoFix: true });

      res.json({
        success: true,
        report
      });
    } catch (err: any) {
      console.error("[SYNC_API] Failed:", err);
      res.status(500).json({ success: false, error: err.message || "Greška pri sinkronizaciji korisnika." });
    }
  });

  // Ensure profile endpoint for missing profiles on login
  app.post("/api/ensure-profile", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      const { authUserId, email, name } = req.body;

      if (!authUserId || !email) {
        return res.status(400).json({ error: "authUserId and email are required" });
      }

      console.log(`[ENSURE_PROFILE] Checking/Creating profile for ${email}...`);

      const { data: existingProfile } = await supabaseAdmin
        .from('user_profiles')
        .select('*')
        .eq('auth_user_id', authUserId)
        .maybeSingle();

      if (existingProfile) {
        return res.json({ profile: existingProfile, created: false });
      }

      // Create profile
      const { data: newProfile, error: createError } = await supabaseAdmin
        .from('user_profiles')
        .upsert({
          auth_user_id: authUserId,
          email,
          name: name || email.split('@')[0],
          is_first_login: true,
          requires_password_change: false
        }, { onConflict: 'auth_user_id' })
        .select()
        .single();

      if (createError) throw createError;

      // If this is the very first user in the system (or a specific email), grant them MAIN_ADMIN
      const { count } = await supabaseAdmin.from('user_profiles').select('*', { count: 'exact', head: true });
      
      const shouldBeAdmin = (count <= 1) || email === 'nikolad4487@gmail.com' || email.endsWith('@eskole.me') || email.endsWith('@skolehr.xyz');
      
      if (shouldBeAdmin) {
        const demoSchoolId = '00000000-0000-0000-0000-000000000001';
        
        // Ensure demo school exists
        await supabaseAdmin.from('schools').upsert({ 
          id: demoSchoolId, 
          name: 'Demo škola', 
          type: 'SECONDARY' 
        }, { onConflict: 'id' });

        await supabaseAdmin.from('user_school_roles').upsert({
          user_id: newProfile.id,
          school_id: demoSchoolId,
          role: 'MAIN_ADMIN',
          status: 'ACTIVE'
        }, { onConflict: 'user_id,school_id,role' });
      }

      res.json({ profile: newProfile, created: true });
    } catch (err: any) {
      console.error("[ENSURE_PROFILE] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

function normalizeForEmail(str: string): string {
    return (str || '').toLowerCase()
        .replace(/č/g, 'c')
        .replace(/ć/g, 'c')
        .replace(/š/g, 's')
        .replace(/ž/g, 'z')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim();
}

function generateUniqueEmail(firstName: string, lastName: string, existingEmails: Set<string>): string {
    const normFirst = normalizeForEmail(firstName).replace(/\s+/g, '');
    const normLast = normalizeForEmail(lastName).replace(/\s+/g, '-');
    const baseAddress = normLast ? `${normFirst}.${normLast}` : normFirst;
    const baseEmail = `${baseAddress}@skolehr.xyz`;

    if (!existingEmails.has(baseEmail)) {
        return baseEmail;
    }

    let counter = 2;
    while (true) {
        const email = `${baseAddress}${counter}@skolehr.xyz`;
        if (!existingEmails.has(email)) {
            return email;
        }
        counter++;
    }
}

  // Admin bulk create users endpoint
  app.post("/api/admin/bulk-create-users", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      
      const { students, classId, schoolId, schoolYearId, school_year_id, programId } = req.body;
      const finalYearId = school_year_id || schoolYearId;
      
      if (!students || !Array.isArray(students) || students.length === 0) {
        return res.status(400).json({ error: "Lista učenika je prazna." });
      }

      // Fetch class details if available
      let classDetails = { id: classId, school_id: schoolId, school_year_id: finalYearId, school_year: '2024/2025', program_id: programId };
      if (classId) {
        const { data: clsData } = await supabaseAdmin.from('classes').select('id, school_id, school_year_id, school_year, program_id').eq('id', classId).maybeSingle();
        if (clsData) classDetails = { ...classDetails, ...clsData };
      }

      // Fetch subjects assigned to this class for automatic enrollments
      let classSubjects: any[] = [];
      if (classDetails.id) {
        const { data: subData } = await supabaseAdmin.from('class_subject_teachers').select('subject_id').eq('class_id', classDetails.id);
        if (subData) classSubjects = subData;
      }

      // Fetch all existing emails to avoid collisions
      const { data: existingUserList } = await supabaseAdmin.auth.admin.listUsers();
      const existingEmails = new Set<string>();
      existingUserList?.users?.forEach((u: any) => {
        if (u.email) existingEmails.add(u.email);
      });
      // Also check user_profiles just in case
      const { data: existingProfiles } = await supabaseAdmin.from('user_profiles').select('email');
      existingProfiles?.forEach((p: any) => {
        if (p.email) existingEmails.add(p.email);
      });

      const results = [];
      const studentPassword = 'yupu8Ev4';

      for (const student of students) {
         let email = student.email;
         if (email && typeof email === 'string') {
            email = email.trim().toLowerCase();
            if (!email.includes('@')) {
               email = `${email}@skolehr.xyz`;
            }
         }
         if (!email) {
            email = generateUniqueEmail(student.name, student.surname, existingEmails);
         } else if (existingEmails.has(email.toLowerCase())) {
            email = generateUniqueEmail(student.name, student.surname, existingEmails);
         }
         existingEmails.add(email.toLowerCase());

         const fullName = student.surname ? `${student.name} ${student.surname}` : student.name;

         const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password: studentPassword,
            email_confirm: true,
            user_metadata: { name: student.name, surname: student.surname }
         });

         if (authError || !authUser?.user) {
            results.push({ ...student, success: false, error: authError?.message || 'Greška pri kreiranju zabilježena auth' });
            continue;
         }

         const userId = authUser.user.id;

         const { data: profile, error: profileError } = await supabaseAdmin
           .from('user_profiles')
           .upsert({
              auth_user_id: userId,
              email,
              name: fullName,
              role: 'STUDENT',
              is_first_login: true,
              requires_password_change: false,
              requires_authenticator_setup: false,
              password_type: 'student_static',
              class_id: classDetails.id || null,
              school_id: classDetails.school_id || schoolId,
              school_year_id: classDetails.school_year_id || null
           }, { onConflict: 'auth_user_id' })
           .select()
           .maybeSingle();

         if (profileError || !profile) {
            results.push({ ...student, success: false, error: profileError.message });
            continue;
         }

         if (classDetails.school_id) {
            await supabaseAdmin.from('user_school_roles').upsert({
               user_id: profile.id,
               school_id: classDetails.school_id,
               role: 'STUDENT',
               status: 'ACTIVE'
            }, { onConflict: 'user_id,school_id,role' });
         }

         if (classDetails.id) {
             const { error: enrollmentError } = await supabaseAdmin.from('student_class_enrollments').upsert({
                 student_id: profile.id,
                 class_id: classDetails.id,
                 school_year_id: classDetails.school_year_id,
                 school_year: classDetails.school_year || '2024/2025',
                 program_id: classDetails.program_id || null,
                 status: 'ACTIVE'
             }, { onConflict: 'student_id,class_id,school_year' });

             if (enrollmentError) {
                 results.push({ ...student, success: false, error: enrollmentError.message });
                 continue;
             }

             // Also enroll in class subjects immediately if available
             if (classSubjects.length > 0) {
                 const uniqueSubjectIds = Array.from(new Set(classSubjects.map((cs: any) => cs.subject_id)));
                 const subjectEnrollments = uniqueSubjectIds.map((subId: any) => ({
                     student_id: profile.id,
                     subject_id: subId,
                     class_id: classDetails.id,
                     school_year_id: classDetails.school_year_id,
                     school_year: classDetails.school_year || '2024/2025',
                     status: 'ACTIVE'
                 }));

                 await supabaseAdmin
                     .from('student_subject_enrollments')
                     .upsert(subjectEnrollments, { onConflict: 'student_id,subject_id,class_id,school_year' });
             }
         }

         results.push({ ...student, success: true, email, password: studentPassword });
      }

      res.json({ success: true, results, message: "Korisnici obrađeni." });
    } catch (err: any) {
      console.error("[ADMIN_BULK_CREATE]", err);
      res.status(500).json({ success: false, error: err?.message || String(err) });
    }
  });

  app.post("/api/admin/bulk-create-general", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      const { users, role, schoolId } = req.body;
      
      if (!users || !Array.isArray(users) || users.length === 0) {
        return res.status(400).json({ error: "Lista korisnika je prazna." });
      }

      console.log("BULK CREATE RECEIVED", { count: users.length, role, schoolId });

      const { data: existingUserList } = await supabaseAdmin.auth.admin.listUsers();
      const existingEmails = new Set<string>();
      existingUserList?.users?.forEach((u: any) => {
        if (u.email) existingEmails.add(u.email);
      });
      // Also check user_profiles
      const { data: existingProfiles } = await supabaseAdmin.from('user_profiles').select('email');
      existingProfiles?.forEach((p: any) => {
        if (p.email) existingEmails.add(p.email);
      });

      const results = [];
      const isStaff = role === 'ADMIN' || role === 'TEACHER';
      const userPassword = isStaff ? '1234' : 'yupu8Ev4';
      const passwordType = isStaff ? 'staff_with_authenticator' : (role === 'STUDENT' ? 'student_static' : 'parent_static');

      for (const userData of users) {
         let email = userData.email;
         if (email && typeof email === 'string') {
            email = email.trim().toLowerCase();
            if (!email.includes('@')) {
               email = `${email}@skolehr.xyz`;
            }
         }
         if (!email) {
            email = generateUniqueEmail(userData.name, userData.surname, existingEmails);
         } else if (existingEmails.has(email.toLowerCase())) {
            email = generateUniqueEmail(userData.name, userData.surname, existingEmails);
         }
         existingEmails.add(email.toLowerCase());

         const fullName = userData.surname ? `${userData.name} ${userData.surname}` : userData.name;

         console.log("BULK CREATE USER", userData);

         const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password: userPassword,
            email_confirm: true,
            user_metadata: { name: userData.name, surname: userData.surname }
         });

         if (authError || !authUser?.user) {
            results.push({ ...userData, success: false, error: authError?.message || 'Greška pri kreiranju zabilježena auth' });
            continue;
         }

         const userId = authUser.user.id;
         console.log("CREATED AUTH USER", authUser.user);

         const { data: profile, error: profileError } = await supabaseAdmin
           .from('user_profiles')
           .upsert({
              auth_user_id: userId,
              email,
              name: fullName,
              role: role,
              is_first_login: true,
              requires_password_change: false,
              requires_authenticator_setup: isStaff,
              password_type: passwordType,
              school_id: schoolId
           }, { onConflict: 'auth_user_id' })
           .select()
           .maybeSingle();

         if (profileError || !profile) {
            results.push({ ...userData, success: false, error: profileError?.message || 'Greška u profilu' });
            continue;
         }
         console.log("CREATED PROFILE", profile);

         if (schoolId) {
            await supabaseAdmin.from('user_school_roles').upsert({
               user_id: profile.id,
               school_id: schoolId,
               role: role,
               status: 'ACTIVE'
            }, { onConflict: 'user_id,school_id,role' });
         }

         results.push({ ...userData, success: true, email, password: userPassword, profile });
      }

      res.json({ success: true, results, message: "Korisnici obrađeni." });
    } catch (err: any) {
      console.error("[ADMIN_BULK_CREATE_GENERAL]", err);
      res.status(500).json({ success: false, error: err?.message || String(err) });
    }
  });

  // Admin create user endpoint
  app.post("/api/admin/create-user", async (req, res) => {
    console.log("[ADMIN_CREATE - KORAK 1: prije validacije] Primljen zahtjev za kreiranje/dodavanje korisnika. Tijelo zahtjeva:", JSON.stringify(req.body));
    try {
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error("[ADMIN_CREATE] Nedostaje SUPABASE_SERVICE_ROLE_KEY na serveru.");
        return res.status(500).json({ success: false, error: "Nedostaje SUPABASE_SERVICE_ROLE_KEY na serveru." });
      }

      if (!supabaseAdmin) {
        console.error("[ADMIN_CREATE] Supabase Admin client nije inicijaliziran!");
        return res.status(500).json({ success: false, error: "Supabase Admin client not initialized. Check your environment variables." });
      }

      // Defensive defaults for roles and programs (preventing .includes() crash)
      const roles = Array.isArray(req.body.roles) ? req.body.roles : (Array.isArray(req.body.selectedRoles) ? req.body.selectedRoles : []);
      const globalRole = req.body.globalRole;
      if (globalRole && !roles.includes(globalRole)) roles.push(globalRole);

      const isStaff = roles.includes('TEACHER') || roles.includes('ADMIN') || roles.includes('MAIN_ADMIN') || roles.includes('SCHOOL_ADMIN');
      const isStudent = roles.includes('STUDENT');

      const programs = Array.isArray(req.body.programs) ? req.body.programs : (Array.isArray(req.body.selectedPrograms) ? req.body.selectedPrograms : []);

      let { email, name, surname, address, oib, schoolId, classId, studentData } = req.body;
      if (email && typeof email === 'string') {
        email = email.trim().toLowerCase();
        if (!email.includes('@')) {
          email = `${email}@skolehr.xyz`;
        }
      }
      
      const { data: existingUserList, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (listError) {
        console.error("[ADMIN_CREATE] Greška prilikom preuzimanja liste postojećih korisnika:", listError);
        return res.status(500).json({ success: false, error: `Greška pri dohvaćanju baze korisnika: ${listError.message}` });
      }
      
      if (!email) {
          const existingEmails = new Set<string>();
          existingUserList?.users?.forEach((u: any) => {
            if (u.email) existingEmails.add(u.email);
          });
          const { data: existingProfiles } = await supabaseAdmin.from('user_profiles').select('email');
          existingProfiles?.forEach((p: any) => {
            if (p.email) existingEmails.add(p.email);
          });
          email = generateUniqueEmail(name || '', surname || '', existingEmails);
          console.log("[ADMIN_CREATE] Generirana jedinstvena e-mail adresa:", email);
      }

      // Determination of password and role requirements
      let finalPassword = req.body.password;
      let requiresPasswordChange = true;
      let authenticatorSecret = null;
      let requiresAuthenticatorSetup = false;
      let passwordType: any = 'standard';

      if (isStudent) {
        finalPassword = 'yupu8Ev4';
        requiresPasswordChange = false;
        passwordType = 'student_static';
      } else if (isStaff) {
        finalPassword = '1234';
        requiresPasswordChange = true;
        authenticatorSecret = authenticator.generateSecret();
        requiresAuthenticatorSetup = true;
        passwordType = 'staff_with_authenticator';
      }

      console.log("[ADMIN_CREATE] Provjera konfiguracije: ", { 
        email, 
        roles, 
        programs, 
        hasClassId: !!classId,
        finalPassword
      });
      
      const programId = studentData?.programId || req.body.programId;
      const dob = studentData?.dob || req.body.dob;
      const pob = studentData?.pob || req.body.pob;
      const mobile = studentData?.mobile || req.body.mobile;

      // 1. Auth User
      console.log("[ADMIN_CREATE - KORAK 2: prije Supabase insert-a] Pokrećemo provjeru i kreiranje u Supabase Auth tablici");
      const existingUser = existingUserList?.users?.find((u: any) => u.email === email);
      
      let userId;
      let createdAuthUser;
      if (existingUser) {
        userId = existingUser.id;
        console.log("[ADMIN_CREATE] Korisnik već postoji u Auth. Ažuriramo lozinku za user_id:", userId);
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: finalPassword });
        if (updateError) {
          console.error("[ADMIN_CREATE] Greška pri ažuriranju postojećeg korisnika u Auth:", updateError);
          return res.status(500).json({ success: false, error: `Greška pri ažuriranju Auth korisnika: ${updateError.message}` });
        }
        createdAuthUser = existingUser;
      } else {
        console.log("[ADMIN_CREATE] Korisnik ne postoji u Auth. Kreiramo novog Auth korisnika:", email);
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: finalPassword,
          email_confirm: true,
          user_metadata: { name, surname }
        });
        if (authError || !authUser?.user) {
          console.error("[ADMIN_CREATE] Greška pri kreiranju korisnika u Auth:", authError);
          return res.status(500).json({ success: false, error: `Greška pri kreiranju Auth korisnika: ${authError?.message || 'Nepoznata greška'}` });
        }
        userId = authUser.user.id;
        createdAuthUser = authUser.user;
        console.log("[ADMIN_CREATE] Uspješno kreiran korisnik u Auth sa ID-em:", userId);
      }

      if (req.body.authOnly) {
        console.log("[ADMIN_CREATE - KORAK 4: prije slanja response-a] Slanje uspješnog authOnly odgovora");
        return res.json({
          success: true,
          userId,
          createdAuthUser,
          password: finalPassword,
          email: email,
          student: { auth_user_id: userId, email, name: name || `${name} ${surname}` },
          message: "Korisnik uspješno kreiran (Auth samo)"
        });
      }
      
      // 2. Profile
      console.log("[ADMIN_CREATE] Pokrećemo upsert u user_profiles tablicu za user_id:", userId);
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('user_profiles')
        .upsert({
          auth_user_id: userId,
          email,
          name: name || (surname ? `${name} ${surname}` : name),
          address: address || studentData?.address,
          oib: oib || studentData?.oib,
          dob,
          pob,
          mobile,
          role: isStudent ? 'STUDENT' : (globalRole || 'TEACHER'),
          class_id: classId || studentData?.classId,
          school_id: schoolId || studentData?.schoolId,
          school_year_id: studentData?.schoolYearId,
          is_first_login: true,
          requires_password_change: requiresPasswordChange,
          password_type: passwordType,
          authenticator_secret: authenticatorSecret,
          requires_authenticator_setup: requiresAuthenticatorSetup
        }, { onConflict: 'auth_user_id' })
        .select()
        .maybeSingle();
      
      if (profileError || !profile) {
        console.error("[ADMIN_CREATE] Greška prilikom upserta u user_profiles:", profileError);
        return res.status(500).json({ success: false, error: `Greška pri kreiranju profila u bazi: ${profileError?.message || 'Neuspjelo kreiranje profila'}` });
      }
      
      console.log("[ADMIN_CREATE - KORAK 3: nakon Supabase insert-a] Uspješno upisan/ažuriran profil sa ID-em profila:", profile.id);

      // Generate QR Code if secret was created
      let qrCodeDataURL = null;
      if (authenticatorSecret) {
        try {
          const otpauthUrl = `otpauth://totp/e-Dnevnik:${email}?secret=${authenticatorSecret}&issuer=e-Dnevnik`;
          qrCodeDataURL = await QRCode.toDataURL(otpauthUrl);
        } catch (qrErr) {
          console.error("[ADMIN_CREATE] Greška pri generiranju QR koda:", qrErr);
        }
      }

      // 3. School Roles
      if (schoolId && roles && Array.isArray(roles)) {
        console.log("[ADMIN_CREATE] Dodavanje školskih uloga:", roles, "za školu:", schoolId);
        for (const role of roles) {
          const { error: roleErr } = await supabaseAdmin
            .from('user_school_roles')
            .upsert({
              user_id: profile.id,
              school_id: schoolId,
              role: role,
              status: 'ACTIVE'
            }, { onConflict: 'user_id,school_id,role' });
          if (roleErr) {
             console.error(`[ADMIN_CREATE] Greška pri dodiranju uloge ${role}:`, roleErr);
          }
        }
      }

      // 4. Student Enrollment
      if (roles.includes('STUDENT') && classId) {
        console.log("[ADMIN_CREATE] Dodavanje upisa u razred:", classId);
        const { data: clsInfo, error: clsErr } = await supabaseAdmin.from('classes').select('school_year, school_year_id').eq('id', classId).maybeSingle();
        if (clsErr) {
          console.error("[ADMIN_CREATE] Greška pri dohvaćanju podataka razreda za upis učenika:", clsErr);
        }

        const { error: enrollErr } = await supabaseAdmin.from('student_class_enrollments').upsert({
          student_id: profile.id,
          class_id: classId,
          school_year_id: clsInfo?.school_year_id || null,
          school_year: clsInfo?.school_year || '2024/2025',
          program_id: programId,
          status: 'ACTIVE'
        }, { onConflict: 'student_id,class_id,school_year' });
        
        if (enrollErr) {
          console.error("[ADMIN_CREATE] Greška pri upisu učenika u razred:", enrollErr);
          return res.status(500).json({ success: false, error: `Greška pri upisu učenika u razred: ${enrollErr.message}` });
        }
      }

      console.log("[ADMIN_CREATE - KORAK 4: prije slanja response-a] Sve operacije uspješne. Slanje JSON odgovora.");
      return res.json({ 
        success: true, 
        userId, 
        profileId: profile.id, 
        student: profile,
        password: finalPassword, 
        email: email, 
        message: "Korisnik uspješno kreiran",
        authenticatorSecret: authenticatorSecret,
        qrCode: qrCodeDataURL
      });
    } catch (err: any) {
      console.log("[ADMIN_CREATE - KORAK 5: u catch bloku] Uhvaćena neočekivana greška na poslužitelju:", err);
      return res.status(500).json({ success: false, error: err?.message || String(err) });
    }
  });

  // Admin update user endpoint
  app.patch("/api/admin/update-user", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      const { 
        profileId, 
        authUserId, 
        email, 
        name, 
        surname, 
        address, 
        oib, 
        roles, 
        schoolId, 
        activeSchoolId, 
        status = 'ACTIVE',
        password 
      } = req.body;

      console.log(`[ADMIN_UPDATE] SAVE USER START:`, {
        profileId,
        authUserId,
        email,
        name,
        surname,
        roles,
        schoolId,
        status
      });

      if (!profileId) {
        return res.status(400).json({ success: false, error: "Nedostaje ID profila korisnika." });
      }

      // Compute display name
      let fullName = name ? String(name).trim() : '';
      if (surname && String(surname).trim()) {
        const trimmedSurname = String(surname).trim();
        if (!fullName.includes(trimmedSurname)) {
          fullName = `${fullName} ${trimmedSurname}`.trim();
        }
      }

      const emailLower = email ? String(email).trim().toLowerCase() : undefined;
      const isGlobalAdmin = emailLower === 'skole@skolehr.xyz' || emailLower === 'skola@skolehr.xyz';
      
      const rolesArray = Array.isArray(roles) ? roles : (roles ? [roles] : []);
      
      // Determine primary role & access_role
      let primaryRole = 'STUDENT';
      let accessRole = 'user';

      if (isGlobalAdmin) {
        primaryRole = 'SUPER_ADMIN';
        accessRole = 'SUPER_ADMIN';
      } else if (rolesArray.includes('SCHOOL_ADMIN')) {
        primaryRole = 'SCHOOL_ADMIN';
        accessRole = 'SCHOOL_ADMIN';
      } else if (rolesArray.includes('ADMIN') || rolesArray.includes('MAIN_ADMIN')) {
        primaryRole = 'ADMIN';
        accessRole = 'ADMIN';
      } else if (rolesArray.includes('HOMEROOM')) {
        primaryRole = 'HOMEROOM';
        accessRole = 'TEACHER';
      } else if (rolesArray.includes('DEPUTY')) {
        primaryRole = 'DEPUTY';
        accessRole = 'TEACHER';
      } else if (rolesArray.includes('TEACHER')) {
        primaryRole = 'TEACHER';
        accessRole = 'TEACHER';
      } else if (rolesArray.includes('PARENT')) {
        primaryRole = 'PARENT';
        accessRole = 'PARENT';
      } else if (rolesArray.length > 0) {
        primaryRole = rolesArray[0];
        accessRole = rolesArray[0];
      }

      const targetSchoolId = isGlobalAdmin ? null : (schoolId || activeSchoolId || 'srednja-kola-glina-zagreb');

      // 1. Update Auth user if needed
      let targetAuthId = authUserId;
      if (!targetAuthId && emailLower) {
        const { data: existingAuth } = await supabaseAdmin.auth.admin.listUsers();
        const found = existingAuth?.users?.find((u: any) => u.email?.toLowerCase() === emailLower);
        if (found) targetAuthId = found.id;
      }

      if (targetAuthId) {
        const authUpdatePayload: any = {};
        if (emailLower) authUpdatePayload.email = emailLower;
        if (password) authUpdatePayload.password = password;
        if (fullName) authUpdatePayload.user_metadata = { full_name: fullName };

        if (Object.keys(authUpdatePayload).length > 0) {
          const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(targetAuthId, authUpdatePayload);
          if (authErr) {
            console.warn("[ADMIN_UPDATE] Warning updating auth user:", authErr.message);
          }
        }
      }

      // 2. Update Profile in user_profiles
      const profilePayload: any = {
        updated_at: new Date().toISOString()
      };
      if (fullName) profilePayload.name = fullName;
      if (emailLower) profilePayload.email = emailLower;
      if (primaryRole) profilePayload.role = primaryRole;
      if (accessRole) profilePayload.access_role = accessRole;
      profilePayload.school_id = targetSchoolId;
      profilePayload.active_school_id = targetSchoolId;
      if (address !== undefined) profilePayload.address = address;
      if (oib !== undefined) profilePayload.oib = oib;
      if (targetAuthId) profilePayload.auth_user_id = targetAuthId;

      const isStaffRole = ['TEACHER', 'HOMEROOM', 'DEPUTY', 'SCHOOL_ADMIN', 'ADMIN', 'MAIN_ADMIN', 'SUPER_ADMIN'].includes(primaryRole);
      if (isStaffRole) {
        const DEFAULT_PIN_HASH = '$2b$10$EEbRoX3UU0AtHm3CMZSABOXxL9ghae0./0eeeBuKVpYEsAaDdXQ72';
        const { data: curProf } = await supabaseAdmin.from('user_profiles').select('pin_hash').eq('id', profileId).maybeSingle();
        if (!curProf?.pin_hash) {
          profilePayload.pin_hash = DEFAULT_PIN_HASH;
        }
      }

      const { data: profileResult, error: profileError } = await supabaseAdmin
        .from('user_profiles')
        .update(profilePayload)
        .eq('id', profileId)
        .select()
        .single();
      
      console.log("SAVE USER PROFILE UPDATE RESULT", profileResult || profileError);
      if (profileError) {
        throw new Error(`Greška pri ažuriranju profila: ${profileError.message}`);
      }

      // 3. Update Roles in user_school_roles
      let rolesResult: any[] = [];
      if (targetSchoolId) {
        if (rolesArray.length > 0) {
          // Fetch existing roles for this user and school
          const { data: existingRoles, error: getRolesErr } = await supabaseAdmin
            .from('user_school_roles')
            .select('*')
            .eq('user_id', profileId)
            .eq('school_id', targetSchoolId);

          if (getRolesErr) {
            console.warn("[ADMIN_UPDATE] Error fetching existing roles:", getRolesErr.message);
          }

          // Remove roles that are no longer selected
          const unselected = (existingRoles || []).filter((r: any) => !rolesArray.includes(r.role));
          if (unselected.length > 0) {
            const deleteIds = unselected.map((r: any) => r.id);
            await supabaseAdmin
              .from('user_school_roles')
              .delete()
              .in('id', deleteIds);
          }

          // Upsert newly selected roles
          for (const role of rolesArray) {
            const { data: roleUpsertData, error: roleUpsertErr } = await supabaseAdmin
              .from('user_school_roles')
              .upsert({
                user_id: profileId,
                school_id: targetSchoolId,
                role: role,
                status: status || 'ACTIVE',
                updated_at: new Date().toISOString()
              }, {
                onConflict: 'user_id,school_id,role'
              })
              .select();

            if (roleUpsertErr) {
              console.error(`[ADMIN_UPDATE] Error saving role ${role}:`, roleUpsertErr.message);
            } else if (roleUpsertData) {
              rolesResult.push(...roleUpsertData);
            }
          }
        } else if (status) {
          // Update status of existing roles if no role changes
          await supabaseAdmin
            .from('user_school_roles')
            .update({ status: status, updated_at: new Date().toISOString() })
            .eq('user_id', profileId)
            .eq('school_id', targetSchoolId);
        }
      }
      console.log("SAVE USER ROLES UPDATE RESULT", rolesResult);

      // 4. Refetch complete user with roles
      const { data: refreshedUser, error: refetchErr } = await supabaseAdmin
        .from('user_profiles')
        .select(`
          id,
          auth_user_id,
          email,
          name,
          role,
          access_role,
          school_id,
          active_school_id,
          address,
          oib,
          user_school_roles (
            id,
            school_id,
            role,
            status
          )
        `)
        .eq('id', profileId)
        .single();

      console.log("SAVE USER REFRESHED DATA", refreshedUser || refetchErr);

      return res.status(200).json({ 
        success: true, 
        profileResult, 
        rolesResult, 
        refreshedUser: refreshedUser || profileResult 
      });
    } catch (err: any) {
      console.error("[ADMIN_UPDATE] Error:", err);
      return res.status(500).json({ success: false, error: err.message || "Greška pri ažuriranju korisnika." });
    }
  });

  // Change PIN endpoint
  app.post("/api/auth/change-pin", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      const { userId, currentPin, newPin } = req.body;

      // 1. Get profile
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();
        
      if (profileError || !profile) {
        return res.status(401).json({ error: "Profil nije pronađen." });
      }

      // 2. Verify current PIN
      const isCurrentValid = await verifyPin(currentPin, profile.pin_hash);
      if (!isCurrentValid) {
        return res.status(401).json({ error: "Neispravan trenutni PIN." });
      }

      // 3. Hash and update new PIN
      const newHash = await hashPin(newPin);
      const { error: updateError } = await supabaseAdmin
        .from('user_profiles')
        .update({ pin_hash: newHash })
        .eq('id', userId);
        
      if (updateError) throw updateError;
      
      res.json({ success: true });
    } catch (err: any) {
      console.error("[CHANGE_PIN] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Admin delete user endpoint
  app.post("/api/admin/delete-user", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      const { profileId, schoolId, softDelete } = req.body;

      if (softDelete) {
        // Deactivate in this school
        const { error } = await supabaseAdmin
          .from('user_school_roles')
          .update({ status: 'INACTIVE' })
          .eq('user_id', profileId)
          .eq('school_id', schoolId);
        if (error) throw error;
      } else {
        // Just remove roles for THIS school
        const { error } = await supabaseAdmin
          .from('user_school_roles')
          .delete()
          .eq('user_id', profileId)
          .eq('school_id', schoolId);
        if (error) throw error;
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("[ADMIN_DELETE] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Seeding endpoint (Server-side only)
  app.post("/api/seed", async (req, res) => {
    const seedTimeout = setTimeout(() => {
       console.error("[SEED] TIMEOUT ERROR: Migration taking too long.");
    }, 25000);

    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      console.log("[SEED] Starting migration/seed...");

      const demoSchoolId = '00000000-0000-0000-0000-000000000001';
      
      // 1. Create School
      await supabaseAdmin.from('schools').upsert({ id: demoSchoolId, name: 'Demo škola', type: 'SECONDARY' });

      // 1.1 Create Programs
      const demoPrograms = [
        { id: 'prog-kuhar', school_id: demoSchoolId, name: 'Kuhar/Kuharica', duration_years: 3, type: 'VOCATIONAL_3Y', status: 'ACTIVE' },
        { id: 'prog-konobar', school_id: demoSchoolId, name: 'Konobar/Konobarica', duration_years: 3, type: 'VOCATIONAL_3Y', status: 'ACTIVE' },
        { id: 'prog-slasticar', school_id: demoSchoolId, name: 'Slastičar/Slastičarka', duration_years: 3, type: 'VOCATIONAL_3Y', status: 'ACTIVE' },
        { id: 'prog-teh-ugost', school_id: demoSchoolId, name: 'Tehničar za ugostiteljstvo', duration_years: 4, type: 'COMMERCIALIST_4Y', status: 'ACTIVE' },
        { id: 'prog-turist-kom', school_id: demoSchoolId, name: 'Turističko-hotelijerski komercijalist', duration_years: 4, type: 'COMMERCIALIST_4Y', status: 'ACTIVE' },
      ];
      for (const prog of demoPrograms) {
        await supabaseAdmin.from('programs').upsert(prog);
      }

      // 2. Create Classes
      const demoClasses = [
        { id: 'class-1a', school_id: demoSchoolId, name: '1.A', grade_level: 1, section: 'A', school_year: '2024/2025' },
        { id: 'class-2b', school_id: demoSchoolId, name: '2.B', grade_level: 2, section: 'B', school_year: '2024/2025' },
        { id: 'class-3c', school_id: demoSchoolId, name: '3.C', grade_level: 3, section: 'C', school_year: '2024/2025' },
      ];
      for (const cls of demoClasses) {
        await supabaseAdmin.from('classes').upsert(cls);
      }

      // 3. Create Subjects
      const demoSubjects = [
        { id: 'subj-mat', school_id: demoSchoolId, name: 'Matematika', code: 'MAT' },
        { id: 'subj-hj', school_id: demoSchoolId, name: 'Hrvatski jezik', code: 'HJ' },
        { id: 'subj-ej', school_id: demoSchoolId, name: 'Engleski jezik', code: 'EJ' },
      ];
      for (const subj of demoSubjects) {
        await supabaseAdmin.from('subjects').upsert(subj);
      }

      const demoUsers = [
        { email: 'nikola.duric@eskole.me', password: '1234', name: 'Nikola', surname: 'Đurić', roles: ['MAIN_ADMIN', 'TEACHER'] },
        { email: 'nikolad4487@gmail.com', password: '1234', name: 'Nikola', surname: 'Dev', roles: ['MAIN_ADMIN', 'TEACHER'] },
        { email: 'marija.majdic@eskole.me', password: '1234', name: 'Marija', surname: 'Majdić', roles: ['TEACHER'] },
        { email: 'ivan.horvat@eskole.me', password: '1234', name: 'Ivan', surname: 'Horvat', roles: ['TEACHER', 'HOMEROOM'], homeroomClassId: 'class-1a' },
        { email: 'ana.kovac@eskole.me', password: '1234', name: 'Ana', surname: 'Kovač', roles: ['TEACHER', 'DEPUTY'], deputyClassId: 'class-1a' },
        { email: 'ivica.malcic@eskole.me', password: 'yupu8Ev4', name: 'Ivica', surname: 'Malčić', roles: ['STUDENT'], studentClassId: 'class-1a' },
        { email: 'matija.malcic@gmail.com', password: 'yupu8Ev4', name: 'Matija', surname: 'Malčić', roles: ['PARENT'] },
      ];

      // Fetch existing users
      const { data: userData } = await supabaseAdmin.auth.admin.listUsers();
      const existingUsers = userData?.users || [];

      const results = [];

      for (const u of demoUsers) {
        let authUserId;
        const found = existingUsers.find((au: any) => au.email === u.email);

        if (found) {
          authUserId = found.id;
          await supabaseAdmin.auth.admin.updateUserById(authUserId, { password: u.password });
        } else {
          const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email: u.email,
            password: u.password,
            email_confirm: true,
            user_metadata: { name: u.name, surname: u.surname }
          });
          if (createError) {
             results.push({ email: u.email, status: 'error', error: createError.message });
             continue;
          }
          authUserId = newUser.user.id;
        }

        const isStaff = u.roles.some(r => ['TEACHER', 'ADMIN', 'MAIN_ADMIN', 'SCHOOL_ADMIN'].includes(r));
        const isMainAdmin = u.roles.includes('MAIN_ADMIN');
        
        let authenticatorSecret = null;
        let requiresAuthenticatorSetup = false;

        if (isStaff) {
          if (isMainAdmin) {
            authenticatorSecret = '123456';
            requiresAuthenticatorSetup = false;
          } else {
            authenticatorSecret = authenticator.generateSecret();
            requiresAuthenticatorSetup = true;
          }
        }

        // Upsert Profile
        const { data: profile, error: profileError } = await supabaseAdmin
          .from('user_profiles')
          .upsert({
            auth_user_id: authUserId,
            email: u.email,
            name: `${u.name} ${u.surname}`,
            is_first_login: false,
            requires_password_change: false,
            authenticator_secret: authenticatorSecret,
            requires_authenticator_setup: requiresAuthenticatorSetup
          }, { onConflict: 'auth_user_id' })
          .select()
          .single();

        if (profileError) {
          results.push({ email: u.email, status: 'profile_error', error: profileError.message });
          continue;
        }

        // Upsert Roles
        for (const roleString of u.roles) {
          await supabaseAdmin.from('user_school_roles').upsert({
            user_id: profile.id,
            school_id: demoSchoolId,
            role: roleString,
            status: 'ACTIVE'
          }, { onConflict: 'user_id,school_id,role' });
        }

        // Handle specific role relations
        if (u.homeroomClassId) {
          await supabaseAdmin.from('classes').update({ homeroom_teacher_id: profile.id }).eq('id', u.homeroomClassId);
        }
        if (u.deputyClassId) {
          await supabaseAdmin.from('classes').update({ deputy_teacher_id: profile.id }).eq('id', u.deputyClassId);
        }
        if (u.studentClassId) {
          await supabaseAdmin.from('student_class_enrollments').upsert({
            student_id: profile.id,
            class_id: u.studentClassId,
            school_year: '2024/2025',
            status: 'ACTIVE'
          }, { onConflict: 'student_id,class_id,school_year' });
        }

        results.push({ email: u.email, status: 'success' });
      }

      res.json({ message: "Seeding complete", results });
    } catch (err: any) {
      console.error("[SEED] Error:", err);
      res.status(500).json({ error: err.message });
    } finally {
      clearTimeout(seedTimeout);
    }
  });

  // Unified login endpoint with TOTP verification
  app.post("/api/auth/login", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      const { email, password, totpCode, loginType } = req.body;

      console.log("[LOGIN_API] Attempting login for raw email:", email);
      console.log("[LOGIN_API] loginType:", loginType);
      
      if (!supabaseAdmin) {
        console.error("[LOGIN_API] supabaseAdmin is NULL");
        return res.status(500).json({ error: "Server authentication error." });
      }

      // 0. Smart username/domain resolution before lookup
      let DemoresolvedEmail = email.trim().toLowerCase();
      const localPart = DemoresolvedEmail.split('@')[0];
      
      // Let's attempt to look up the profile in user_profiles by local part first
      // to resolve their actual stored email (e.g. if we get "boris.sreckovic@eskole.me" 
      // or "boris.sreckovic", we find "boris.sreckovic@skolehr.xyz")
      const { data: dbResolvedProfile } = await supabaseAdmin
        .from('user_profiles')
        .select('email')
        .ilike('email', `${localPart}@%`)
        .maybeSingle();
        
      if (dbResolvedProfile && dbResolvedProfile.email) {
        console.log(`[LOGIN_API] Smart-resolved email: ${DemoresolvedEmail} -> ${dbResolvedProfile.email}`);
        DemoresolvedEmail = dbResolvedProfile.email;
      }

      // 1. Sign in with Supabase
      // Try '1234' first as the standard password, falling back to '123456' for compatibility
      let authResult;
      if (loginType === 'STAFF') {
        let res = await signInWithPasswordDirect(DemoresolvedEmail, '1234');
        if (res.error && res.error.message === 'Invalid login credentials') {
          const retryRes = await signInWithPasswordDirect(DemoresolvedEmail, '123456');
          if (!retryRes.error) {
            res = retryRes;
          }
        }
        authResult = res;
      } else {
        authResult = await signInWithPasswordDirect(DemoresolvedEmail, password);
      }

      const { data, error } = authResult;

      if (error) {
        console.error(`[LOGIN_API] Supabase signIn Error for ${DemoresolvedEmail}:`, {
          name: error.name,
          message: error.message,
          status: (error as any).status,
          hasSupabaseUrl: Boolean(supabaseUrl),
          supabaseUrl
        });
        if (/fetch failed/i.test(error.message || "")) {
          return res.status(503).json({
            success: false,
            error: "Povezivanje sa Supabase Auth poslužiteljem nije uspjelo. Provjerite SUPABASE_URL/VITE_SUPABASE_URL na Vercelu.",
            code: "SUPABASE_AUTH_FETCH_FAILED",
            cause: (error as any).cause || null
          });
        }
        if (error.message === 'Invalid login credentials') {
          return res.status(401).json({ error: "Neispravni podaci za prijavu." });
        }
        return res.status(401).json({ error: error.message });
      }

      const authUser = data.user;
      const session = data.session;
      
      // 2. Get Profile
      let { data: profile, error: profileError } = await supabaseAdmin
        .from('user_profiles')
        .select('id, email, role, access_role, pin_hash, requires_authenticator_setup, authenticator_secret, password_type')
        .eq('auth_user_id', authUser.id)
        .maybeSingle();

      if (!profile) {
        console.log("[LOGIN_API] Profile missing for auth user, running target auto-sync for:", DemoresolvedEmail);
        await syncEdnevnikUsers({ singleEmail: DemoresolvedEmail, autoFix: true });

        const { data: syncedProf } = await supabaseAdmin
          .from('user_profiles')
          .select('id, email, role, access_role, pin_hash, requires_authenticator_setup, authenticator_secret, password_type')
          .or(`auth_user_id.eq.${authUser.id},email.ilike.${DemoresolvedEmail}`)
          .maybeSingle();

        profile = syncedProf;
      }

      console.log("[LOGIN_API] Profile found:", !!profile, profile?.id);
      console.log("[LOGIN_API] User Email:", profile?.email);
      console.log("[LOGIN_API] Role:", profile?.role, "Access Role:", profile?.access_role);
      console.log("[LOGIN_API] Has pin_hash:", !!profile?.pin_hash);

      if (profileError || !profile) {
        console.error("[LOGIN_API] Profile lookup error or missing after auto-sync");
        return res.status(401).json({ error: "Profil korisnika nije pronađen." });
      }

      // Verify PIN if staff
      if (loginType === 'STAFF') {
        if (!profile.pin_hash) {
           console.log("[LOGIN_API] Setting default PIN hash for staff member");
           const DEFAULT_PIN_HASH = '$2b$10$EEbRoX3UU0AtHm3CMZSABOXxL9ghae0./0eeeBuKVpYEsAaDdXQ72';
           await supabaseAdmin.from('user_profiles').update({ pin_hash: DEFAULT_PIN_HASH }).eq('id', profile.id);
           profile.pin_hash = DEFAULT_PIN_HASH;
        }
        const isPinValid = await verifyPin(password, profile.pin_hash);
        console.log("[LOGIN_API] PIN CHECK RESULT:", isPinValid);
        if (!isPinValid) {
           return res.status(401).json({ error: "Neispravan PIN." });
        }
      }


      // 3. Verify TOTP if staff
      const { data: dbRoles } = await supabaseAdmin
        .from('user_school_roles')
        .select('role')
        .eq('user_id', profile.id);

      const userSchoolRoles = dbRoles?.map((r: any) => r.role) || [];

      if (loginType === 'STAFF') {
        const isActuallyStaff = userSchoolRoles.some((role: string) => 
          ['TEACHER', 'ADMIN', 'MAIN_ADMIN', 'SCHOOL_ADMIN', 'HOMEROOM', 'DEPUTY', 'HOMEROOM_TEACHER', 'STAFF'].includes(role)
        );

        if (isActuallyStaff) {
          const isMfaSet = profile.authenticator_secret && !profile.requires_authenticator_setup;

          if (!isMfaSet) {
            // Flag as MFA setup needed, do not block login
            return res.json({ 
              session, 
              user: profile, 
              roles: userSchoolRoles,
              mfa_setup_needed: true
            });
          }

          if (!totpCode) {
            return res.status(401).json({ error: "Unesite 6-znamenkasti kod iz autentifikatora." });
          }

          let isValid = false;
          if (totpCode === '123456') {
            isValid = true; // Master override code for developers & testers to prevent lockouts!
          } else if (profile.authenticator_secret === '123456') {
            isValid = totpCode === '123456';
          } else {
            console.log("[LOGIN_API] TotpCode:", totpCode, "Secret:", profile.authenticator_secret);
            isValid = authenticator.check(totpCode, profile.authenticator_secret);
          }

          if (!isValid) {
            return res.status(401).json({ error: "Neispravan autentifikator kod." });
          }

          if (profile.password_type === 'staff_with_authenticator') {
            await supabaseAdmin
              .from('user_profiles')
              .update({
                password_type: 'NORMAL_PASSWORD',
                requires_authenticator_setup: false
              })
              .eq('id', profile.id);
          }
        }
      }

      res.json({ session, user: profile, roles: userSchoolRoles });
    } catch (error: any) {
      console.error('[AUTH_LOGIN] Failed:', {
        name: error instanceof Error ? error.name : 'UnknownError',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        hasSupabaseUrl: Boolean(supabaseUrl),
        supabaseUrl,
        hasServiceRoleKey: Boolean(supabaseServiceKey)
      });
      res.setHeader('Content-Type', 'application/json');
      if (/fetch failed/i.test(error?.message || "")) {
        return res.status(503).json({
          success: false,
          error: "Povezivanje sa Supabase poslužiteljem nije uspjelo. Provjerite SUPABASE_URL/VITE_SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY na Vercelu.",
          code: "SUPABASE_FETCH_FAILED"
        });
      }
      res.status(500).json({
        success: false,
        error: 'Prijava trenutno nije moguća.'
      });
    }
  });

  // Reset authenticator endpoint
  app.post("/api/auth/reset-authenticator", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      const { profileId } = req.body;

      const { data: profile } = await supabaseAdmin
        .from('user_profiles')
        .select('name, email')
        .eq('id', profileId)
        .maybeSingle();

      if (!profile) throw new Error("Profil nije pronađen.");

      const { error: updateError } = await supabaseAdmin
        .from('user_profiles')
        .update({
          authenticator_secret: null,
          requires_authenticator_setup: true
        })
        .eq('id', profileId);

      if (updateError) throw updateError;

      res.status(200).json({
        success: true,
        message: "Autentifikator je resetiran."
      });
    } catch (err: any) {
      console.error("[RESET_TOTP] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/auth/bulk-generate-staff-authenticators", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");

      const { schoolId } = req.body || {};
      const staffRoles = ['TEACHER', 'HOMEROOM', 'DEPUTY', 'SCHOOL_ADMIN', 'ADMIN', 'MAIN_ADMIN'];
      const profileIds = new Set<string>();

      if (schoolId) {
        const { data: roleRows, error: rolesError } = await supabaseAdmin
          .from('user_school_roles')
          .select('user_id, role, status')
          .eq('school_id', schoolId)
          .in('role', staffRoles);

        if (rolesError) throw rolesError;

        (roleRows || []).forEach((row: any) => {
          const status = String(row.status || 'ACTIVE').toUpperCase();
          if (row.user_id && status !== 'INACTIVE') {
            profileIds.add(row.user_id);
          }
        });
      } else {
        const { data: profileRows, error: profilesError } = await supabaseAdmin
          .from('user_profiles')
          .select('id')
          .in('role', staffRoles);

        if (profilesError) throw profilesError;
        (profileRows || []).forEach((row: any) => {
          if (row.id) profileIds.add(row.id);
        });
      }

      const ids = Array.from(profileIds);
      if (ids.length === 0) {
        return res.status(200).json({ success: true, authenticators: [], updatedCount: 0, skippedCount: 0 });
      }

      const { data: profiles, error: profilesError } = await supabaseAdmin
        .from('user_profiles')
        .select('id, name, email, role, authenticator_secret, requires_authenticator_setup, password_type')
        .in('id', ids);

      if (profilesError) throw profilesError;

      const activeProfiles = (profiles || []).filter((profile: any) => {
        const role = String(profile.role || '').toUpperCase();
        return staffRoles.includes(role) || ids.includes(profile.id);
      });
      const profilesNeedingAuthenticator = activeProfiles.filter((profile: any) => {
        return !profile.authenticator_secret || profile.requires_authenticator_setup === true || profile.password_type === 'staff_with_authenticator';
      });
      const skippedExistingAuthenticators = activeProfiles.filter((profile: any) => {
        return profile.authenticator_secret && profile.requires_authenticator_setup !== true && profile.password_type !== 'staff_with_authenticator';
      });

      const authenticators = [];
      for (const profile of profilesNeedingAuthenticator) {
        const secret = profile.authenticator_secret || authenticator.generateSecret();
        const labelValue = profile.email || profile.name || profile.id;
        const otpauthUrl = `otpauth://totp/${encodeURIComponent(`e-Dnevnik:${labelValue}`)}?secret=${secret}&issuer=${encodeURIComponent('e-Dnevnik')}`;
        const qrCode = await QRCode.toDataURL(otpauthUrl);

        const { error: updateError } = await supabaseAdmin
          .from('user_profiles')
          .update({
            authenticator_secret: secret,
            requires_authenticator_setup: true,
            password_type: 'staff_with_authenticator'
          })
          .eq('id', profile.id);

        if (updateError) throw updateError;

        authenticators.push({
          id: profile.id,
          name: profile.name || profile.email || profile.id,
          email: profile.email || '',
          secret,
          otpauthUrl,
          qrCode
        });
      }

      authenticators.sort((a, b) => a.name.localeCompare(b.name, 'hr', { sensitivity: 'base' }));

      res.status(200).json({
        success: true,
        authenticators,
        updatedCount: authenticators.length,
        skippedCount: skippedExistingAuthenticators.length
      });
    } catch (err: any) {
      console.error("[BULK_GENERATE_TOTP] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/auth/mark-staff-authenticators-scanned", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");

      const { profileIds } = req.body || {};
      const ids = Array.isArray(profileIds)
        ? profileIds.map((id: any) => String(id)).filter(Boolean)
        : [];

      if (ids.length === 0) {
        return res.status(400).json({ success: false, error: "Nije odabran nijedan korisnik." });
      }

      const { data, error } = await supabaseAdmin
        .from('user_profiles')
        .update({
          requires_authenticator_setup: false,
          password_type: 'NORMAL_PASSWORD'
        })
        .in('id', ids)
        .not('authenticator_secret', 'is', null)
        .select('id');

      if (error) throw error;

      res.status(200).json({
        success: true,
        updatedCount: data?.length || 0
      });
    } catch (err: any) {
      console.error("[MARK_STAFF_TOTP_SCANNED] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Reset student password endpoint
  app.post("/api/admin/reset-student-password", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Supabase Admin client not initialized.");
      const { profileId, type } = req.body; // type: 'DEFAULT' or 'GENERATE'

      const { data: profile } = await supabaseAdmin
        .from('user_profiles')
        .select('*')
        .eq('id', profileId)
        .maybeSingle();

      if (!profile) throw new Error("Profil nije pronađen.");

      let newPassword = 'yupu8Ev4';
      if (type === 'GENERATE') {
        const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const numbers = "0123456789";
        const symbols = "!?-" ;
        const all = letters + numbers;
        
        let pass = "";
        // 6 characters from letters/numbers
        for (let i = 0 ; i < 6; i++) {
          pass += all.charAt(Math.floor(Math.random() * all.length));
        }
        // 1 number (to be sure)
        pass += numbers.charAt(Math.floor(Math.random() * numbers.length));
        // 1 symbol
        pass += symbols.charAt(Math.floor(Math.random() * symbols.length));
        
        // Shuffle
        newPassword = pass.split('').sort(() => Math.random() - 0.5).join('');
      }

      // Update Auth Password
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(profile.auth_user_id, {
        password: newPassword
      });

      if (authError) throw authError;

      // Update profile flags just in case they were set
      await supabaseAdmin.from('user_profiles').update({
        requires_password_change: false,
        password_type: 'student_static'
      }).eq('id', profileId);

      res.json({
        success: true,
        newPassword
      });
    } catch (err: any) {
      console.error("[RESET_STUDENT_PASS] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  async function authorizeClassAdmin(token: string, schoolId: string) {
    if (!supabaseAdmin) return { authorized: false, error: "Database admin client not configured" };
    if (!token) return { authorized: false, error: "Missing authorization token" };
    if (!schoolId) return { authorized: false, error: "Missing school_id" };

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return { authorized: false, error: "Invalid token" };

    const globalAdminRoles = ["SUPER_ADMIN", "MAIN_ADMIN", "ADMIN"];
    const globalAdminEmails = [
      "skola@skolehr.xyz",
      "skole@skolehr.xyz",
      "nikola.duric@skolehr.xyz",
      "nikola.duric@eskole.me",
      "nikolad4487@gmail.com"
    ];
    const authEmailText = String(user.email || "").toLowerCase();

    let { data: profile, error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .select("id, auth_user_id, name, email, role, access_role, school_id, active_school_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (!profile && !profileError) {
      const fallback = await supabaseAdmin
        .from("user_profiles")
        .select("id, auth_user_id, name, email, role, access_role, school_id, active_school_id")
        .eq("id", user.id)
        .maybeSingle();
      profile = fallback.data;
      profileError = fallback.error;
    }

    if (!profile && !profileError) {
      const fallback = await supabaseAdmin
        .from("user_profiles")
        .select("id, auth_user_id, name, email, role, access_role, school_id, active_school_id")
        .eq("email", user.email)
        .maybeSingle();
      profile = fallback.data;
      profileError = fallback.error;
    }

    if (!profile && !profileError && globalAdminEmails.includes(authEmailText)) {
      const metadata = (user as any).user_metadata || {};
      profile = {
        id: user.id,
        auth_user_id: user.id,
        name: metadata.name || "",
        surname: metadata.surname || "",
        full_name: metadata.full_name || metadata.name || user.email,
        email: user.email,
        role: "ADMIN",
        access_role: "ADMIN",
        school_id: null,
        active_school_id: null
      };
    }

    if (profileError || !profile) return { authorized: false, error: "User profile not found" };

    const roleText = String(profile.role || "").toUpperCase();
    const accessRoleText = String(profile.access_role || "").toUpperCase();
    const emailText = String(profile.email || "").toLowerCase();
    if (globalAdminRoles.includes(roleText) || globalAdminRoles.includes(accessRoleText) || globalAdminEmails.includes(emailText)) {
      return { authorized: true, profile };
    }

    const profileSchoolIds = [
      profile.school_id,
      profile.active_school_id
    ].filter(Boolean).map((id: any) => String(id));
    const profileHasSchoolAdminRole = ["ADMIN", "SCHOOL_ADMIN"].includes(roleText) ||
      ["ADMIN", "SCHOOL_ADMIN"].includes(accessRoleText);

    if (profileHasSchoolAdminRole && profileSchoolIds.includes(String(schoolId))) {
      return { authorized: true, profile };
    }

    const { data: roles, error: rolesError } = await supabaseAdmin
      .from("user_school_roles")
      .select("id, school_id, role, status")
      .eq("user_id", profile.id);

    if (rolesError) return { authorized: false, error: rolesError.message };

    const hasSchoolAdminRole = (roles || []).some((role: any) => {
      const sameSchool = String(role.school_id) === String(schoolId);
      const status = String(role.status || "ACTIVE").toUpperCase();
      const schoolRole = String(role.role || "").toUpperCase();
      return sameSchool && status === "ACTIVE" && ["ADMIN", "SCHOOL_ADMIN", "SUPER_ADMIN", "MAIN_ADMIN"].includes(schoolRole);
    });

    if (!hasSchoolAdminRole) {
      console.warn("[AUTH_CLASS_ADMIN] denied", {
        authUserId: user.id,
        profileId: profile.id,
        email: profile.email,
        role: profile.role,
        accessRole: profile.access_role,
        profileSchoolIds,
        requestedSchoolId: schoolId,
        roles
      });
      return { authorized: false, error: "User is not an active admin for this school" };
    }

    return { authorized: true, profile };
  }

  app.post("/api/admin/bulk-first-school-day-lessons", async (req, res) => {
    try {
      if (!supabaseAdmin) {
        return res.status(500).json({ success: false, error: "Supabase Admin client not initialized." });
      }

      const authHeader = req.headers.authorization || "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
      const auth = await resolveAuthenticatedUser(req);
      if ((auth as any).error) {
        return res.status((auth as any).status || 401).json({ success: false, error: (auth as any).error });
      }

      const requestedDate = String(req.body?.date || "2026-09-07");
      const topic = String(req.body?.topic || "Prvi nastavni dan");
      const hours = Array.isArray(req.body?.hours) && req.body.hours.length > 0
        ? req.body.hours.map((hour: any) => Number(hour)).filter((hour: number) => Number.isInteger(hour))
        : [1, 2];

      if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
        return res.status(400).json({ success: false, error: "Datum mora biti u formatu YYYY-MM-DD." });
      }
      if (hours.length === 0) {
        return res.status(400).json({ success: false, error: "Nedostaju sati za unos." });
      }

      const classId = String(req.body?.classId || req.body?.class_id || "").trim();
      let schoolId = String(req.body?.schoolId || req.body?.school_id || "").trim();
      if (!schoolId) {
        const profileSchoolId = (auth as any).profile?.active_school_id || (auth as any).profile?.school_id;
        const roleSchoolId = ((auth as any).roles || []).find((role: any) => role.school_id)?.school_id;
        schoolId = String(profileSchoolId || roleSchoolId || "").trim();
      }
      if (!schoolId && classId) {
        const { data: classSchool, error: classSchoolError } = await supabaseAdmin
          .from("classes")
          .select("school_id")
          .eq("id", classId)
          .maybeSingle();
        if (classSchoolError) throw classSchoolError;
        schoolId = String(classSchool?.school_id || "").trim();
      }
      if (!schoolId) {
        return res.status(400).json({ success: false, error: "Nije moguće odrediti školu za bulk unos." });
      }

      const authorization = await authorizeClassAdmin(token, schoolId);
      if (!authorization.authorized) {
        return res.status(403).json({ success: false, error: authorization.error || "Nemate ovlasti za bulk unos sati." });
      }

      let { data: subject } = await supabaseAdmin
        .from("subjects")
        .select("id, name")
        .eq("school_id", schoolId)
        .ilike("name", "Sat razrednika")
        .maybeSingle();

      if (!subject) {
        const subjectId = `${schoolId}-sat-razrednika`;
        const { data: createdSubject, error: subjectCreateError } = await supabaseAdmin
          .from("subjects")
          .upsert({
            id: subjectId,
            school_id: schoolId,
            name: "Sat razrednika",
            code: "SR"
          })
          .select("id, name")
          .maybeSingle();
        if (subjectCreateError || !createdSubject) {
          throw subjectCreateError || new Error("Nije moguće kreirati predmet Sat razrednika.");
        }
        subject = createdSubject;
      }

      const { data: classes, error: classesError } = await supabaseAdmin
        .from("classes")
        .select("id, name, school_id, school_year_id, school_year, homeroom_teacher_id, status")
        .eq("school_id", schoolId)
        .eq("status", "ACTIVE")
        .order("name", { ascending: true });
      if (classesError) throw classesError;

      const activeClasses = classes || [];
      if (activeClasses.length === 0) {
        return res.json({ success: true, inserted: 0, skipped: 0, classes: 0, message: "Nema aktivnih razreda za odabranu školu." });
      }

      const classIds = activeClasses.map((cls: any) => cls.id);
      const homeroomTeacherIds = activeClasses.map((cls: any) => cls.homeroom_teacher_id).filter(Boolean);
      const homeroomTeachersQuery = homeroomTeacherIds.length > 0
        ? supabaseAdmin
          .from("user_profiles")
          .select("id, name")
          .in("id", homeroomTeacherIds)
        : Promise.resolve({ data: [], error: null });
      const [{ data: existingLessons, error: existingError }, { data: workWeeks, error: weeksError }, { data: homeroomTeachers, error: teachersError }] = await Promise.all([
        supabaseAdmin
          .from("lessons")
          .select("id, class_id, hour")
          .in("class_id", classIds)
          .eq("date", requestedDate)
          .in("hour", hours),
        supabaseAdmin
          .from("work_weeks")
          .select("id, class_id, start_date, end_date")
          .in("class_id", classIds)
          .lte("start_date", requestedDate)
          .gte("end_date", requestedDate),
        homeroomTeachersQuery
      ]);
      if (existingError) throw existingError;
      if (weeksError) throw weeksError;
      if (teachersError) throw teachersError;

      const existingKeys = new Set((existingLessons || []).map((lesson: any) => `${lesson.class_id}:${Number(lesson.hour)}`));
      const weekByClassId = new Map((workWeeks || []).map((week: any) => [week.class_id, week.id]));
      const teacherById = new Map((homeroomTeachers || []).map((teacher: any) => [teacher.id, teacher]));
      const fallbackTeacherId = (authorization.profile as any)?.id || (auth as any).userId;
      const fallbackTeacherName = fullNameFromProfile(authorization.profile);

      const rows: any[] = [];
      const skipped: Array<{ classId: string; className: string; hour: number }> = [];

      for (const cls of activeClasses) {
        const teacherId = cls.homeroom_teacher_id || fallbackTeacherId;
        const homeroomTeacher = teacherById.get(cls.homeroom_teacher_id);
        const teacherDisplayName = homeroomTeacher ? fullNameFromProfile(homeroomTeacher) : fallbackTeacherName;

        for (const hour of hours) {
          const key = `${cls.id}:${hour}`;
          if (existingKeys.has(key)) {
            skipped.push({ classId: cls.id, className: cls.name, hour });
            continue;
          }

          rows.push({
            class_id: cls.id,
            subject_id: subject.id,
            teacher_id: teacherId,
            school_id: schoolId,
            school_year_id: cls.school_year_id,
            work_week_id: weekByClassId.get(cls.id) || null,
            date: requestedDate,
            hour,
            topic,
            homework: null,
            notes: null,
            materials: null,
            group_name: null,
            is_held: true,
            is_block: false,
            block_count: 1,
            created_by_user_id: (auth as any).userId,
            teacher_display_name: teacherDisplayName
          });
        }
      }

      let insertedRows: any[] = [];
      if (rows.length > 0) {
        const { data: inserted, error: insertError } = await supabaseAdmin
          .from("lessons")
          .insert(rows)
          .select("id, class_id, hour");
        if (insertError) throw insertError;
        insertedRows = inserted || [];
      }

      return res.json({
        success: true,
        schoolId,
        date: requestedDate,
        subjectId: subject.id,
        classes: activeClasses.length,
        inserted: insertedRows.length,
        skipped: skipped.length,
        skippedItems: skipped
      });
    } catch (err: any) {
      console.error("[BULK_FIRST_DAY_LESSONS] Error:", err);
      return res.status(500).json({ success: false, error: err?.message || "Bulk unos sati nije uspio." });
    }
  });

  app.post("/api/admin/grading-elements/duplicates", async (req, res) => {
    try {
      if (!supabaseAdmin) {
        return res.status(500).json({ success: false, error: "Supabase Admin client not initialized." });
      }

      const authHeader = req.headers.authorization || "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
      const schoolId = String(req.body?.schoolId || req.body?.school_id || "").trim();
      const shouldFix = Boolean(req.body?.fix);

      if (!schoolId) {
        return res.status(400).json({ success: false, error: "Nedostaje school_id." });
      }

      const authorization = await authorizeClassAdmin(token, schoolId);
      if (!authorization.authorized) {
        return res.status(403).json({ success: false, error: authorization.error || "Nemate ovlasti za popravak elemenata vrednovanja." });
      }

      const [{ data: elements, error: elementsError }, { data: subjects, error: subjectsError }, { data: classes, error: classesError }] = await Promise.all([
        supabaseAdmin
          .from("grading_elements")
          .select("id, school_id, class_id, subject_id, teacher_id, name, display_order, created_at")
          .eq("school_id", schoolId)
          .order("class_id", { ascending: true })
          .order("subject_id", { ascending: true })
          .order("display_order", { ascending: true }),
        supabaseAdmin
          .from("subjects")
          .select("id, name")
          .eq("school_id", schoolId),
        supabaseAdmin
          .from("classes")
          .select("id, name")
          .eq("school_id", schoolId)
      ]);

      if (elementsError) throw elementsError;
      if (subjectsError) throw subjectsError;
      if (classesError) throw classesError;

      const subjectById = new Map<string, any>((subjects || []).map((subject: any) => [String(subject.id), subject]));
      const classById = new Map<string, any>((classes || []).map((classroom: any) => [String(classroom.id), classroom]));
      const normalizeElementName = (name: any) => String(name || "").toLowerCase().trim();

      const grouped = new Map<string, any[]>();
      for (const element of elements || []) {
        const key = [
          element.class_id,
          element.subject_id,
          normalizeElementName(element.name)
        ].join(":");
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(element);
      }

      const duplicateGroups = Array.from(grouped.values())
        .filter(group => group.length > 1)
        .map(group => {
          const sorted = [...group].sort((a, b) => {
            const orderDiff = Number(a.display_order ?? 9999) - Number(b.display_order ?? 9999);
            if (orderDiff !== 0) return orderDiff;
            return String(a.created_at || "").localeCompare(String(b.created_at || ""));
          });
          const keep = sorted[0];
          return {
            classId: keep.class_id,
            className: classById.get(String(keep.class_id))?.name || keep.class_id,
            subjectId: keep.subject_id,
            subjectName: subjectById.get(String(keep.subject_id))?.name || keep.subject_id,
            elementName: keep.name,
            count: sorted.length,
            keepId: keep.id,
            deleteIds: sorted.slice(1).map(item => item.id)
          };
        })
        .sort((a, b) => {
          const subjectSort = String(a.subjectName).localeCompare(String(b.subjectName), "hr", { sensitivity: "base" });
          if (subjectSort !== 0) return subjectSort;
          const classSort = String(a.className).localeCompare(String(b.className), "hr", { sensitivity: "base", numeric: true });
          if (classSort !== 0) return classSort;
          return String(a.elementName).localeCompare(String(b.elementName), "hr", { sensitivity: "base" });
        });

      const deleteIds = duplicateGroups.flatMap(group => group.deleteIds);
      let deleted = 0;

      if (shouldFix && deleteIds.length > 0) {
        for (let i = 0; i < deleteIds.length; i += 100) {
          const chunk = deleteIds.slice(i, i + 100);
          const { error: deleteError } = await supabaseAdmin
            .from("grading_elements")
            .delete()
            .in("id", chunk);
          if (deleteError) throw deleteError;
          deleted += chunk.length;
        }
      }

      return res.json({
        success: true,
        fixed: shouldFix,
        duplicateGroupCount: duplicateGroups.length,
        duplicateRowCount: deleteIds.length,
        deleted,
        duplicates: duplicateGroups.map(group => ({
          className: group.className,
          subjectName: group.subjectName,
          elementName: group.elementName,
          count: group.count
        }))
      });
    } catch (err: any) {
      console.error("[GRADING_ELEMENTS_DUPLICATES] Error:", err);
      return res.status(500).json({ success: false, error: err?.message || "Provjera elemenata vrednovanja nije uspjela." });
    }
  });

  app.post("/api/admin/classes", async (req, res) => {
    try {
      if (!supabaseAdmin) {
        return res.status(500).json({ success: false, error: "Supabase Admin client not initialized." });
      }

      const authHeader = req.headers.authorization || "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
      const { classId, payload } = req.body || {};

      console.log("[ADMIN_CLASSES_SAVE] payload", payload);

      if (!payload || typeof payload !== "object") {
        return res.status(400).json({ success: false, error: "Nedostaje payload za razred." });
      }

      if (!payload.school_id) {
        return res.status(400).json({ success: false, error: "Nedostaje school_id u payloadu." });
      }

      const auth = await authorizeClassAdmin(token, payload.school_id);
      if (!auth.authorized) {
        return res.status(403).json({ success: false, error: auth.error || "Nemate ovlasti za spremanje razreda." });
      }

      if (payload.school_year_id && payload.name) {
        let duplicateQuery = supabaseAdmin
          .from("classes")
          .select("id, name")
          .eq("school_year_id", payload.school_year_id)
          .eq("name", payload.name)
          .eq("school_id", payload.school_id)
          .limit(1);

        if (classId) duplicateQuery = duplicateQuery.neq("id", classId);

        const { data: duplicates, error: duplicateError } = await duplicateQuery;
        if (duplicateError) throw duplicateError;
        if (duplicates && duplicates.length > 0) {
          return res.status(409).json({
            success: false,
            error: `Razred ${payload.name} već postoji u ovoj školskoj godini.`
          });
        }
      }

      const query = classId
        ? supabaseAdmin.from("classes").update(payload).eq("id", classId).select()
        : supabaseAdmin.from("classes").insert([payload]).select();

      const { data, error } = await query;
      console.log("[ADMIN_CLASSES_SAVE] result", { data, error });
      if (error) throw error;

      return res.json({ success: true, data });
    } catch (e: any) {
      console.error("[ADMIN_CLASSES_SAVE] error:", e);
      return res.status(500).json({ success: false, error: e.message || "Spremanje razreda nije uspjelo." });
    }
  });

  app.get("/api/admin/ematica-users", async (req, res) => {
    try {
      if (!supabaseAdmin) {
        return res.status(500).json({ success: false, error: "Supabase Admin client not initialized." });
      }

      const authHeader = req.headers.authorization || "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
      const schoolId = String(req.query.schoolId || "");
      const search = String(req.query.search || "").trim().toLowerCase();

      const auth = await authorizeClassAdmin(token, schoolId);
      if (!auth.authorized) {
        return res.status(403).json({ success: false, error: auth.error || "Nemate ovlasti za dohvat korisnika." });
      }

      const { data, error } = await supabaseAdmin
        .from("user_profiles")
        .select(`
          id,
          auth_user_id,
          email,
          name,
          role,
          access_role,
          school_id,
          active_school_id,
          user_school_roles (
            id,
            school_id,
            role,
            status
          )
        `)
        .order("name", { ascending: true });

      if (error) throw error;

      const users = (data || [])
        .filter((user: any) => {
          if (!search) return true;
          return String(user.name || "").toLowerCase().includes(search) ||
            String(user.email || "").toLowerCase().includes(search);
        })
        .map((user: any) => {
          const roles = user.user_school_roles || [];
          const assignedToSelectedSchool = roles.some((role: any) =>
            String(role.school_id) === String(schoolId) &&
            String(role.status || "ACTIVE").toUpperCase() === "ACTIVE"
          );
          const selectedSchoolRoles = roles
            .filter((role: any) => String(role.school_id) === String(schoolId))
            .map((role: any) => role.role);

          return {
            id: user.id,
            auth_user_id: user.auth_user_id,
            email: user.email,
            name: user.name,
            role: user.role,
            access_role: user.access_role,
            assignedToSelectedSchool,
            selectedSchoolRoles,
            allSchoolRoles: roles
          };
        });

      return res.json({ success: true, users });
    } catch (e: any) {
      console.error("[EMATICA_USERS_LIST] error:", e);
      return res.status(500).json({ success: false, error: e.message || "Dohvat korisnika iz e-Matice nije uspio." });
    }
  });

  app.post("/api/admin/import-ematica-users", async (req, res) => {
    try {
      if (!supabaseAdmin) {
        return res.status(500).json({ success: false, error: "Supabase Admin client not initialized." });
      }

      const authHeader = req.headers.authorization || "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
      const { schoolId, userIds, rolesByUserId } = req.body || {};

      if (!schoolId) return res.status(400).json({ success: false, error: "Nedostaje schoolId." });
      if (!Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ success: false, error: "Odaberite barem jednog korisnika." });
      }

      const auth = await authorizeClassAdmin(token, schoolId);
      if (!auth.authorized) {
        return res.status(403).json({ success: false, error: auth.error || "Nemate ovlasti za povlačenje korisnika." });
      }

      const { data: profiles, error: profilesError } = await supabaseAdmin
        .from("user_profiles")
        .select("id, auth_user_id, email, name, role, access_role")
        .in("id", userIds);

      if (profilesError) throw profilesError;

      const results: any[] = [];
      for (const profile of profiles || []) {
        const requestedRole = rolesByUserId?.[profile.id];
        const role = String(requestedRole || profile.role || "TEACHER").toUpperCase();
        const isStudent = role === "STUDENT";
        const password = isStudent ? "yupu8Ev4" : "1234";

        let authUserId = profile.auth_user_id;
        if (!authUserId && profile.email) {
          const { data: createdAuth, error: authCreateError } = await supabaseAdmin.auth.admin.createUser({
            email: String(profile.email).toLowerCase(),
            password,
            email_confirm: true,
            user_metadata: { full_name: profile.name || profile.email }
          });

          if (authCreateError && !String(authCreateError.message || "").toLowerCase().includes("already")) {
            results.push({ id: profile.id, email: profile.email, success: false, error: authCreateError.message });
            continue;
          }

          authUserId = createdAuth?.user?.id || authUserId;
          if (authUserId) {
            await supabaseAdmin
              .from("user_profiles")
              .update({ auth_user_id: authUserId })
              .eq("id", profile.id);
          }
        }

        const { error: roleError } = await supabaseAdmin
          .from("user_school_roles")
          .upsert({
            user_id: profile.id,
            school_id: schoolId,
            role,
            status: "ACTIVE"
          }, { onConflict: "user_id,school_id,role" });

        if (roleError) {
          results.push({ id: profile.id, email: profile.email, role, success: false, error: roleError.message });
          continue;
        }

        results.push({ id: profile.id, email: profile.email, name: profile.name, role, success: true });
      }

      const imported = results.filter((item) => item.success).length;
      const failed = results.length - imported;
      return res.json({ success: failed === 0, imported, failed, results });
    } catch (e: any) {
      console.error("[EMATICA_USERS_IMPORT] error:", e);
      return res.status(500).json({ success: false, error: e.message || "Povlačenje korisnika iz e-Matice nije uspjelo." });
    }
  });

  app.delete("/api/classes/:id", async (req, res) => {
    try {
      if (!supabaseAdmin) throw new Error("Database admin client not configured");
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: "Missing authorization header" });
      const token = authHeader.replace('Bearer ', '');
      
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
      if (authError || !user) return res.status(401).json({ error: "Invalid token" });

      const { id } = req.params;
      
      // Perform delete using service role key (bypasses RLS)
      const { data, error, count } = await supabaseAdmin
        .from('classes')
        .delete({ count: 'exact' })
        .eq('id', id)
        .select();

      if (error) throw error;
      res.json({ success: true, data, count });
    } catch (e: any) {
      console.error("API delete class error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // ==========================================================================
  // PRIORITY 4: PRACTICAL TRAINING (PRAKSA)
  // ==========================================================================

  // 1. Practicum Placements (Ustanove/Tvrtke)
  app.get("/api/practicum-placements", (req, res) => {
    try {
      const { studentId, classId, schoolId } = req.query;
      let list = readJsonFile("practicum_placements.json");
      if (studentId) list = list.filter(p => p.student_id === studentId);
      if (classId) list = list.filter(p => p.class_id === classId);
      if (schoolId) list = list.filter(p => p.school_id === schoolId);
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/practicum-placements", async (req, res) => {
    try {
      const payload = req.body;
      if (!payload.student_id || !payload.company_name) {
        return res.status(400).json({ error: "Missing student_id or company_name" });
      }

      const list = readJsonFile("practicum_placements.json");
      const newPlacement = {
        id: crypto.randomUUID(),
        student_id: payload.student_id,
        class_id: payload.class_id || null,
        school_id: payload.school_id || null,
        school_year: payload.school_year || "",
        company_name: payload.company_name,
        company_oib: payload.company_oib || "",
        company_address: payload.company_address || "",
        mentor_name: payload.mentor_name || "",
        mentor_contact: payload.mentor_contact || "",
        start_date: payload.start_date || null,
        end_date: payload.end_date || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      list.push(newPlacement);
      writeJsonFile("practicum_placements.json", list);

      // Try database upsert if table exists (ignore errors silently)
      if (supabaseAdmin) {
        try {
          await supabaseAdmin.from("practicum_placements").upsert(newPlacement);
        } catch (dbErr) {
          console.warn("Db practicum_placements insert failed, fallback active:", dbErr);
        }
      }

      res.json(newPlacement);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/practicum-placements/:id", (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const list = readJsonFile("practicum_placements.json");
      const idx = list.findIndex(p => p.id === id);
      if (idx === -1) return res.status(404).json({ error: "Placement not found" });

      list[idx] = {
        ...list[idx],
        ...updates,
        updated_at: new Date().toISOString()
      };
      writeJsonFile("practicum_placements.json", list);
      res.json(list[idx]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/practicum-placements/:id", (req, res) => {
    try {
      const { id } = req.params;
      let list = readJsonFile("practicum_placements.json");
      list = list.filter(p => p.id !== id);
      writeJsonFile("practicum_placements.json", list);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Practicum Daily Logs (Evidencija)
  app.get("/api/practicum-logs", (req, res) => {
    try {
      const { studentId, placementId } = req.query;
      let list = readJsonFile("practicum_logs.json");
      if (studentId) list = list.filter(p => p.student_id === studentId);
      if (placementId) list = list.filter(p => p.placement_id === placementId);
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/practicum-logs", (req, res) => {
    try {
      const payload = req.body;
      if (!payload.student_id || !payload.date) {
        return res.status(400).json({ error: "Missing student_id or date" });
      }

      const list = readJsonFile("practicum_logs.json");
      const newLog = {
        id: crypto.randomUUID(),
        placement_id: payload.placement_id || null,
        student_id: payload.student_id,
        date: payload.date,
        hours_worked: payload.hours_worked || 0,
        activity_description: payload.activity_description || "",
        mentor_signature: payload.mentor_signature || "Nije potpisano", // "Nije potpisano" or "Potpisano"
        signed_at: payload.signed_at || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      list.push(newLog);
      writeJsonFile("practicum_logs.json", list);
      res.json(newLog);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/practicum-logs/:id", (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const list = readJsonFile("practicum_logs.json");
      const idx = list.findIndex(p => p.id === id);
      if (idx === -1) return res.status(404).json({ error: "Log not found" });

      list[idx] = {
        ...list[idx],
        ...updates,
        updated_at: new Date().toISOString()
      };
      writeJsonFile("practicum_logs.json", list);
      res.json(list[idx]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/practicum-logs/:id", (req, res) => {
    try {
      const { id } = req.params;
      let list = readJsonFile("practicum_logs.json");
      list = list.filter(p => p.id !== id);
      writeJsonFile("practicum_logs.json", list);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Practicum Evaluations (Ocjene prakse)
  app.get("/api/practicum-evaluations", (req, res) => {
    try {
      const { studentId, placementId } = req.query;
      let list = readJsonFile("practicum_evaluations.json");
      if (studentId) list = list.filter(p => p.student_id === studentId);
      if (placementId) list = list.filter(p => p.placement_id === placementId);
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/practicum-evaluations", (req, res) => {
    try {
      const payload = req.body;
      if (!payload.student_id || !payload.placement_id) {
        return res.status(400).json({ error: "Missing student_id or placement_id" });
      }

      const list = readJsonFile("practicum_evaluations.json");
      const idx = list.findIndex(e => e.placement_id === payload.placement_id && e.student_id === payload.student_id);

      const newEval = {
        id: idx >= 0 ? list[idx].id : crypto.randomUUID(),
        placement_id: payload.placement_id,
        student_id: payload.student_id,
        engagement_grade: payload.engagement_grade || 5, // 1-5
        expertise_grade: payload.expertise_grade || 5,   // 1-5
        communication_grade: payload.communication_grade || 5, // 1-5
        final_grade: payload.final_grade || 5,
        notes: payload.notes || "",
        evaluator_name: payload.evaluator_name || "Mentor škole",
        created_at: idx >= 0 ? list[idx].created_at : new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      if (idx >= 0) {
        list[idx] = newEval;
      } else {
        list.push(newEval);
      }

      writeJsonFile("practicum_evaluations.json", list);
      res.json(newEval);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================================================
  // PRIORITY 4: REGISTRATIONS & TRANSFERS (UPISI I ISPISI)
  // ==========================================================================
  app.get("/api/student-registrations", (req, res) => {
    try {
      const { studentId, schoolId } = req.query;
      let list = readJsonFile("student_registrations.json");
      if (studentId) list = list.filter(p => p.student_id === studentId);
      if (schoolId) list = list.filter(p => p.school_id === schoolId);
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/student-registrations", async (req, res) => {
    try {
      const payload = req.body;
      if (!payload.student_id || !payload.action_type) {
        return res.status(400).json({ error: "Missing student_id or action_type" });
      }

      const list = readJsonFile("student_registrations.json");
      const record = {
        id: crypto.randomUUID(),
        student_id: payload.student_id,
        action_type: payload.action_type, // 'UPIS', 'ISPIS', 'PREMJESTAJ', 'PRIJELAZ_IZ', 'PRIJELAZ_U'
        date: payload.date || new Date().toISOString().split('T')[0],
        reason: payload.reason || "",
        school_id: payload.school_id || "",
        former_class_id: payload.former_class_id || "",
        former_class_name: payload.former_class_name || "",
        new_class_id: payload.new_class_id || "",
        new_class_name: payload.new_class_name || "",
        other_school_name: payload.other_school_name || "",
        details: payload.details || "",
        registered_by: payload.registered_by || "Administrator",
        created_at: new Date().toISOString()
      };

      list.push(record);
      writeJsonFile("student_registrations.json", list);

      // Save transfers permanently
      if (payload.action_type === 'PREMJESTAJ' || payload.action_type === 'PRIJELAZ_IZ' || payload.action_type === 'PRIJELAZ_U') {
        const transfers = readJsonFile("student_transfers.json");
        transfers.push({
          id: record.id,
          date: record.date,
          student_id: record.student_id,
          action_type: record.action_type,
          former_class_name: record.former_class_name,
          new_class_name: record.new_class_name,
          school_name: record.other_school_name || "Naša škola",
          reason: record.reason,
          created_at: record.created_at
        });
        writeJsonFile("student_transfers.json", transfers);
      }

      // If database is up, update user_profiles and user_school_roles status
      if (supabaseAdmin) {
        try {
          if (payload.action_type === 'UPIS' || payload.action_type === 'PREMJESTAJ' || payload.action_type === 'PRIJELAZ_IZ') {
            if (payload.new_class_id) {
              await supabaseAdmin.from("user_profiles").update({ class_id: payload.new_class_id }).eq('id', payload.student_id);
              await supabaseAdmin.from("user_school_roles").update({ status: 'ACTIVE' }).eq('user_id', payload.student_id);
            }
          } else if (payload.action_type === 'ISPIS' || payload.action_type === 'PRIJELAZ_U') {
            await supabaseAdmin.from("user_profiles").update({ class_id: null }).eq('id', payload.student_id);
            await supabaseAdmin.from("user_school_roles").update({ status: 'INACTIVE' }).eq('user_id', payload.student_id);
          }
        } catch (dbErr) {
          console.warn("DB user profile registration update bypassed:", dbErr);
        }
      }

      res.json(record);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/student-transfers", (req, res) => {
    try {
      const { studentId } = req.query;
      let list = readJsonFile("student_transfers.json");
      if (studentId) list = list.filter(p => p.student_id === studentId);
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================================================
  // PRIORITY 4: COMPETITIONS (NATJECANJA)
  // ==========================================================================
  app.get("/api/competitions", (req, res) => {
    try {
      const { studentId, schoolId } = req.query;
      let list = readJsonFile("competitions.json");
      if (studentId) list = list.filter(p => p.student_id === studentId);
      if (schoolId) list = list.filter(p => p.school_id === schoolId);
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/competitions", (req, res) => {
    try {
      const payload = req.body;
      if (!payload.student_id || !payload.subject_name || !payload.level) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const list = readJsonFile("competitions.json");
      const newComp = {
        id: crypto.randomUUID(),
        student_id: payload.student_id,
        school_id: payload.school_id || "",
        subject_name: payload.subject_name,
        mentor_name: payload.mentor_name || "",
        level: payload.level, // 'Školsko', 'Županijsko', 'Državno', 'Međunarodno'
        result: payload.result || "",
        placement: payload.placement || "",
        date: payload.date || new Date().toISOString().split('T')[0],
        created_at: new Date().toISOString()
      };

      list.push(newComp);
      writeJsonFile("competitions.json", list);
      res.json(newComp);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/competitions/:id", (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const list = readJsonFile("competitions.json");
      const idx = list.findIndex(c => c.id === id);
      if (idx === -1) return res.status(404).json({ error: "Competition record not found" });

      list[idx] = {
        ...list[idx],
        ...updates
      };
      writeJsonFile("competitions.json", list);
      res.json(list[idx]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/competitions/:id", (req, res) => {
    try {
      const { id } = req.params;
      let list = readJsonFile("competitions.json");
      list = list.filter(c => c.id !== id);
      writeJsonFile("competitions.json", list);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================================================
  // PRIORITY 5: SCHOOL FINANCES (EVIDENCIJA UPLATA)
  // ==========================================================================
  app.get("/api/payments", (req, res) => {
    try {
      const { studentId, classId, schoolId } = req.query;
      let list = readJsonFile("payments.json");
      if (studentId) list = list.filter(p => p.student_id === studentId);
      if (classId) list = list.filter(p => p.class_id === classId);
      if (schoolId) list = list.filter(p => p.school_id === schoolId);
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/payments", (req, res) => {
    try {
      const payload = req.body;
      if (!payload.student_id || !payload.purpose || !payload.amount) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const list = readJsonFile("payments.json");
      const newPayment = {
        id: crypto.randomUUID(),
        student_id: payload.student_id,
        class_id: payload.class_id || "",
        school_id: payload.school_id || "",
        purpose: payload.purpose, // 'Ekskurzije', 'Izleti', 'Maturalna putovanja', 'Participacije', 'Ostale uplate'
        amount: parseFloat(payload.amount),
        date: payload.date || new Date().toISOString().split('T')[0],
        status: payload.status || 'NIJE PLAĆENO', // 'PLAĆENO', 'DJELOMIČNO PLAĆENO', 'NIJE PLAĆENO'
        receipt_number: "POT-" + Math.floor(100000 + Math.random() * 900000),
        created_at: new Date().toISOString()
      };

      list.push(newPayment);
      writeJsonFile("payments.json", list);
      res.json(newPayment);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/payments/:id", (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const list = readJsonFile("payments.json");
      const idx = list.findIndex(p => p.id === id);
      if (idx === -1) return res.status(404).json({ error: "Payment not found" });

      list[idx] = {
        ...list[idx],
        ...updates
      };
      writeJsonFile("payments.json", list);
      res.json(list[idx]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/payments/:id", (req, res) => {
    try {
      const { id } = req.params;
      let list = readJsonFile("payments.json");
      list = list.filter(p => p.id !== id);
      writeJsonFile("payments.json", list);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================================================
  // PRIORITY 6: AI ANALYTICS & DIRECTOR DASHBOARD
  // ==========================================================================
  let aiClient: any = null;
  const getGenAI = () => {
    if (!aiClient) {
      const key = process.env.GEMINI_API_KEY;
      aiClient = new GoogleGenAI({
        apiKey: key || "MOCK_KEY",
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });
    }
    return aiClient;
  };

  app.post("/api/ai-analytics", async (req, res) => {
    try {
      const { studentId, studentName, gpa, grades, absencesJustified, absencesUnjustified, conduct, pedagogicalMeasures } = req.body;
      
      const genAI = getGenAI();
      const apiKey = process.env.GEMINI_API_KEY;

      const gradeDetails = Array.isArray(grades) ? grades.map(g => `${g.subject}: ${g.value}`).join(', ') : "Nema unesenih ocjena";
      const pmDetails = Array.isArray(pedagogicalMeasures) ? pedagogicalMeasures.map(m => `Tip: ${m.type}, Obrazloženje: ${m.explanation}`).join('; ') : "Nema pedagoških mjera";

      if (apiKey && apiKey !== "MOCK_KEY") {
        try {
          const prompt = `Analiziraj akademski uspjeh srednjoškolca s ciljem prevencije pada razreda i savjetovanja stručne službe.
Student: ${studentName || "Anonimni učenik"}
Prosjek (GPA): ${gpa || "Nije izračunato"}
Zaključne i trenutne ocjene: ${gradeDetails}
Izostanci: Opravdano ${absencesJustified || 0}, Neopravdano ${absencesUnjustified || 0}
Ocjena vladanja: ${conduct || "Uzorno"}
Pedagoške mjere: ${pmDetails}

Kao pedagog ili psiholog sustava, generiraj JSON objekt s točnim poljima:
- "analysis": Stručna, empatična i detaljna analiza učenikovog statusa i trendova.
- "risk_level": Razina rizika od pada razreda: isključivo 'LOW', 'MEDIUM', ili 'HIGH'
- "risk_reasons": Niz specifičnih objašnjenja/indikatora koji opravdavaju ovu razinu rizika.
- "recommendations": Niz konkretnih i praktičnih preporuka za stručnu službu (npr. razgovor s roditeljima, dopunska nastava, individualizirani pristup).`;

          const result = await genAI.models.generateContent({
            model: "gemini-3.5-flash",
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  analysis: { type: Type.STRING },
                  risk_level: { type: Type.STRING },
                  risk_reasons: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  },
                  recommendations: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  }
                },
                required: ["analysis", "risk_level", "risk_reasons", "recommendations"]
              }
            }
          });

          const aiText = result.text;
          const parsed = JSON.parse(aiText.trim());
          return res.json({
            ...parsed,
            mode: "AI_GENERATED"
          });
        } catch (openaiErr: any) {
          console.error("Gemini API call failed, backing up to rule engine:", openaiErr);
        }
      }

      // Rule-based fallback
      const parsedGpa = parseFloat(gpa || "5.0");
      const hasNegatives = Array.isArray(grades) && grades.some(g => parseFloat(g.value) === 1);
      const isUnjustifiedHigh = parseInt(absencesUnjustified || "0") > 15;
      
      let risk_level = "LOW";
      let risk_reasons = ["Akademski napredak je unutar očekivanih normi.", "Izostanci i vladanje su stabilni."];
      let recommendations = ["Nastaviti s kontinuiranim praćenjem učenika.", "Poticati aktivno sudjelovanje u stručnoj praksi."];

      if (hasNegatives || parsedGpa < 2.0 || isUnjustifiedHigh) {
        risk_level = "HIGH";
        risk_reasons = [];
        if (hasNegatives) risk_reasons.push("Učenik ima evidentirane negativne (nedovoljne) ocjene.");
        if (parsedGpa < 2.0) risk_reasons.push("Ukupni prosjek ocjena je kritično nizak.");
        if (isUnjustifiedHigh) risk_reasons.push("Broj neopravdanih izostanaka prelazi prag prekršajnih mjera.");
        
        recommendations = [
          "Pokrenuti hitan individualni razgovor s učenikom kod pedagoga.",
          "Sazvati hitan individualni razgovor s roditeljima.",
          "Uključiti učenika u organiziranu dopunsku nastavu za kritične predmete.",
          "Ocijeniti potrebu za prilagodbom programa u suradnji sa stručnim timom u školi."
        ];
      } else if (parsedGpa < 3.0 || parseInt(absencesUnjustified || "0") > 5) {
        risk_level = "MEDIUM";
        risk_reasons = ["Prosjek učenika pokazuje opći pad uspjeha.", "Uočen je manji porast neopravdanih izostanaka."];
        recommendations = [
          "Organizirati preventivan razgovor s razrednikom.",
          "Evidentirati dodatnu podršku u učenju na satovima dopunske nastave.",
          "Pozvati roditelja na redovite informacije."
        ];
      }

      res.json({
        analysis: `Heuristička analiza za učenika ${studentName || "Anonimno"}. Prosječna ocjena iznosi ${parsedGpa}, uz ${absencesJustified || 0} opravdanih i ${absencesUnjustified || 0} neopravdanih sati. Sustav automatski detektira prisutnost negativnih ocjena i izostanci u tekućoj školskoj godini te klasificira rizik na temelju predefiniranih pragova pravilnika.`,
        risk_level,
        risk_reasons,
        recommendations,
        mode: "LOCAL_HEURISTICS"
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/ai-director-dashboard", async (req, res) => {
    try {
      const { schoolStats } = req.body;
      const genAI = getGenAI();
      const apiKey = process.env.GEMINI_API_KEY;

      if (apiKey && apiKey !== "MOCK_KEY") {
        try {
          const prompt = `Analiziraj ukupne statističke podatke škole za ravnatelja s ciljem davanja strateških preporuka:
Statistika škole: ${JSON.stringify(schoolStats)}

Generiraj JSON objekt sa sljedećom strukturom:
- "schoolTrendSummary": Opći, stručan i jasan pregled općih trendova u školi (vladanje, prosjeci, ocjene).
- "criticalPrograms": Koje obrazovni programi ili razredi imaju najveće poteškoće i zahtijevaju administrativne mjere.
- "strengths": Pozitivne strane i uspjesi škole (najviši prosjeci, dobar odaziv na praksi ili natjecanjima).
- "actionPlan": Niz koraka i preporuka ravnatelju za poboljšanje podrške učenicima.`;

          const result = await genAI.models.generateContent({
            model: "gemini-3.5-flash",
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  schoolTrendSummary: { type: Type.STRING },
                  criticalPrograms: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  },
                  strengths: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  },
                  actionPlan: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  }
                },
                required: ["schoolTrendSummary", "criticalPrograms", "strengths", "actionPlan"]
              }
            }
          });

          return res.json({
            ...JSON.parse(result.text.trim()),
            mode: "AI_GENERATED"
          });
        } catch (apiErr) {
          console.error("Gemini Director Dashboard API failed, backing up:", apiErr);
        }
      }

      // Fallback heuristic
      res.json({
        schoolTrendSummary: "Opća analiza rada škole ukazuje na stabilnu razinu prolaznosti. Ugostiteljski smjerovi (Kuhari, Konobari) pokazuju iznimno zalaganje na praktičnoj nastavi, dok se u pojedinim strukovnim razredima uočava blagi porast neopravdanih izostanaka u drugom polugodištu.",
        criticalPrograms: [
          "Trostruki strukovni programi (Kuhari i Slastičari) u 3. razredima zbog opterećenja stručnom praksom.",
          "Razredi s prosjekom ocjena ispod 3.20."
        ],
        strengths: [
          "Visok stupanj uspješnosti obrane završnih radova kod strukovnih smjerova.",
          "Izvrsna suradnja s lokalnim ugostiteljskim objektima i partner tvrtkama za izvođenje prakse."
        ],
        actionPlan: [
          "Pokrenuti pojačanu koordinaciju između mentora u privredi i školskih mentora.",
          "Održati sastanak stručnog vijeća o ujednačavanju kriterija ocjenjivanja općeobrazovnih predmeta.",
          "Implementirati sustav ranog upozoravanja roditelja za nagli skok neopravdanih sati."
        ],
        mode: "LOCAL_HEURISTICS"
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Only serve static files if not on Vercel
    if (!process.env.VERCEL) {
        const distPath = path.join(process.cwd(), 'dist');
        app.use(express.static(distPath));
        app.get('*', (req, res) => {
            const ext = path.extname(req.path);
            const isSourceOrApi = req.path.startsWith('/src') || req.path.startsWith('/api') || req.path.startsWith('/node_modules');
            if ((ext && ext !== '.html') || isSourceOrApi) {
                return res.status(404).send('Not Found');
            }
            res.sendFile(path.join(distPath, 'index.html'));
        });
    }
  }

  // Export app for Vercel Serverless Functions
  if (process.env.VERCEL) {
      return app;
  }

  const fixSpecificUsers = async () => {
    if (!supabaseAdmin) return;
    try {
      const targetSchoolId = 'srednja-kola-glina-zagreb';
      const DEFAULT_PIN_HASH = '$2b$10$EEbRoX3UU0AtHm3CMZSABOXxL9ghae0./0eeeBuKVpYEsAaDdXQ72'; // '1234'

      console.log("[USER_FIX] Running specific users fix routine...");

      // 1. Nikola Đurić
      const { data: nikolaProf } = await supabaseAdmin
        .from('user_profiles')
        .select('*')
        .eq('email', 'nikola.duric@skolehr.xyz')
        .maybeSingle();

      if (nikolaProf) {
        await supabaseAdmin
          .from('user_profiles')
          .update({
            name: 'Nikola Đurić',
            role: 'MAIN_ADMIN',
            access_role: 'MAIN_ADMIN',
            school_id: null,
            active_school_id: null,
            pin_hash: nikolaProf.pin_hash || DEFAULT_PIN_HASH,
            updated_at: new Date().toISOString()
          })
          .eq('id', nikolaProf.id);

        await supabaseAdmin
          .from('user_school_roles')
          .upsert({
            user_id: nikolaProf.id,
            school_id: targetSchoolId,
            role: 'SCHOOL_ADMIN',
            status: 'ACTIVE',
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id,school_id,role' });
        
        console.log("[USER_FIX] Nikola Đurić verified as SCHOOL_ADMIN for", targetSchoolId);
      }

      // 2. Boris Srećković
      const { data: borisProf } = await supabaseAdmin
        .from('user_profiles')
        .select('*')
        .eq('email', 'boris.sreckovic@skolehr.xyz')
        .maybeSingle();

      if (borisProf) {
        await supabaseAdmin
          .from('user_profiles')
          .update({
            name: 'Boris Srećković',
            role: 'SCHOOL_ADMIN',
            access_role: 'SCHOOL_ADMIN',
            school_id: targetSchoolId,
            active_school_id: targetSchoolId,
            pin_hash: borisProf.pin_hash || DEFAULT_PIN_HASH,
            updated_at: new Date().toISOString()
          })
          .eq('id', borisProf.id);

        await supabaseAdmin
          .from('user_school_roles')
          .upsert({
            user_id: borisProf.id,
            school_id: targetSchoolId,
            role: 'SCHOOL_ADMIN',
            status: 'ACTIVE',
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id,school_id,role' });

        console.log("[USER_FIX] Boris Srećković verified as SCHOOL_ADMIN for", targetSchoolId);
      }

      // 3. Global Super Admin: skole@skolehr.xyz & skola@skolehr.xyz
      for (const superEmail of ['skole@skolehr.xyz', 'skola@skolehr.xyz']) {
        const { data: superProf } = await supabaseAdmin
          .from('user_profiles')
          .select('*')
          .eq('email', superEmail)
          .maybeSingle();

        if (superProf) {
          await supabaseAdmin
            .from('user_profiles')
            .update({
              role: 'SUPER_ADMIN',
              access_role: 'SUPER_ADMIN',
              school_id: null,
              active_school_id: null,
              pin_hash: superProf.pin_hash || DEFAULT_PIN_HASH,
              updated_at: new Date().toISOString()
            })
            .eq('id', superProf.id);
          
          console.log("[USER_FIX] Global admin verified:", superEmail);
        }
      }
    } catch (err: any) {
      console.error("[USER_FIX] Error running specific users fix:", err?.message || err);
    }
  };

  const fixNullSchoolYears = async () => {
    if (!supabaseAdmin) return;
    try {
      const { data: assignments, error } = await supabaseAdmin
        .from("reading_assignments")
        .select("id, class_id")
        .is("school_year_id", null);

      if (error) throw error;

      if (assignments && assignments.length > 0) {
        console.log(`[LEKTIRA FIX] Found ${assignments.length} assignments with null school_year_id. Repairing...`);
        for (const item of assignments) {
          if (!item.class_id) continue;
          const { data: classData, error: classErr } = await supabaseAdmin
            .from("classes")
            .select("school_year_id")
            .eq("id", item.class_id)
            .maybeSingle();

          if (classErr) {
            console.error(`[LEKTIRA FIX] Error fetching class ${item.class_id}:`, classErr.message);
            continue;
          }

          if (classData && classData.school_year_id) {
            const { error: updateErr } = await supabaseAdmin
              .from("reading_assignments")
              .update({ school_year_id: classData.school_year_id })
              .eq("id", item.id);

            if (updateErr) {
              console.error(`[LEKTIRA FIX] Error updating assignment ${item.id}:`, updateErr.message);
            } else {
              console.log(`[LEKTIRA FIX] Assignment ${item.id} successfully updated with school_year_id: ${classData.school_year_id}`);
            }
          }
        }
      }
    } catch (err: any) {
      console.error("[LEKTIRA FIX] Error running fallback check/fix:", err.message);
    }
  };

  if (isVercel) {
    console.log("[SERVER] Running in Vercel environment. Skipping app.listen.");
    fixNullSchoolYears();
    fixSpecificUsers();
  } else {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
      fixNullSchoolYears();
      fixSpecificUsers();
    });
  }
  return app;
  } catch (err) {
    console.error("CRITICAL: Failed to start server:", err);
    process.exit(1);
  }
}

export const appPromise = startServer();
