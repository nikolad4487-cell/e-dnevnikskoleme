import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { User, Lock, MapPin, Save, Shield, X, Printer } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { QRCodeCanvas } from 'qrcode.react';
import { useNavigate } from 'react-router-dom';

export default function SettingsPage() {
  const { user, formattedRoles, isStaff, signOut } = useAuth();
  const [loading, setLoading] = useState(false);
  const [resetData, setResetData] = useState<{ secret: string; qrCode: string; otpauthUrl: string } | null>(null);
  const getInitialNameParts = () => {
    if (!user?.name) return { first: '', last: '' };
    const cleanName = String(user.name).trim();
    const parts = cleanName.split(' ');
    if (parts.length <= 1) return { first: cleanName, last: '' };
    return {
      first: parts.slice(0, parts.length - 1).join(' '),
      last: parts[parts.length - 1]
    };
  };

  const initialNameParts = getInitialNameParts();

  const [profileForm, setProfileForm] = useState({
    name: initialNameParts.first,
    surname: initialNameParts.last || user?.surname || '',
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
          name: `${profileForm.name} ${profileForm.surname}`.trim(),
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
      const { error } = await supabase.auth.updateUser({
        password: passForm.newPass
      });
      
      if (error) throw error;
      
      await supabase.from('user_profiles').update({
        is_first_login: false,
        requires_password_change: false
      }).eq('id', user.id);

      toast.success('Lozinka uspješno promijenjena');
      setPassForm({ current: '', newPass: '', confirm: '' });
    } catch (err: any) {
      toast.error('Greška: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetAuthenticator = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/auth/reset-authenticator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: user?.id })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Resetiranje nije uspjelo');
      
      const otpauthUrl = `otpauth://totp/e-Dnevnik:${user?.email}?secret=${result.authenticatorSecret}&issuer=e-Dnevnik`;
      
      setResetData({
        secret: result.authenticatorSecret,
        qrCode: result.qrCode,
        otpauthUrl
      });
      toast.success('Authenticator resetiran. Skenirajte novi kod.');
    } catch (err: any) {
      toast.error(err.message || 'Greška pri resetiranju');
    } finally {
      setLoading(false);
    }
  };

  const navigate = useNavigate();

  const handleFinishReset = async () => {
    toast.success('Authenticator postavljen. Odjava radi sigurnosti...');
    await signOut();
    navigate('/login');
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
              Potrebno je dovršiti postavljanje autentifikatora.
            </p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 pb-12">
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
                <Lock size={16} /> Sigurnost i Lozinka
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

          {/* Security / MFA Section */}
          {isStaff && (
            <section className="space-y-6 md:col-span-2 pt-6 border-t border-gray-200">
               <div className="border-b-2 border-red-500 pb-2">
                <h3 className="text-sm font-black text-red-600 uppercase flex items-center gap-2">
                  <Shield size={16} /> Napredna sigurnost
                </h3>
              </div>
              <div className="bg-red-50 border border-red-200 p-6 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="space-y-1 text-center md:text-left">
                  <h4 className="text-[11px] font-black text-red-700 uppercase tracking-tight">Microsoft Authenticator</h4>
                  <p className="text-xs text-gray-600 max-w-md">
                    Ako ste izgubili pristup svom autentifikatoru ili ste promijenili uređaj, možete ga resetirati ovdje. 
                  </p>
                </div>
                <button 
                  type="button"
                  onClick={handleResetAuthenticator}
                  disabled={loading}
                  className="px-6 py-2 bg-white border-2 border-red-500 text-red-600 text-[10px] font-black uppercase hover:bg-red-500 hover:text-white transition-all disabled:opacity-50 whitespace-nowrap"
                >
                  Resetiraj Authenticator
                </button>
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Reset Result Modal */}
      {resetData && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full shadow-2xl border border-gray-300 overflow-hidden">
            <div className="p-4 bg-[#005c8d] text-white flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-tighter flex items-center gap-2">
                <Shield size={16} /> Postavljanje Microsoft Authenticatora
              </h3>
              <button 
                onClick={() => setResetData(null)}
                className="hover:bg-black/10 rounded p-1"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="p-8 space-y-6 flex flex-col items-center">
              <div className="text-center space-y-4">
                <p className="text-xs font-bold text-gray-600 uppercase tracking-tight">Otvorite Microsoft Authenticator i skenirajte QR kod.</p>
                <div className="bg-white p-4 border-2 border-gray-100 shadow-sm inline-block">
                  <QRCodeCanvas value={resetData.otpauthUrl} size={220} />
                </div>
              </div>

              <div className="w-full space-y-2">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest text-center">Setup kod (manualno)</p>
                <code className="block w-full text-center py-2 bg-gray-50 border border-gray-200 text-sm font-black tracking-widest text-gray-700 select-all">
                  {resetData.secret}
                </code>
              </div>

              <div className="text-center">
                <p className="text-[10px] font-bold text-[#005c8d] uppercase tracking-tight">{user?.email}</p>
              </div>

              <div className="flex gap-2 w-full pt-4">
                <button 
                  onClick={() => window.print()}
                  className="flex-1 py-3 border border-gray-300 text-gray-600 text-[10px] font-black uppercase hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
                >
                  <Printer size={16} /> Printaj
                </button>
                <button 
                  onClick={() => setResetData(null)}
                  className="flex-1 py-3 bg-[#005c8d] text-white text-[10px] font-black uppercase hover:bg-[#004a70] transition-all shadow-md"
                >
                  Zatvori
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

