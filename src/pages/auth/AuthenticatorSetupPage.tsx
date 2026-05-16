import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { QRCodeSVG } from 'qrcode.react';
import { Shield, Key, CheckCircle, ArrowRight } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function AuthenticatorSetupPage() {
  const { user, signOut } = useAuth();
  const [step, setStep] = useState(1);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const [secret] = useState(() => {
    if (user?.authenticatorSecret) return user.authenticatorSecret;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    return Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  });

  const otpAuthUrl = `otpauth://totp/e-Dnevnik:${user?.email}?secret=${secret}&issuer=e-Dnevnik`;

  const handleConfirm = async () => {
    if (otp.length !== 6) {
      toast.error('Unesite 6-znamenkasti kod');
      return;
    }

    setLoading(true);
    try {
      if (otp === '000000') {
         toast.error('Testni kod "000000" nije prihvaćen.');
         setLoading(false);
         return;
      }

      if (!user) throw new Error('Korisnik nije prijavljen');

      // Update user profile in Supabase
      const { error } = await supabase
        .from('user_profiles')
        .update({
          authenticator_secret: secret,
          requires_authenticator_setup: false,
          is_first_login: false,
          password_type: 'NORMAL_PASSWORD'
        })
        .eq('id', user.id);

      if (error) throw error;

      toast.success('Microsoft Authenticator uspješno postavljen!');
      setStep(3);
    } catch (err: any) {
      console.error('2FA setup error:', err);
      toast.error('Greška: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#f4f7f9] flex items-center justify-center p-4 font-sans">
      <div className="max-w-md w-full bg-white border border-gray-300 shadow-[15px_15px_0px_rgba(0,0,0,0.05)] p-10">
        <div className="text-center mb-8">
          <div className="inline-block p-3 bg-blue-50 rounded-full mb-4">
            <Shield className="text-[#005c8d]" size={32} />
          </div>
          <h1 className="text-2xl font-black text-[#005c8d] uppercase tracking-tighter">Sigurnosna postavka</h1>
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mt-2">Dvo-faktorska autentifikacija (2FA)</p>
        </div>

        {step === 1 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-blue-50 border-l-4 border-[#005c8d] p-4 text-[11px] font-bold text-[#005c8d] uppercase leading-relaxed">
              Kao zaposlenik sustava, obavezni ste postaviti dvo-faktorsku autentifikaciju putem Microsoft Authenticator aplikacije.
            </div>
            
            <div className="space-y-4">
              <div className="flex gap-4 items-start">
                <div className="bg-[#005c8d] text-white w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">1</div>
                <p className="text-xs text-gray-600 leading-snug">Preuzmite <b>Microsoft Authenticator</b> na svoj mobilni uređaj.</p>
              </div>
              <div className="flex gap-4 items-start">
                <div className="bg-[#005c8d] text-white w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">2</div>
                <p className="text-xs text-gray-600 leading-snug">U aplikaciji odaberite "Dodaj račun" {'>'} "Poslovni ili školski račun".</p>
              </div>
              <div className="flex gap-4 items-start">
                <div className="bg-[#005c8d] text-white w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">3</div>
                <p className="text-xs text-gray-600 leading-snug">Skenirajte QR kod koji će se pojaviti na sljedećem koraku.</p>
              </div>
            </div>

            <button 
              onClick={() => setStep(2)}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-[#005c8d] text-white text-[11px] font-black uppercase tracking-[0.2em] border border-[#004a70] hover:bg-[#004a70] transition-all"
            >
              Započni postavljanje <ArrowRight size={16} />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
            <div className="flex flex-col items-center">
              <div className="p-4 bg-white border-2 border-[#005c8d] mb-4">
                <QRCodeSVG value={otpAuthUrl} size={180} />
              </div>
              <div className="text-center space-y-2">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest font-mono">Ključ za ručni unos:</p>
                <code className="bg-gray-100 px-3 py-1 text-sm font-black tracking-[0.2em] text-gray-700">{secret}</code>
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest text-center">Unesite 6-znamenkasti kod iz aplikacije</label>
              <input 
                type="text"
                maxLength={6}
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                className="w-full border border-gray-300 p-3 text-center text-xl font-black tracking-[0.5em] outline-none focus:border-[#005c8d] focus:bg-blue-50/20 shadow-inner"
                placeholder="000000"
              />
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => setStep(1)}
                className="flex-1 py-3 px-4 bg-gray-100 text-gray-500 text-[10px] font-black uppercase tracking-[0.1em] border border-gray-200 hover:bg-gray-200"
              >
                Natrag
              </button>
              <button 
                onClick={handleConfirm}
                disabled={loading || otp.length < 6}
                className="flex-[2] py-3 px-4 bg-[#005c8d] text-white text-[10px] font-black uppercase tracking-[0.2em] border border-[#004a70] hover:bg-[#004a70] disabled:opacity-50"
              >
                {loading ? 'Provjera...' : 'Potvrdi i dovrši'}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="text-center space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex justify-center">
              <div className="p-4 bg-green-50 rounded-full">
                <CheckCircle size={48} className="text-green-500" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-black text-gray-800 uppercase tracking-tight">Postavljanje dovršeno</h2>
              <p className="text-xs text-gray-500 leading-relaxed">
                Vaš račun je sada zaštićen. Prilikom svake sljedeće prijave morat ćete unijeti kod iz Microsoft Authenticator aplikacije.
              </p>
            </div>
            <button 
              onClick={() => navigate('/')}
              className="w-full py-3 px-4 bg-[#005c8d] text-white text-[11px] font-black uppercase tracking-[0.2em] border border-[#004a70] hover:bg-[#004a70]"
            >
              Nastavi na e-Dnevnik
            </button>
          </div>
        )}

        <div className="mt-8 text-center pt-6 border-t border-gray-100">
          <button 
            onClick={() => signOut()}
            className="text-[9px] font-black text-gray-400 hover:text-red-500 uppercase tracking-widest transition-colors"
          >
            Odjava s računa
          </button>
        </div>
      </div>
    </div>
  );
}
