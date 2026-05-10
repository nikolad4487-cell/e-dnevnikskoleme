import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { User, Lock, MapPin, Save, Shield } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function SettingsPage() {
  const { user, formattedRoles, isStaff } = useAuth();
  const [loading, setLoading] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: user?.name || '',
    surname: user?.surname || '',
    address: user?.address || ''
  });

  const [passForm, setPassForm] = useState({
    current: '',
    newPass: '',
    confirm: ''
  });

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          name: `${profileForm.name} ${profileForm.surname}`,
          address: profileForm.address
        })
        .eq('id', user.id);
      
      if (error) throw error;
      toast.success('Profil ažuriran');
    } catch (err: any) {
      toast.error('Greška pri ažuriranju: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (passForm.newPass !== passForm.confirm) {
      toast.error('Nove lozinke se ne podudaraju');
      return;
    }
    if (passForm.newPass.length < 8) {
      toast.error('Lozinka mora imati barem 8 znakova');
      return;
    }

    setLoading(true);
    try {
      // In Supabase, we can use updatePassword if the user is already authenticated.
      // Re-authentication is handled differently or sometimes not strictly required depending on config,
      // but for simple migration we follow the direct update.
      const { error } = await supabase.auth.updateUser({
        password: passForm.newPass
      });
      
      if (error) throw error;
      
      // Update profile flags
      await supabase.from('user_profiles').update({
        is_first_login: false,
        requires_password_change: false,
        password_hash: `HASH:${passForm.newPass}` // Still keeping for legacy compatibility if needed
      }).eq('id', user.id);

      toast.success('Lozinka uspješno promijenjena');
      setPassForm({ current: '', newPass: '', confirm: '' });
    } catch (err: any) {
      toast.error('Greška: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white">
      <div className="p-4 border-b border-gray-300 bg-gray-50 flex items-center justify-between">
        <h2 className="text-xl font-black text-[#005c8d] uppercase tracking-tighter">Korisničke postavke</h2>
      </div>

      {user?.requiresAuthenticatorSetup && isStaff && (
        <div className="bg-amber-50 border-b border-amber-200 p-4 animate-in slide-in-from-top duration-500">
          <div className="max-w-4xl mx-auto flex items-center gap-3 text-amber-700">
            <Shield className="shrink-0" size={20} />
            <p className="text-xs font-bold uppercase tracking-tight">
              Potrebno je postaviti Microsoft Authenticator za nastavak korištenja sustava.
            </p>
          </div>
        </div>
      )}

      {user?.requiresPasswordChange && !user?.requiresAuthenticatorSetup && (
        <div className="bg-red-50 border-b border-red-200 p-4 animate-in slide-in-from-top duration-500">
          <div className="max-w-4xl mx-auto flex items-center gap-3 text-red-700">
            <Shield className="shrink-0" size={20} />
            <p className="text-xs font-bold uppercase tracking-tight">
              Obavezna promjena lozinke: Prijavljeni ste s privremenom lozinkom. Molimo postavite novu trajnu lozinku za nastavak korištenja sustava.
            </p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Profile Section */}
          <section className="space-y-6">
            <div className="border-b-2 border-[#005c8d] pb-2">
              <h3 className="text-sm font-black text-[#005c8d] uppercase flex items-center gap-2">
                <User size={16} /> Osobni podaci
              </h3>
            </div>

            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Ime</label>
                  <input 
                    type="text"
                    value={profileForm.name}
                    onChange={e => setProfileForm({...profileForm, name: e.target.value})}
                    className="w-full border border-gray-300 p-2 text-xs outline-none focus:border-[#005c8d]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Prezime</label>
                  <input 
                    type="text"
                    value={profileForm.surname}
                    onChange={e => setProfileForm({...profileForm, surname: e.target.value})}
                    className="w-full border border-gray-300 p-2 text-xs outline-none focus:border-[#005c8d]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Adresa stanovanja</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-2.5 text-gray-300" size={14} />
                  <input 
                    type="text"
                    value={profileForm.address}
                    onChange={e => setProfileForm({...profileForm, address: e.target.value})}
                    className="w-full border border-gray-300 pl-8 pr-3 py-2 text-xs outline-none focus:border-[#005c8d]"
                    placeholder="Ulica, broj, grad"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Uloga</label>
                <div className="bg-gray-50 border border-gray-200 p-2 text-[10px] font-bold text-[#005c8d] uppercase">
                  {formattedRoles || 'Korisnik'}
                </div>
                <p className="text-[8px] text-gray-400 italic">Uloge se mogu mijenjati isključivo putem administracije sustava.</p>
              </div>

              <button 
                type="submit"
                disabled={loading}
                className="flex items-center justify-center gap-2 px-6 py-2 bg-[#005c8d] text-white text-[10px] font-black uppercase border border-[#004a70] hover:bg-[#004a70] transition-all disabled:opacity-50"
              >
                <Save size={14} /> Spremi promjene
              </button>
            </form>
          </section>

          {/* Password Section */}
          <section className="space-y-6">
            <div className="border-b-2 border-[#005c8d] pb-2">
              <h3 className="text-sm font-black text-[#005c8d] uppercase flex items-center gap-2">
                <Shield size={16} /> Sigurnost i Lozinka
              </h3>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Trenutna lozinka</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 text-gray-300" size={14} />
                  <input 
                    type="password"
                    required
                    value={passForm.current}
                    onChange={e => setPassForm({...passForm, current: e.target.value})}
                    className="w-full border border-gray-300 pl-8 pr-3 py-2 text-xs outline-none focus:border-[#005c8d]"
                  />
                </div>
              </div>

              <div className="space-y-4 pt-2 border-t border-gray-100">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Nova lozinka</label>
                  <input 
                    type="password"
                    required
                    value={passForm.newPass}
                    onChange={e => setPassForm({...passForm, newPass: e.target.value})}
                    className="w-full border border-gray-300 p-2 text-xs outline-none focus:border-[#005c8d]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Ponovite novu lozinku</label>
                  <input 
                    type="password"
                    required
                    value={passForm.confirm}
                    onChange={e => setPassForm({...passForm, confirm: e.target.value})}
                    className="w-full border border-gray-300 p-2 text-xs outline-none focus:border-[#005c8d]"
                  />
                </div>
              </div>

              <button 
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2 bg-[#005c8d] text-white text-[10px] font-black uppercase border border-[#004a70] hover:bg-[#004a70] transition-all disabled:opacity-50"
              >
                Promijeni lozinku
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
