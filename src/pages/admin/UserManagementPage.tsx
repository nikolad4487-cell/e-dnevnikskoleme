import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useSelection } from '../../contexts/SelectionContext';
import { useAuth } from '../../contexts/AuthContext';
import { User, Role } from '../../types';
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
  Trash2
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

export default function UserManagementPage() {
  const { selectedSchoolId } = useSelection();
  const { isMainAdmin, userSchoolRoles } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');

  const isAnyAdmin = isMainAdmin || userSchoolRoles.some(r => r.schoolId === selectedSchoolId && (r.role === Role.SCHOOL_ADMIN || r.role === Role.ADMIN));

  // Form State
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('Demo1234!');
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [address, setAddress] = useState('');
  const [oib, setOib] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<Role[]>([Role.TEACHER]);
  const [submitting, setSubmitting] = useState(false);

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
    setEmail(user.email);
    setName(user.name || '');
    setSurname(user.surname || '');
    setAddress(user.address || '');
    setOib(user.oib || '');
    setSelectedRoles(user.roles);
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
    setSelectedRoles([Role.TEACHER]);
    setIsModalOpen(true);
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
      const { data, error } = await supabase
        .from('user_school_roles')
        .select(`
          id,
          role,
          status,
          user:user_profiles (*)
        `)
        .eq('school_id', selectedSchoolId);
      
      if (error) throw error;
      
      const usersMap = new Map();
      data?.forEach(row => {
        const profile = row.user as any;
        const userId = profile?.id;
        if (!userId) return;
        
        if (!usersMap.has(userId)) {
          usersMap.set(userId, { ...profile, roles: [] });
        }
        usersMap.get(userId).roles.push(row.role);
      });
      
      setUsers(Array.from(usersMap.values()));
    } catch (err: any) {
      toast.error('Greška pri učitavanju korisnika');
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
    if (selectedRoles.length === 0) {
      toast.error('Odaberite barem jednu ulogu');
      return;
    }
    setSubmitting(true);
    try {
      const endpoint = editingUser ? '/api/admin/update-user' : '/api/admin/create-user';
      const payload = {
        profileId: editingUser?.id,
        authUserId: editingUser?.auth_user_id,
        email,
        name,
        surname,
        address,
        oib,
        roles: selectedRoles,
        schoolId: selectedSchoolId,
        status: editingUser?.status || 'ACTIVE',
        password: editingUser ? undefined : password
      };

      console.log(`${editingUser ? 'UPDATE' : 'CREATE'} USER CLICKED`, payload);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      console.log("USER ACTION RESULT:", { status: response.status, data });
      
      if (!response.ok) throw new Error(data.error || 'Neuspjela obrada zahtjeva');

      toast.success(editingUser ? 'Korisnik ažuriran' : 'Korisnik uspješno kreiran');
      setIsModalOpen(false);
      fetchUsers();
    } catch (err: any) {
      console.error("USER ACTION FAILED:", err);
      toast.error('Greška pri spremanju korisnika: ' + (err.message || 'Nepoznata greška'));
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
    const matchesSearch = 
      profile?.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      profile?.surname?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      profile?.email?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRole = roleFilter === 'ALL' || profile.roles.includes(roleFilter);
    
    return matchesSearch && matchesRole;
  });

  const getRoleBadge = (role: string) => {
    switch (role) {
      case Role.SCHOOL_ADMIN: return 'bg-purple-100 text-purple-700';
      case Role.TEACHER: return 'bg-blue-100 text-blue-700';
      case Role.HOMEROOM: return 'bg-indigo-100 text-indigo-700';
      case Role.STUDENT: return 'bg-emerald-100 text-emerald-700';
      case Role.PARENT: return 'bg-amber-100 text-amber-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <div className="p-6 font-sans max-w-7xl mx-auto">
      <div className="flex justify-between items-end mb-8 border-b-2 border-slate-100 pb-6">
        <div>
          <button 
            onClick={() => navigate('/admin/school-dashboard')}
            className="flex items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors uppercase font-black text-[9px] tracking-widest mb-4"
          >
            <ChevronLeft size={12} strokeWidth={3} />
            Natrag na pregled
          </button>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none mb-2">Korisnici i nastavnici</h1>
          <p className="text-slate-500 font-medium text-sm">Upravljanje pristupnim podacima i ulogama u školi</p>
        </div>
        
        {isAnyAdmin && (
          <button 
            onClick={handleOpenCreate}
            className="bg-[#005c8d] text-white px-6 py-3 rounded-xl font-black uppercase tracking-widest text-xs flex items-center gap-2 hover:bg-[#004a71] transition-all shadow-lg active:scale-95"
          >
            <UserPlus size={18} strokeWidth={3} />
            Novi korisnik
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <Search className="text-slate-300" size={20} />
          <input 
            type="text" 
            placeholder="Pretraži po imenu ili emailu..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="bg-transparent border-none outline-none font-bold text-slate-900 w-full"
          />
        </div>
        
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
          <Filter className="text-slate-300" size={18} />
          <select 
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className="bg-transparent border-none outline-none font-bold text-slate-900 text-sm uppercase tracking-wider"
          >
            <option value="ALL">Sve uloge</option>
            <option value={Role.SCHOOL_ADMIN}>Administratori</option>
            <option value={Role.TEACHER}>Nastavnici</option>
            <option value={Role.STUDENT}>Učenici</option>
            <option value={Role.PARENT}>Roditelji</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
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
                      {item.name} {item.surname}
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

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-[#005c8d] p-8 text-white relative">
              <div className="absolute top-8 right-8 text-white/30">
                <ShieldCheck size={48} strokeWidth={1} />
              </div>
              <h2 className="text-2xl font-black uppercase tracking-tighter leading-none mb-2">
                {editingUser ? 'Uredi korisnika' : 'Novi korisnik'}
              </h2>
              <p className="text-blue-100 text-xs font-bold uppercase tracking-widest">Administracija pristupa</p>
            </div>
            
            <form onSubmit={handleSubmit} className="p-8 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Ime</label>
                  <input 
                    type="text" 
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 font-bold text-slate-900 focus:border-[#005c8d] outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Prezime</label>
                  <input 
                    type="text" 
                    value={surname}
                    onChange={e => setSurname(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 font-bold text-slate-900 focus:border-[#005c8d] outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Email adresa</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 font-bold text-slate-900 focus:border-[#005c8d] outline-none"
                  required
                />
              </div>

              {!editingUser && (
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Privremena lozinka</label>
                  <input 
                    type="text" 
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 font-bold text-slate-900 focus:border-[#005c8d] outline-none"
                    required
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Adresa</label>
                  <input 
                    type="text" 
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 font-bold text-slate-900 focus:border-[#005c8d] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">OIB</label>
                  <input 
                    type="text" 
                    value={oib}
                    onChange={e => setOib(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl p-3 font-bold text-slate-900 focus:border-[#005c8d] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Uloge u školi (odaberi više)</label>
                <div className="grid grid-cols-2 gap-2">
                  {[Role.TEACHER, Role.STUDENT, Role.PARENT, Role.SCHOOL_ADMIN, Role.HOMEROOM, Role.DEPUTY].map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => toggleRole(role)}
                      className={`p-3 rounded-lg border-2 text-[9px] font-black uppercase tracking-widest transition-all ${
                        selectedRoles.includes(role) 
                        ? 'bg-blue-50 border-[#005c8d] text-[#005c8d]' 
                        : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-200'
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

              <div className="flex gap-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting}
                  className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-xl font-black uppercase tracking-widest text-[10px]"
                >
                  Odustani
                </button>
                <button 
                  type="submit"
                  disabled={submitting}
                  className={`flex-1 ${submitting ? 'bg-slate-400' : 'bg-[#005c8d]'} text-white py-4 rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg flex items-center justify-center gap-2`}
                >
                  {submitting ? 'Obrada...' : editingUser ? 'Spremi promjene' : 'Stvori korisnika'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
