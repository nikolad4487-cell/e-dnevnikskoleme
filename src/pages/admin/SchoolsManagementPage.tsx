import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { School, Role, SchoolType, SecondarySubtype } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, ExternalLink, School as SchoolIcon, Shield, MapPin, Phone, Mail, FileText, CheckCircle2, AlertTriangle, ArrowLeft } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface ExtSchoolFields {
  address: string;
  oib: string;
  phone: string;
  email: string;
  principal: string;
  status: string;
}

export function parseSchoolAddress(addressString: string | null | undefined): ExtSchoolFields {
  const defaultFields: ExtSchoolFields = {
    address: '',
    oib: '',
    phone: '',
    email: '',
    principal: '',
    status: 'ACTIVE'
  };

  const cleanString = (addressString || '').trim();
  if (cleanString.startsWith('{') && cleanString.endsWith('}')) {
    try {
      const parsed = JSON.parse(cleanString);
      return {
        address: parsed.address || '',
        oib: parsed.oib || '',
        phone: parsed.phone || '',
        email: parsed.email || '',
        principal: parsed.principal || '',
        status: parsed.status || 'ACTIVE'
      };
    } catch (e) {
      // Ignored, fallback below
    }
  }

  return {
    ...defaultFields,
    address: cleanString
  };
}

