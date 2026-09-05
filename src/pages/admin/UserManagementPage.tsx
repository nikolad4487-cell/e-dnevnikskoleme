import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useSelection } from '../../contexts/SelectionContext';
import { useAuth } from '../../contexts/AuthContext';
import { User, Role, EdnevnikSyncReport, isSchoolAdminUser } from '../../types';
import { 
  UserPlus, 
  Search, 
  ChevronLeft, 
  MoreVertical, 
  Mail, 
  ShieldCheck, 
  GraduationCap, 
  User as UserIcon,
  Filter,
  CheckCircle2,
  XCircle,
  Trash2,
  RefreshCw,
  Users,
  AlertCircle,
  Check,
  Shield,
  Printer,
  X
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { formatPersonName, matchesSearch } from '../../lib/utils';

export default function UserManagementPage() {
  const { selectedSchoolId } = useSelection();
  const { isMainAdmin, userSchoolRoles } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');

  const isAnyAdmin = isMainAdmin || userSchoolRoles.some(r => 
    (r.schoolId === selectedSchoolId || r.school_id === selectedSchoolId) && isSchoolAdminUser(r, [r.role])
  );

  // Form State
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('Demo1234!');
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [address, setAddress] = useState('');
  const [oib, setOib] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [selectedRoles, setSelectedRoles] = useState<Role[]>([Role.TEACHER]);
  const [submitting, setSubmitting] = useState(false);
  
  // Bulk Create State
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkRole, setBulkRole] = useState<Role>(Role.STUDENT);
  const [bulkData, setBulkData] = useState('');

  // Sync State
  const [syncing, setSyncing] = useState(false);
  const [syncReport, setSyncReport] = useState<EdnevnikSyncReport | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isEmaticaModalOpen, setIsEmaticaModalOpen] = useState(false);
  const [ematicaUsers, setEmaticaUsers] = useState<any[]>([]);
  const [ematicaSearch, setEmaticaSearch] = useState('');
  const [selectedEmaticaUserIds, setSelectedEmaticaUserIds] = useState<string[]>([]);
  const [loadingEmaticaUsers, setLoadingEmaticaUsers] = useState(false);
  const [importingEmaticaUsers, setImportingEmaticaUsers] = useState(false);
  const [bulkStaffTotp, setBulkStaffTotp] = useState<{
    id: string;
    email: string;
    name: string;
    secret: string;
    qrCode: string;
    otpauthUrl: string;
  }[]>([]);

  const loadEmaticaUsers = async (searchValue = ematicaSearch) => {
    try {
      setLoadingEmaticaUsers(true);
      const { data: { session } } = await supabase.auth.getSession();
      const params = new URLSearchParams({
        schoolId: selectedSchoolId || '',
        search: searchValue || ''
      });
      const response = await fetch(`/api/admin/ematica-users?${params.toString()}`, {
        headers: {
          ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {})
        }
      });
      const raw = await response.text();
      console.log("LOAD EMATICA USERS STATUS", response.status);
      console.log("LOAD EMATICA USERS RAW RESPONSE", raw);
      const result = raw ? JSON.parse(raw) : null;
      if (!response.ok || result?.success === false) {
        throw new Error(result?.error || raw || 'Dohvat korisnika nije uspio.');
      }
      setEmaticaUsers(result.users || []);
    } catch (err: any) {
      console.error("LOAD EMATICA USERS FAILED:", err);
      toast.error('Greška pri dohvaćanju korisnika iz e-Matice: ' + (err.message || 'Nepoznata greška'));
    } finally {
      setLoadingEmaticaUsers(false);
    }
  };

  const handleOpenEmaticaImport = async () => {
    setSelectedEmaticaUserIds([]);
    setEmaticaSearch('');
    setIsEmaticaModalOpen(true);
    await loadEmaticaUsers('');
  };

  const toggleEmaticaUser = (userId: string) => {
    setSelectedEmaticaUserIds(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleImportSelectedEmaticaUsers = async () => {
    if (selectedEmaticaUserIds.length === 0) {
      toast.error('Odaberite barem jednog korisnika.');
      return;
    }

    try {
      setImportingEmaticaUsers(true);
      const { data: { session } } = await supabase.auth.getSession();
      const rolesByUserId = selectedEmaticaUserIds.reduce((acc: Record<string, string>, userId) => {
        const user = ematicaUsers.find(item => item.id === userId);
        acc[userId] = user?.role || Role.TEACHER;
        return acc;
      }, {});

      const response = await fetch('/api/admin/import-ematica-users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {})
        },
        body: JSON.stringify({
          schoolId: selectedSchoolId,
          userIds: selectedEmaticaUserIds,
          rolesByUserId
        })
      });
      const raw = await response.text();
      console.log("IMPORT EMATICA USERS STATUS", response.status);
      console.log("IMPORT EMATICA USERS RAW RESPONSE", raw);
      const result = raw ? JSON.parse(raw) : null;
      if (!response.ok || result?.success === false) {
        throw new Error(result?.error || raw || 'Povlačenje korisnika nije uspjelo.');
      }

      toast.success(`Povučeno korisnika: ${result.imported}`);
      setIsEmaticaModalOpen(false);
      fetchUsers();
    } catch (err: any) {
      console.error("IMPORT EMATICA USERS FAILED:", err);
      toast.error('Greška pri povlačenju korisnika: ' + (err.message || 'Nepoznata greška'));
    } finally {
      setImportingEmaticaUsers(false);
    }
  };

  const handleSyncUsers = async () => {
    try {
      setSyncing(true);
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/admin/sync-ednevnik-users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {})
        },
        body: JSON.stringify({
          schoolId: selectedSchoolId
        })
      });

      const resData = await response.json();
      if (!response.ok || !resData.success) {
        throw new Error(resData.error || 'Neuspjela sinkronizacija');
      }

      setSyncReport(resData.report);
      setIsReportModalOpen(true);
      toast.success('Sinkronizacija korisnika uspješno završena!');
      fetchUsers();
    } catch (err: any) {
      console.error("SYNC FAILED:", err);
      toast.error('Greška pri sinkronizaciji: ' + (err.message || 'Nepoznata greška'));
    } finally {
      setSyncing(false);
    }
  };

  const toggleRole = (role: Role) => {
    setSelectedRoles(prev => 
      prev.includes(role) 
        ? prev.filter(r => r !== role)
        : [...prev, role]
    );
  };

  const handleOpenEdit = (user: any) => {
    if (!isAnyAdmin) {
      toast.error('Ova akcija je dopuštena samo administratorima.');
      return;
    }
    setEditingUser(user);
    setEmail(user.email || '');
    
    let firstName = user.name || '';
    let lastName = user.surname || '';
    if (!lastName && firstName.includes(' ')) {
      const parts = firstName.trim().split(' ');
      firstName = parts[0];
      lastName = parts.slice(1).join(' ');
    }
    setName(firstName);
    setSurname(lastName);
    setAddress(user.address || '');
    setOib(user.oib || '');
    const displayStatus = user.user_school_roles?.some((r: any) => r.status === 'ACTIVE')
      ? 'ACTIVE'
      : (user.status || 'ACTIVE');
    setStatus(displayStatus);
    
    // Retrieve all active roles from user_school_roles as well as user.roles
    const activeRolesFromSchoolRoles = user.user_school_roles
      ?.filter((r: any) => r.status === 'ACTIVE' && (!r.school_id || r.school_id === selectedSchoolId))
      ?.map((r: any) => r.role) || [];

    const combinedRoles = Array.from(new Set([
      ...(user.roles || []),
      ...activeRolesFromSchoolRoles,
      ...(user.role ? [user.role] : [])
    ]));

    setSelectedRoles(combinedRoles.length > 0 ? (combinedRoles as Role[]) : [Role.TEACHER]);
    setIsModalOpen(true);
  };

  const handleOpenCreate = () => {
    if (!isAnyAdmin) {
      toast.error('Ova akcija je dopuštena samo administratorima.');
      return;
    }
    setEditingUser(null);
    setEmail('');
    setName('');
    setSurname('');
    setAddress('');
    setOib('');
    setStatus('ACTIVE');
    setSelectedRoles([Role.TEACHER]);
    setIsModalOpen(true);
  };

  const handleGenerateAuthenticatorsForAllStaff = async () => {
    if (!isAnyAdmin) {
      toast.error('Ova akcija je dopuštena samo administratorima.');
      return;
    }

    if (!confirm('Generirati Microsoft Authenticator QR kodove za nastavnike i admin korisnike ove škole koji još nemaju postavljen Authenticator? Korisnici koji ga već imaju neće se mijenjati.')) return;

    try {
      setLoading(true);
      const response = await fetch('/api/auth/bulk-generate-staff-authenticators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schoolId: selectedSchoolId })
      });

      const text = await response.text();
      let result = null;
      try {
        result = text ? JSON.parse(text) : null;
      } catch (err) {
        throw new Error('Server nije vratio ispravan JSON odgovor.');
      }

      if (!response.ok || result?.success === false) {
        throw new Error(result?.error || 'Greška pri generiranju Authenticator kodova');
      }

      setBulkStaffTotp(result?.authenticators || []);
      toast.success(`Generirano: ${result?.updatedCount || 0}. Već postavljeno: ${result?.skippedCount || 0}.`);
      await fetchUsers();
    } catch (err: any) {
      console.error('BULK STAFF AUTHENTICATOR FAILED:', err);
      toast.error(err.message || 'Greška pri generiranju Authenticator kodova');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedSchoolId) {
      navigate('/admin/schools');
      return;
    }
    fetchUsers();
  }, [selectedSchoolId]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      console.log("USER FILTER", roleFilter, "FETCHING USERS FOR SCHOOL:", selectedSchoolId);
      
      // Task 3: Fetch user_profiles with user_school_roles
      const { data, error } = await supabase
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
          address,
          oib,
          user_school_roles (
            id,
            school_id,
            role,
            status
          )
        `);
      
      if (error) {
        console.error("FETCH USERS ERROR", error);
        throw error;
      }

      console.log("RAW FETCHED USER PROFILES DATA", data);

      // Filter and map users for the selected school
      const schoolUsers = (data || []).filter((user: any) => {
        const isAssignedToSchool = user.school_id === selectedSchoolId || user.active_school_id === selectedSchoolId;
        const hasSchoolRole = user.user_school_roles?.some((r: any) => r.school_id === selectedSchoolId);
        return isAssignedToSchool || hasSchoolRole;
      });

      const mappedUsers = schoolUsers.map((user: any) => {
        const activeRoles = user.user_school_roles
          ?.filter((r: any) => r.status === "ACTIVE" && (!r.school_id || r.school_id === selectedSchoolId))
          ?.map((r: any) => r.role) || [];

        let allActiveRoles = [...activeRoles];
        if (allActiveRoles.length === 0 && user.role) {
          allActiveRoles.push(user.role);
        }
        allActiveRoles = Array.from(new Set(allActiveRoles));

        const displayStatus = user.user_school_roles?.some((r: any) => r.status === "ACTIVE")
          ? "ACTIVE"
          : "INACTIVE";

        return {
          ...user,
          roles: allActiveRoles,
          status: displayStatus
        };
      });
      
      console.log("COMBINED MAPPED USERS", mappedUsers);
      setUsers(mappedUsers);
    } catch (err: any) {
      toast.error('Greška pri učitavanju korisnika: ' + (err?.message || ''));
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAnyAdmin) {
      console.warn("Attempted user create/update without admin permissions");
      return;
    }
    if (oib && oib.length !== 11) {
      toast.error('OIB mora sadržavati točno 11 znamenki.');
      return;
    }
    if (selectedRoles.length === 0) {
      toast.error('Odaberite barem jednu ulogu');
      return;
    }
    setSubmitting(true);
    try {
      const endpoint = editingUser ? '/api/admin/update-user' : '/api/admin/create-user';
      const userProfileId = editingUser?.id;
      const payload = {
        profileId: userProfileId,
        authUserId: editingUser?.auth_user_id,
        email,
        name,
        surname,
        address,
        oib,
        roles: selectedRoles,
        schoolId: selectedSchoolId,
        activeSchoolId: selectedSchoolId,
        status: status || 'ACTIVE',
        password: editingUser ? undefined : password
      };

      // Task 6: Debug log at start of save
      console.log("SAVE USER START", {
        userProfileId,
        payload,
        selectedRoles,
        selectedSchoolId
      });

      const response = await fetch(endpoint, {
        method: editingUser ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const text = await response.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (e) {
        console.error("USER JSON PARSE ERROR", e);
        console.log("USER RAW RESPONSE", text);
        throw new Error("Server nije vratio ispravan JSON odgovor: " + text);
      }

      console.log("USER RESPONSE STATUS", response.status);
      
      if (!response.ok || !data?.success) {
        const errorMsg = data?.error || data?.message || 'Neuspjela obrada zahtjeva';
        throw new Error(errorMsg);
      }

      // Task 6: Debug logs for update results
      console.log("SAVE USER PROFILE UPDATE RESULT", data.profileResult || data);
      console.log("SAVE USER ROLES UPDATE RESULT", data.rolesResult || selectedRoles);
      console.log("SAVE USER REFRESHED DATA", data.refreshedUser || data);

      toast.success(editingUser ? 'Korisnik uspješno ažuriran' : 'Korisnik uspješno kreiran');
      setIsModalOpen(false);
      await fetchUsers();
    } catch (err: any) {
      console.error("USER ACTION FAILED:", err);
      toast.error('Greška pri spremanju korisnika: ' + (err.message || 'Nepoznata greška'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAnyAdmin) return;
    
    if (!bulkData.trim()) {
      toast.error('Niste unijeli nijednog korisnika.');
      return;
    }

    setSubmitting(true);
    try {
      const usersToCreate = bulkData.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => {
          // Format: Ime Prezime | email@skolehr.xyz
          // or just Ime Prezime
          const parts = line.split('|');
          const namePart = parts[0].trim();
          const emailPart = parts.length > 1 ? parts[1].trim() : '';
          
          const nameTokens = namePart.split(' ');
          const name = nameTokens[0];
          const surname = nameTokens.slice(1).join(' ');

          return { name, surname, email: emailPart };
        });

      if (usersToCreate.length === 0) {
        toast.error('Format unosa nije prepoznat.');
        setSubmitting(false);
        return;
      }

      console.log("BULK CREATE SENDING", usersToCreate);

      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/admin/bulk-create-general', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {})
        },
        body: JSON.stringify({
          users: usersToCreate,
          role: bulkRole,
          schoolId: selectedSchoolId
        })
      });

      const text = await response.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (e) {
        console.error("BULK CREATE JSON PARSE ERROR", e);
        console.log("BULK CREATE RAW RESPONSE", text);
        throw new Error("Server nije vratio ispravan JSON odgovor.");
      }

      console.log("BULK CREATE USERS RESPONSE STATUS", response.status);
      console.log("BULK CREATE USERS RAW RESPONSE", text);
      if (!response.ok) throw new Error(data?.error || 'Neuspjela obrada');
      
      toast.success(`Uspješno kreirano ${data.results?.filter((r: any) => r.success).length || 0} korisnika.`);
      setIsBulkModalOpen(false);
      setBulkData('');
      fetchUsers();
    } catch (err: any) {
      console.error("BULK ACTION FAILED:", err);
      toast.error('Greška pri bulk kreiranju: ' + (err.message || 'Nepoznata greška'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (profileId: string, profile: any, soft: boolean = true) => {
    if (!isAnyAdmin) {
      toast.error('Nemate dozvolu za brisanje korisnika.');
      return;
    }

    console.log("DELETE USER CLICKED", { profileId, soft });

    const msg = soft 
      ? 'Jeste li sigurni da želite DEAKTIVIRATI ovog korisnika u ovoj školi? Povijesni podaci će ostati sačuvani.'
      : isMainAdmin 
        ? 'Jeste li sigurni da želite TRAJNO obrisati ovog korisnika i sve njegove podatke u cijelom sustavu?'
        : 'Jeste li sigurni da želite ukloniti uloge ovog korisnika u ovoj školi?';
      
    if (!confirm(msg)) return;
    
    try {
      setLoading(true);
      if (!soft && isMainAdmin) {
        console.log("PERFORMING PERMANENT DELETE AS MAIN ADMIN for user profile:", profileId);
        // Cascade delete helpers
        const results = await Promise.all([
          supabase.from('grades').delete().eq('student_id', profileId),
          supabase.from('absences').delete().eq('student_id', profileId),
          supabase.from('student_class_enrollments').delete().eq('student_id', profileId),
          supabase.from('student_subject_enrollments').delete().eq('student_id', profileId),
          supabase.from('student_year_summaries').delete().eq('student_id', profileId),
          supabase.from('user_school_roles').delete().eq('user_id', profileId),
        ]);
        console.log("CASCADE DELETE RESULTS:", results);
        
        const { data, error } = await supabase.from('user_profiles').delete().eq('id', profileId).select();
        console.log("FINAL USER PROFILE DELETE RESULT:", { data, error });
        if (error) throw error;
        toast.success('Korisnik je trajno obrisan iz sustava.');
      } else {
        const response = await fetch('/api/admin/delete-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId, schoolId: selectedSchoolId, softDelete: soft })
        });
        const data = await response.json();
        console.log("DELETE USER RESULT:", { status: response.status, data });
        if (!response.ok) throw new Error(data.error || 'Neuspjelo brisanje');
        toast.success(soft ? 'Korisnik deaktiviran' : 'Korisnik uklonjen iz škole');
      }
      fetchUsers();
    } catch (err: any) {
      console.error("DELETE USER FAILED:", err);
      toast.error('Brisanje nije uspjelo: ' + (err.message || 'Nepoznata greška'));
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(profile => {
    const matchesSearchTerm = 
      matchesSearch(profile?.name, searchTerm) || 
      matchesSearch(profile?.email, searchTerm);
    
    const matchesRole = roleFilter === 'ALL' || (profile.roles && profile.roles.includes(roleFilter));
    
    return matchesSearchTerm && matchesRole;
  }).sort((a,b) => (a.name || '').localeCompare(b.name || ''));

  const getRoleBadge = (role: string) => {
    switch (role) {
      case Role.SUPER_ADMIN:
      case Role.MAIN_ADMIN: return 'bg-red-100 text-red-700 font-bold';
      case Role.SCHOOL_ADMIN:
      case Role.ADMIN: return 'bg-purple-100 text-purple-700 font-bold';
      case Role.TEACHER: return 'bg-blue-100 text-blue-700';
      case Role.HOMEROOM: return 'bg-indigo-100 text-indigo-700';
      case Role.DEPUTY: return 'bg-sky-100 text-sky-700';
      case Role.STUDENT: return 'bg-emerald-100 text-emerald-700';
      case Role.PARENT: return 'bg-amber-100 text-amber-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <div className="p-4 md:p-6 font-sans w-full bg-[#f8fafc] min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b-2 border-slate-100 pb-4">
        <div>
          <button 
            onClick={() => navigate('/admin-skole')}
            className="flex items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors uppercase font-black text-[9px] tracking-widest mb-2"
          >
            <ChevronLeft size={12} strokeWidth={3} />
            Natrag na pregled
          </button>
          <h1 className="text-xl md:text-3xl font-black text-slate-900 tracking-tighter uppercase leading-tight mb-1">Korisnici i nastavnici</h1>
          <p className="text-slate-500 font-medium text-xs md:text-sm">Upravljanje pristupnim podacima i ulogama u školi</p>
        </div>
        
        {isAnyAdmin && (
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <button
              onClick={handleGenerateAuthenticatorsForAllStaff}
              disabled={loading}
              className="w-full sm:w-auto bg-amber-500 text-white px-5 py-2.5 rounded-lg font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-amber-600 transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <Shield size={16} strokeWidth={3} />
              Aktiviraj MFA svima
            </button>
            <button 
              onClick={handleOpenEmaticaImport}
              disabled={loadingEmaticaUsers || importingEmaticaUsers}
              className="w-full sm:w-auto bg-emerald-600 text-white px-5 py-2.5 rounded-lg font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={loadingEmaticaUsers || importingEmaticaUsers ? "animate-spin" : ""} size={16} strokeWidth={3} />
              Povuci iz e-Matice
            </button>
            <button 
              onClick={() => setIsBulkModalOpen(true)}
              className="w-full sm:w-auto bg-slate-100 text-[#005c8d] px-5 py-2.5 rounded-lg font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-slate-200 transition-all shadow-xs active:scale-95 cursor-pointer"
            >
              <UserPlus size={16} strokeWidth={3} />
              Dodaj više
            </button>
            <button 
              onClick={handleOpenCreate}
              className="w-full sm:w-auto bg-[#005c8d] text-white px-5 py-2.5 rounded-lg font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-[#004a71] transition-all shadow-md active:scale-95 cursor-pointer"
            >
              <UserPlus size={16} strokeWidth={3} />
              Novi korisnik
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="sm:col-span-2 bg-white px-3 py-2.5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-2.5">
          <Search className="text-slate-300 shrink-0" size={18} />
          <input 
            type="text" 
            placeholder="Pretraži po imenu ili emailu..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="bg-transparent border-none outline-none font-bold text-slate-900 text-xs w-full p-1"
          />
        </div>
        
        <div className="bg-white px-3 py-2.5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-2.5">
          <Filter className="text-slate-300 shrink-0" size={16} />
          <select 
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className="bg-transparent border-none outline-none font-bold text-slate-900 text-xs uppercase tracking-wider w-full p-1"
          >
            <option value="ALL">Sve uloge</option>
            <option value={Role.SCHOOL_ADMIN}>Administratori</option>
            <option value={Role.TEACHER}>Nastavnici</option>
            <option value={Role.STUDENT}>Učenici</option>
            <option value={Role.PARENT}>Roditelji</option>
          </select>
        </div>
      </div>

      <div className="space-y-4">
        {/* Desktop Table View */}
        <div className="hidden md:block bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 uppercase tracking-[0.15em] text-[10px] font-black text-slate-400">
                <th className="p-4">Korisnik</th>
                <th className="p-4">Email</th>
                <th className="p-4 text-center">Uloge</th>
                <th className="p-4 text-center">Status</th>
                <th className="p-4 text-right">Akcije</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredUsers.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                        <UserIcon size={20} />
                      </div>
                      <div className="font-black text-slate-900 uppercase text-xs tracking-tight">
                        {formatPersonName(item)}
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-xs font-bold text-slate-500 tracking-tight">
                    <div className="flex items-center gap-2">
                      <Mail size={14} className="text-slate-300" />
                      {item.email}
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex flex-wrap justify-center gap-1">
                      {item.roles.map((role: string) => (
                        <span key={role} className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${getRoleBadge(role)}`}>
                          {role}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className={`p-4 text-center font-black uppercase text-[9px] tracking-widest ${item.status === 'INACTIVE' ? 'text-red-400' : 'text-emerald-500'}`}>
                     {item.status === 'INACTIVE' ? (
                       <><XCircle size={12} className="inline mr-1" /> Neaktivan</>
                     ) : (
                       <><CheckCircle2 size={12} className="inline mr-1" /> Aktivan</>
                     )}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {isAnyAdmin && (
                        <>
                          <button 
                            onClick={() => handleOpenEdit(item)}
                            className="p-2 text-slate-400 hover:text-blue-500"
                          >
                            <ShieldCheck size={18} />
                          </button>
                          <button 
                            onClick={() => handleDeleteUser(item.id, item, true)}
                            className="p-2 text-slate-400 hover:text-amber-500"
                            title="Deaktiviraj korisnika"
                          >
                            <XCircle size={18} />
                          </button>
                          <button 
                            onClick={() => handleDeleteUser(item.id, item, false)}
                            className="p-2 text-slate-400 hover:text-red-500"
                            title="Trajno ukloni iz škole"
                          >
                            <Trash2 size={18} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-20 text-center text-slate-300 font-black uppercase tracking-[0.2em] text-xs">
                    Nijedan korisnik ne odgovara kriterijima
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile-First Cards View */}
        <div className="block md:hidden space-y-4">
          {filteredUsers.map((item) => {
            const isInactive = item.status === 'INACTIVE';
            return (
              <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col gap-3">
                <div className="flex items-start justify-between border-b border-slate-50 pb-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 shrink-0">
                      <UserIcon size={16} />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-slate-950 text-sm leading-tight uppercase">{formatPersonName(item)}</h3>
                      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                        <Mail size={12} className="text-slate-400" />
                        {item.email}
                      </p>
                    </div>
                  </div>
                  <div>
                    {isInactive ? (
                      <span className="text-[9px] font-black uppercase tracking-widest py-0.5 px-2 bg-red-50 text-red-700 border border-red-100 rounded">
                        Neaktivan
                      </span>
                    ) : (
                      <span className="text-[9px] font-black uppercase tracking-widest py-0.5 px-2 bg-green-50 text-green-700 border border-green-100 rounded">
                        Aktivan
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1 items-center">
                  <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wide mr-1 block">Uloge:</span>
                  {item.roles.map((role: string) => (
                    <span key={role} className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${getRoleBadge(role)}`}>
                      {role}
                    </span>
                  ))}
                </div>

                {isAnyAdmin && (
                  <div className="flex items-center gap-2 border-t border-slate-100 pt-3 mt-1 justify-end">
                    <button 
                      onClick={() => handleOpenEdit(item)}
                      className="flex-1 bg-slate-100 text-[#005c8d] active:bg-slate-200 p-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <ShieldCheck size={14} /> Postavi uloge
                    </button>
                    <button 
                      onClick={() => handleDeleteUser(item.id, item, true)}
                      className="p-2.5 bg-amber-50 hover:bg-amber-100 text-amber-600 rounded-lg transition-colors border border-amber-200"
                      title="Deaktiviraj"
                    >
                      <XCircle size={14} />
                    </button>
                    <button 
                      onClick={() => handleDeleteUser(item.id, item, false)}
                      className="p-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors border border-red-200"
                      title="Trajno obriši"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {filteredUsers.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 font-extrabold uppercase text-[10px]">
              Nijedan korisnik ne odgovara kriterijima
            </div>
          )}
        </div>
      </div>

      {/* e-Matica Import Modal */}
      {isEmaticaModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150 flex flex-col max-h-[90vh]">
            <div className="bg-emerald-700 p-5 text-white shrink-0 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm md:text-base font-black uppercase tracking-tight">
                  Povuci korisnike iz e-Matice
                </h2>
                <p className="text-emerald-100 text-[10px] font-black uppercase tracking-widest">
                  Odaberite samo korisnike koje želite povezati s ovom školom
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEmaticaModalOpen(false)}
                className="text-white/80 hover:text-white font-black text-lg"
              >
                ×
              </button>
            </div>

            <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row gap-3">
              <div className="flex-1 bg-white px-3 py-2.5 rounded-xl border border-slate-200 flex items-center gap-2.5">
                <Search className="text-slate-300 shrink-0" size={18} />
                <input
                  type="text"
                  value={ematicaSearch}
                  onChange={e => setEmaticaSearch(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      loadEmaticaUsers(ematicaSearch);
                    }
                  }}
                  placeholder="Pretraži ime ili email..."
                  className="bg-transparent border-none outline-none font-bold text-slate-900 text-xs w-full p-1"
                />
              </div>
              <button
                type="button"
                onClick={() => loadEmaticaUsers(ematicaSearch)}
                disabled={loadingEmaticaUsers}
                className="bg-white border border-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-100 disabled:opacity-50"
              >
                Pretraži
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              {loadingEmaticaUsers ? (
                <div className="p-12 text-center text-slate-400 font-black uppercase tracking-widest text-xs">
                  Učitavanje korisnika...
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {ematicaUsers.map((item) => {
                    const checked = selectedEmaticaUserIds.includes(item.id);
                    return (
                      <label
                        key={item.id}
                        className={`flex items-center gap-4 p-4 cursor-pointer transition-colors ${checked ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleEmaticaUser(item.id)}
                          className="w-4 h-4 accent-emerald-700"
                        />
                        <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 shrink-0">
                          <UserIcon size={20} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-black text-slate-900 uppercase text-xs tracking-tight">
                            {formatPersonName(item)}
                          </div>
                          <div className="text-xs text-slate-500 font-semibold truncate">
                            {item.email || 'Nema email adrese'}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${getRoleBadge(item.role || Role.TEACHER)}`}>
                            {item.role || 'TEACHER'}
                          </span>
                          {item.assignedToSelectedSchool && (
                            <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-amber-100 text-amber-700">
                              Već povezan
                            </span>
                          )}
                        </div>
                      </label>
                    );
                  })}

                  {ematicaUsers.length === 0 && (
                    <div className="p-12 text-center text-slate-400 font-black uppercase tracking-widest text-xs">
                      Nema korisnika za prikaz
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-white flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-slate-500 font-bold">
                Odabrano: {selectedEmaticaUserIds.length}
              </div>
              <div className="flex gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setIsEmaticaModalOpen(false)}
                  disabled={importingEmaticaUsers}
                  className="flex-1 sm:flex-none bg-slate-100 text-slate-700 px-5 py-3 rounded-lg font-black uppercase tracking-wider text-[10px]"
                >
                  Odustani
                </button>
                <button
                  type="button"
                  onClick={handleImportSelectedEmaticaUsers}
                  disabled={importingEmaticaUsers || selectedEmaticaUserIds.length === 0}
                  className="flex-1 sm:flex-none bg-emerald-700 text-white px-5 py-3 rounded-lg font-black uppercase tracking-wider text-[10px] disabled:opacity-50"
                >
                  {importingEmaticaUsers ? 'Povlačenje...' : 'Povuci odabrane'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Modal */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150 flex flex-col max-h-[90vh]">
            <div className="bg-[#005c8d] p-5 text-white shrink-0">
              <h2 className="text-sm md:text-base font-black uppercase tracking-tight">
                Dodaj više korisnika
              </h2>
              <p className="text-blue-100 text-[10px] font-black uppercase tracking-widest">Masovni unos</p>
            </div>
            
            <form onSubmit={handleBulkSubmit} className="p-4 md:p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">Uloga za sve unesene korisnike</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[Role.ADMIN, Role.TEACHER, Role.STUDENT, Role.PARENT].map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setBulkRole(role)}
                      className={`p-2.5 rounded-lg border-2 text-[9px] font-black uppercase tracking-widest transition-all ${
                        bulkRole === role 
                        ? 'bg-blue-50 border-[#005c8d] text-[#005c8d]' 
                        : 'bg-[#f8f9fa] border-[#dee2e6] text-[#868e96] hover:border-[#ced4da]'
                      }`}
                    >
                      {role === Role.TEACHER ? 'Nastavnik' : 
                       role === Role.STUDENT ? 'Učenik' :
                       role === Role.PARENT ? 'Roditelj' : 'Admin Škole'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">
                  Popis korisnika (jedan po redu)
                </label>
                <p className="text-xs text-slate-500 mb-1.5">
                  Format: <strong>Ime Prezime | email@skolehr.xyz</strong> ili samo <strong>Ime Prezime</strong>
                </p>
                <textarea 
                  value={bulkData}
                  onChange={e => setBulkData(e.target.value)}
                  className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-lg p-3 font-mono text-xs text-slate-900 focus:border-[#005c8d] outline-none h-40 resize-y"
                  placeholder="Nikola Đurić | nikola.duric@skolehr.xyz&#10;Ana Kovač | ana.kovac@skolehr.xyz"
                  required
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-[#dee2e6] mt-4">
                <button 
                  type="button"
                  onClick={() => setIsBulkModalOpen(false)}
                  disabled={submitting}
                  className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-lg font-black uppercase tracking-wider text-[10px]"
                >
                  Odustani
                </button>
                <button 
                  type="submit"
                  disabled={submitting}
                  className={`flex-1 ${submitting ? 'bg-slate-400' : 'bg-[#005c8d]'} text-white py-3 rounded-lg font-black uppercase tracking-wider text-[10px] shadow-sm flex items-center justify-center gap-2 active:scale-98`}
                >
                  {submitting ? 'Obrada...' : 'Stvori'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150 flex flex-col max-h-[90vh]">
            <div className="bg-[#005c8d] p-4 md:p-5 text-white shrink-0">
              <h2 className="text-sm md:text-base font-black uppercase tracking-tight">
                {editingUser ? 'Uredi korisnika' : 'Novi korisnik'}
              </h2>
              <p className="text-blue-100 text-[10px] font-black uppercase tracking-widest">Administracija pristupa</p>
            </div>
            
            <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Ime</label>
                  <input 
                    type="text" 
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-md p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Prezime</label>
                  <input 
                    type="text" 
                    value={surname}
                    onChange={e => setSurname(e.target.value)}
                    className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-md p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Email adresa</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-md p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] outline-none"
                  required
                />
              </div>

              {!editingUser && (
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Privremena lozinka</label>
                  <input 
                    type="text" 
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-md p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] outline-none"
                    required
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Adresa</label>
                  <input 
                    type="text" 
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-md p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">OIB</label>
                  <input 
                    type="text" 
                    maxLength={11}
                    value={oib}
                    onChange={e => {
                      const value = e.target.value.replace(/\D/g, '');
                      setOib(value.slice(0, 11));
                    }}
                    className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-md p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] outline-none"
                  />
                </div>
              </div>

              {editingUser && (
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Status korisnika</label>
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
                    className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-md p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] outline-none"
                  >
                    <option value="ACTIVE">Aktivan</option>
                    <option value="INACTIVE">Neaktivan / Deaktiviran</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">Uloge u školi (odaberi više)</label>
                <div className="grid grid-cols-2 gap-2">
                  {[Role.TEACHER, Role.STUDENT, Role.PARENT, Role.SCHOOL_ADMIN, Role.HOMEROOM, Role.DEPUTY].map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => toggleRole(role)}
                      className={`p-2.5 rounded-lg border-2 text-[9px] font-black uppercase tracking-widest transition-all ${
                        selectedRoles.includes(role) 
                        ? 'bg-blue-50 border-[#005c8d] text-[#005c8d]' 
                        : 'bg-[#f8f9fa] border-[#dee2e6] text-[#868e96] hover:border-[#ced4da]'
                      }`}
                    >
                      {role === Role.TEACHER ? 'Nastavnik' : 
                       role === Role.STUDENT ? 'Učenik' :
                       role === Role.PARENT ? 'Roditelj' :
                       role === Role.SCHOOL_ADMIN ? 'Admin Škole' :
                       role === Role.HOMEROOM ? 'Razrednik' : 'Zamjenik'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-[#dee2e6] mt-4 shrink-0">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting}
                  className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-lg font-black uppercase tracking-wider text-[10px]"
                >
                  Odustani
                </button>
                <button 
                  type="submit"
                  disabled={submitting}
                  className={`flex-1 ${submitting ? 'bg-slate-400' : 'bg-[#005c8d]'} text-white py-3 rounded-lg font-black uppercase tracking-wider text-[10px] shadow-sm flex items-center justify-center gap-2 active:scale-98`}
                >
                  {submitting ? 'Obrada...' : editingUser ? 'Spremi' : 'Stvori'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sync Report Modal */}
      {isReportModalOpen && syncReport && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
            {/* Header */}
            <div className="p-5 bg-gradient-to-r from-emerald-700 to-teal-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/15 rounded-xl backdrop-blur-md">
                  <RefreshCw size={22} className="text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-black uppercase tracking-tight">Izvještaj sinkronizacije e-Dnevnika</h3>
                  <p className="text-emerald-100 text-xs font-medium">Usporedba e-Dnevnika i Supabase baze podataka</p>
                </div>
              </div>
              <button 
                onClick={() => setIsReportModalOpen(false)}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors text-white font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Summary Cards Grid */}
            <div className="p-5 bg-slate-50 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">Učenici</span>
                <span className="text-2xl font-black text-slate-900">{syncReport.summary.students}</span>
              </div>
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">Nastavnici</span>
                <span className="text-2xl font-black text-[#005c8d]">{syncReport.summary.teachers}</span>
              </div>
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">Administratori</span>
                <span className="text-2xl font-black text-purple-700">{syncReport.summary.schoolAdmins + syncReport.summary.systemAdmins}</span>
              </div>
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">Ukupno u bazi</span>
                <span className="text-2xl font-black text-emerald-600">{syncReport.summary.totalUsers}</span>
              </div>
            </div>

            {/* Sub-summary Badges */}
            <div className="px-5 py-3 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-3 font-bold">
                <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-[11px]">
                  + {syncReport.summary.newUsers} novih korisnika kreirano
                </span>
                <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-[11px]">
                  ⚡ {syncReport.summary.updatedUsers} korisnika ažurirano/povezano
                </span>
              </div>
              <span className="text-slate-400 text-[10px] font-mono">
                {new Date(syncReport.timestamp).toLocaleString('hr-HR')}
              </span>
            </div>

            {/* Details Table */}
            <div className="p-5 overflow-y-auto flex-1 space-y-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">Detalji po korisniku</h4>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="p-3">Korisnik / Email</th>
                      <th className="p-3">Uloga</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Poruka</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {syncReport.details && syncReport.details.length > 0 ? (
                      syncReport.details.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3">
                            <div className="font-bold text-slate-900">{item.name || item.email?.split('@')[0]}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{item.email}</div>
                          </td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold text-[10px] uppercase">
                              {item.role || 'USER'}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className={`px-2.5 py-1 rounded-md font-extrabold text-[10px] uppercase tracking-wider inline-flex items-center gap-1 ${
                              item.status === 'CREATED' ? 'bg-emerald-100 text-emerald-700' :
                              item.status === 'UPDATED' || item.status === 'LINKED' ? 'bg-blue-100 text-blue-700' :
                              item.status === 'ERROR' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {item.status === 'CREATED' && <Check size={12} />}
                              {item.status}
                            </span>
                          </td>
                          <td className="p-3 text-[11px] text-slate-500">{item.message}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-slate-400 italic">
                          Svi korisnici su već u potpunosti sinkronizirani.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-100 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setIsReportModalOpen(false)}
                className="bg-[#005c8d] text-white px-6 py-2.5 rounded-xl font-black uppercase text-[11px] tracking-wider hover:bg-[#004a71] transition-all shadow-md cursor-pointer"
              >
                Zatvori izvještaj
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkStaffTotp.length > 0 && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[210] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col border border-white/20">
            <div className="p-5 bg-[#005c8d] text-white flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black uppercase tracking-tight">Microsoft Authenticator kodovi</h3>
                <p className="text-blue-100 text-xs font-medium mt-1">Skenirajte QR kodove redom iz Microsoft Authenticator aplikacije.</p>
              </div>
              <button
                onClick={() => setBulkStaffTotp([])}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                aria-label="Zatvori"
              >
                <X size={20} strokeWidth={3} />
              </button>
            </div>

            <div className="p-4 bg-amber-50 border-b border-amber-200 text-[11px] font-bold text-amber-800 leading-relaxed">
              Generirani su novi Authenticator ključevi za prikazane korisnike. Ako korisnik već ima dodan stari račun u aplikaciji, treba ga obrisati i skenirati novi QR kod.
            </div>

            <div className="p-5 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {bulkStaffTotp.map(item => (
                  <div key={item.id} className="border border-slate-200 rounded-xl bg-white shadow-sm p-4 space-y-3">
                    <div className="border-b border-slate-100 pb-2">
                      <div className="text-sm font-black text-slate-900 uppercase leading-tight">{item.name}</div>
                      <div className="text-[10px] font-bold text-slate-400 break-all">{item.email || 'Bez e-mail adrese'}</div>
                    </div>
                    <div className="flex items-center gap-4">
                      <img src={item.qrCode} alt={`Microsoft Authenticator QR kod za ${item.name}`} className="w-32 h-32 border border-slate-200 bg-white p-1 rounded-lg" />
                      <div className="min-w-0 space-y-2">
                        <div>
                          <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Ručni ključ</div>
                          <code className="block text-[11px] font-black tracking-widest break-all bg-slate-50 border border-slate-200 p-2 rounded-lg text-[#005c8d]">{item.secret}</code>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(item.secret);
                            toast.success('Ključ kopiran');
                          }}
                          className="text-[9px] font-black uppercase text-[#005c8d] hover:underline cursor-pointer"
                        >
                          Kopiraj ključ
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  const printWindow = window.open('', '_blank');
                  if (!printWindow) return;
                  const cards = bulkStaffTotp.map(item => `
                    <section class="card">
                      <h2>${item.name}</h2>
                      <p>${item.email || ''}</p>
                      <img src="${item.qrCode}" />
                      <div class="secret">${item.secret}</div>
                    </section>
                  `).join('');
                  printWindow.document.write(`
                    <html>
                      <head>
                        <title>Microsoft Authenticator kodovi</title>
                        <style>
                          body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
                          h1 { color: #005c8d; font-size: 22px; text-transform: uppercase; margin: 0 0 16px; }
                          .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
                          .card { border: 1px solid #cbd5e1; padding: 16px; break-inside: avoid; }
                          h2 { font-size: 15px; margin: 0 0 4px; text-transform: uppercase; }
                          p { font-size: 11px; margin: 0 0 12px; color: #64748b; }
                          img { width: 160px; height: 160px; display: block; margin-bottom: 10px; }
                          .secret { font-family: monospace; font-size: 13px; font-weight: 700; letter-spacing: 2px; border: 1px dashed #005c8d; padding: 8px; color: #005c8d; word-break: break-all; }
                          @media print { body { padding: 12px; } }
                        </style>
                      </head>
                      <body onload="window.print()">
                        <h1>Microsoft Authenticator kodovi</h1>
                        <div class="grid">${cards}</div>
                      </body>
                    </html>
                  `);
                  printWindow.document.close();
                }}
                className="bg-slate-800 text-white px-5 py-2.5 rounded-xl font-black uppercase text-[11px] tracking-wider hover:bg-slate-950 transition-all shadow-md cursor-pointer flex items-center justify-center gap-2"
              >
                <Printer size={14} strokeWidth={3} /> Printaj sve kodove
              </button>
              <button
                type="button"
                onClick={() => setBulkStaffTotp([])}
                className="bg-[#005c8d] text-white px-5 py-2.5 rounded-xl font-black uppercase text-[11px] tracking-wider hover:bg-[#004a71] transition-all shadow-md cursor-pointer"
              >
                Gotovo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