export default function SchoolsManagementPage() {
  const { user, isMainAdmin, userSchoolRoles } = useAuth();
  const { setSelectedSchoolId, selectedSchoolId } = useSelection();
  const navigate = useNavigate();
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [roleCounts, setRoleCounts] = useState<Record<string, { students: number, teachers: number }>>({});
  
  // Form State
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<SchoolType>('SECONDARY');
  const [subtype, setSubtype] = useState<SecondarySubtype | null>(null);
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [oib, setOib] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [principal, setPrincipal] = useState('');
  const [status, setStatus] = useState('ACTIVE');

  // We allow access for main admin, but also school admins might view, although main admin can create/edit/delete.
  // The user says "Prikazati samo admin korisnicima", which implies MAIN_ADMIN or SCHOOL_ADMIN.
  const hasEditPrivilege = isMainAdmin;

  useEffect(() => {
    fetchSchools();
  }, []);

  const fetchSchools = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('schools').select('*').order('name');
      if (error) throw error;
      setSchools(data || []);

      // Fetch user school roles counts
      const { data: roles, error: rolesError } = await supabase
        .from('user_school_roles')
        .select('school_id, role');
      
      if (!rolesError && roles) {
        const counts: Record<string, { students: number, teachers: number }> = {};
        roles.forEach(roleRow => {
          const sId = roleRow.school_id;
          if (!counts[sId]) {
            counts[sId] = { students: 0, teachers: 0 };
          }
          if (roleRow.role === 'STUDENT') {
            counts[sId].students++;
          } else if (['TEACHER', 'HOMEROOM', 'DEPUTY'].includes(roleRow.role)) {
            counts[sId].teachers++;
          }
        });
        setRoleCounts(counts);
      }
    } catch (err: any) {
      toast.error('Greška pri učitavanju škola: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (school?: School) => {
    if (school) {
      const parsed = parseSchoolAddress(school.address);
      setEditingSchool(school);
      setName(school.name);
      setType(school.type);
      setSubtype(school.subtype || null);
      setCity(school.city || '');
      setAddress(parsed.address);
      setOib(parsed.oib);
      setPhone(parsed.phone);
      setEmail(parsed.email);
      setPrincipal(parsed.principal);
      setStatus(parsed.status);
    } else {
      setEditingSchool(null);
      setName('');
      setType('SECONDARY');
      setSubtype(null);
      setCity('');
      setAddress('');
      setOib('');
      setPhone('');
      setEmail('');
      setPrincipal('');
      setStatus('ACTIVE');
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasEditPrivilege) {
      toast.error('Nemate ovlasti za uređivanje škola.');
      return;
    }
    if (!oib || oib.length !== 11) {
      toast.error('OIB mora sadržavati točno 11 znamenki.');
      return;
    }
    
    try {
      const serializedAddress = JSON.stringify({
        address,
        oib,
        phone,
        email,
        principal,
        status
      });

      const payload = {
        name,
        type,
        education_level: type === 'PRIMARY' ? 'ELEMENTARY' : type,
        subtype: type === 'SECONDARY' ? subtype : null,
        city,
        address: serializedAddress
      };

      if (editingSchool) {
        const { error } = await supabase.from('schools').update(payload).eq('id', editingSchool.id);
        if (error) throw error;
        toast.success('Škola uspješno ažurirana');
      } else {
        const id = 'sch-' + name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Math.random().toString(36).substr(2, 4);
        const { error } = await supabase.from('schools').insert([{ ...payload, id }]);
        if (error) throw error;
        toast.success('Škola uspješno dodana');
      }
      
      setIsModalOpen(false);
      fetchSchools();
    } catch (err: any) {
      toast.error('Greška pri spremanju škole: ' + (err.message || 'Nepoznata greška'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!hasEditPrivilege) {
      toast.error('Nemate ovlasti za brisanje škola.');
      return;
    }
    
    if (!window.confirm('Jeste li sigurni da želite obrisati ovu školu i SVE njezine podatke (korisnike, razrede, ocjene)? Ova radnja je nepovratna.')) return;
    
    setLoading(true);
    try {
      const { error } = await supabase.from('schools').delete().eq('id', id);
      if (error) throw error;
      toast.success('Škola i svi njezini podaci su obrisani.');
      fetchSchools();
    } catch (err: any) {
      toast.error('Greška pri brisanju škole: ' + (err.message || 'Nepoznata greška'));
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSchool = (id: string) => {
    setSelectedSchoolId(id);
    navigate('/admin-skole');
  };

  return (
    <div className="p-6 font-sans bg-[#f8f9fa] min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 border-b border-[#dee2e6] pb-6">
          <div>
            <div className="flex items-center gap-2 text-[#005c8d] text-xs font-black uppercase tracking-widest mb-2 cursor-pointer hover:underline" onClick={() => navigate('/admin-skole')}>
              <ArrowLeft size={14} /> Natrag u administraciju
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none mb-2">Popis i upravljanje školama</h1>
            <p className="text-slate-500 font-medium text-sm">Cjelovita administracija registriranih obrazovnih ustanova</p>
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={() => navigate('/select-school')}
              className="bg-white text-slate-700 border border-slate-300 px-5 py-3 rounded-sm font-black uppercase tracking-wider text-[10px] hover:bg-slate-50 transition-all cursor-pointer shadow-sm"
            >
              Promijeni aktivnu školu
            </button>
            {hasEditPrivilege && (
              <button 
                id="add-school-btn"
                onClick={() => handleOpenModal()}
                className="bg-[#005c8d] text-white px-5 py-3 rounded-sm font-black uppercase tracking-wider text-[10px] flex items-center gap-2 hover:bg-[#004a71] transition-all cursor-pointer shadow-sm active:scale-95"
              >
                <Plus size={14} strokeWidth={3} />
                Nova škola
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20 animate-pulse text-slate-300">
            <SchoolIcon size={48} />
          </div>
        ) : (
          <div className="bg-white border border-[#dee2e6] rounded-sm overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#f1f3f5] border-b border-[#dee2e6] text-[11px] font-black uppercase tracking-wider text-slate-600">
                  <th className="px-6 py-4">Naziv škole</th>
                  <th className="px-6 py-4">Grad</th>
                  <th className="px-6 py-4">Ravnatelj / OIB</th>
                  <th className="px-6 py-4 text-center">Učenici</th>
                  <th className="px-6 py-4 text-center">Nastavnici</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Akcije</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#dee2e6]">
                {schools.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-400 italic">
                      Nema registriranih škola u sustavu.
                    </td>
                  </tr>
                ) : (
                  schools.map(school => {
                    const parsed = parseSchoolAddress(school.address);
                    const stats = roleCounts[school.id] || { students: 0, teachers: 0 };
                    const isArchived = parsed.status === 'ARCHIVED';

                    return (
                      <tr key={school.id} className="hover:bg-[#f8f9fa] transition-colors group">
                        <td className="px-6 py-5">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-slate-100 rounded-sm flex items-center justify-center text-[#005c8d]">
                              <SchoolIcon size={16} strokeWidth={2.5} />
                            </div>
                            <div>
                              <div className="font-extrabold text-slate-800 text-sm uppercase leading-snug">{school.name}</div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[9px] font-black uppercase tracking-tight text-slate-500">
                                  {school.type === 'PRIMARY' ? 'Osnovna' : school.type === 'HIGHER' ? 'Fakultet' : 'Srednja'}
                                </span>
                                {school.subtype && (
                                  <span className="text-[9px] font-bold text-[#005c8d] uppercase tracking-tight">
                                    • {school.subtype === 'GENERAL' ? 'Gimnazija' : 'Strukovna'}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <span className="text-xs font-bold text-slate-700">{school.city || '—'}</span>
                          <div className="text-[10px] text-slate-400 max-w-xs truncate">{parsed.address || '—'}</div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="text-xs font-extrabold text-slate-700 uppercase">{parsed.principal || '—'}</div>
                          <div className="text-[10px] text-slate-400">OIB: {parsed.oib || '—'}</div>
                        </td>
                        <td className="px-6 py-5 text-center font-extrabold text-xs text-slate-700">
                          {stats.students}
                        </td>
                        <td className="px-6 py-5 text-center font-extrabold text-xs text-slate-700">
                          {stats.teachers}
                        </td>
                        <td className="px-6 py-5">
                          {isArchived ? (
                            <span className="text-[9px] font-black uppercase tracking-wider py-1 px-2.5 bg-amber-100 text-amber-800 rounded">
                              ARHIVIRANA
                            </span>
                          ) : (
                            <span className="text-[9px] font-black uppercase tracking-wider py-1 px-2.5 bg-green-100 text-green-800 rounded">
                              AKTIVNA
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleSelectSchool(school.id)}
                              className="inline-flex items-center gap-1 bg-[#005c8d] text-white py-1.5 px-3 rounded-sm text-[9px] font-black uppercase tracking-widest hover:bg-[#004a70] transition-colors cursor-pointer"
                              title="Otvori školu"
                            >
                              OtvorI
                            </button>
                            {hasEditPrivilege && (
                              <>
                                <button
                                  onClick={() => handleOpenModal(school)}
                                  className="p-1 px-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-sm cursor-pointer transition-colors"
                                  title="Uredi"
                                >
                                  <Edit2 size={13} />
                                </button>
                                <button
                                  onClick={() => handleDelete(school.id)}
                                  className="p-1 px-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-sm cursor-pointer transition-colors"
                                  title="Obriši"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Form Dialog Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-sm shadow-2xl overflow-hidden border border-[#dee2e6] animate-in fade-in duration-150">
            <div className="bg-[#005c8d] p-6 text-white flex items-center justify-between">
              <h2 className="text-lg font-black uppercase tracking-tight">
                {editingSchool ? 'Uredi školu' : 'Nova škola'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-white/80 hover:text-white font-extrabold text-sm uppercase">[ Zatvori ]</button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Naziv škole</label>
                  <input 
                    type="text" 
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] focus:bg-white outline-none transition-all"
                    placeholder="npr. Srednja škola Glina"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Tip škole</label>
                  <select
                    value={type}
                    onChange={e => setType(e.target.value as SchoolType)}
                    className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] outline-none transition-all"
                  >
                    <option value="PRIMARY">Osnovna škola</option>
                    <option value="SECONDARY">Srednja škola</option>
                    <option value="HIGHER">Fakultet</option>
                  </select>
                </div>

                {type === 'SECONDARY' && (
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Podtip srednje škole</label>
                    <select
                      value={subtype || ''}
                      onChange={e => setSubtype((e.target.value || null) as SecondarySubtype | null)}
                      className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] outline-none transition-all"
                    >
                      <option value="">Nema (Općenito)</option>
                      <option value="GENERAL">Gimnazija</option>
                      <option value="VOCATIONAL">Strukovna škola</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Grad</label>
                  <input 
                    type="text" 
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] focus:bg-white outline-none transition-all"
                    placeholder="npr. Glina"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Adresa</label>
                  <input 
                    type="text" 
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] focus:bg-white outline-none transition-all"
                    placeholder="npr. Frankopanska 30"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">OIB škole</label>
                  <input 
                    type="text" 
                    maxLength={11}
                    value={oib}
                    onChange={e => {
                      const value = e.target.value.replace(/\D/g, '');
                      setOib(value.slice(0, 11));
                    }}
                    className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] focus:bg-white outline-none transition-all"
                    placeholder="11-znamenkasti broj"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Ravnatelj / voditelj</label>
                  <input 
                    type="text" 
                    value={principal}
                    onChange={e => setPrincipal(e.target.value)}
                    className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] focus:bg-white outline-none transition-all"
                    placeholder="Ime i prezime ravnatelja"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">E-mail adresa ureda</label>
                  <input 
                    type="email" 
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] focus:bg-white outline-none transition-all"
                    placeholder="ureda@skole.hr"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Telefon</label>
                  <input 
                    type="text" 
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] focus:bg-white outline-none transition-all"
                    placeholder="npr. 044/555-666"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Status škole u programu</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-slate-800">
                    <input 
                      type="radio" 
                      name="status" 
                      value="ACTIVE"
                      checked={status === 'ACTIVE'}
                      onChange={() => setStatus('ACTIVE')}
                      className="accent-[#005c8d]"
                    />
                    Aktivna škola (koristi se tekući rad)
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-slate-800">
                    <input 
                      type="radio" 
                      name="status" 
                      value="ARCHIVED"
                      checked={status === 'ARCHIVED'}
                      onChange={() => setStatus('ARCHIVED')}
                      className="accent-[#005c8d]"
                    />
                    Arhivirana škola
                  </label>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-[#dee2e6]">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-sm font-black uppercase tracking-wider text-[10px] hover:bg-slate-200 transition-colors cursor-pointer text-center"
                >
                  Odustani
                </button>
                <button 
                  type="submit"
                  className="flex-1 bg-[#005c8d] text-white py-3 rounded-sm font-black uppercase tracking-wider text-[10px] hover:bg-[#004a71] transition-colors cursor-pointer text-center shadow-md"
                >
                  Spremi podatke
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
