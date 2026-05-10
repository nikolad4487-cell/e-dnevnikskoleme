import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSelection } from '../contexts/SelectionContext';
import { User, Role } from '../types';
import { useNavigate } from 'react-router-dom';
import { Loader2, ArrowRight, User as UserIcon } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ChildSelectionPage() {
  const { user } = useAuth();
  const { setSelectedChildId } = useSelection();
  const [children, setChildren] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchChildren();
  }, [user]);

  const fetchChildren = async () => {
    if (!user) return;
    setLoading(true);

    const timeout = setTimeout(() => {
      if (loading) {
        setLoading(false);
        toast.error('Učitavanje podataka traje predugo.');
      }
    }, 10000);

    try {
      // 1. Get child IDs from relationships table
      const { data: relations, error: relError } = await supabase
        .from('parent_child_relationships')
        .select('child_id')
        .eq('parent_id', user.id);

      if (relError) throw relError;

      if (!relations || relations.length === 0) {
        setChildren([]);
        setLoading(false);
        return;
      }

      const childIds = relations.map(r => r.child_id);

      // 2. Fetch profile data for these children
      const { data: profiles, error: profError } = await supabase
        .from('user_profiles')
        .select('*')
        .in('id', childIds);

      if (profError) throw profError;

      const mappedChildren = (profiles || []).map(p => {
        const fullName = p.name || '';
        const nameParts = fullName.split(' ');
        return {
          id: p.id,
          name: nameParts[0] || '',
          surname: nameParts.slice(1).join(' ') || '',
          email: p.email
        } as User;
      });

      setChildren(mappedChildren);

      // Auto-redirect if only one child
      // PH7: If parent has one child: → auto redirect to /select-school
      if (mappedChildren.length === 1) {
        handleSelect(mappedChildren[0].id);
      }
    } catch (error) {
      console.error(error);
      toast.error('Greška pri učitavanju podataka o djeci');
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  };

  const handleSelect = (childId: string) => {
    setSelectedChildId(childId);
    navigate('/select-school');
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-[#005c8d] mb-4" />
        <p className="text-slate-500 font-medium">Učitavanje podataka o djeci...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] font-sans">
      <div className="max-w-4xl mx-auto py-12 px-6">
        <div className="mb-10 text-center">
          <h1 className="text-2xl font-black text-[#005c8d] uppercase tracking-tight mb-2">Odabir djeteta</h1>
          <div className="w-12 h-1 bg-[#005c8d] mx-auto opacity-20"></div>
          <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-4">
            Molimo odaberite dijete za pregled podataka
          </p>
        </div>

        <div className="bg-white border border-[#dee2e6] rounded-sm overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#f1f3f5] border-b border-[#dee2e6]">
                <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wider text-slate-600 w-12"></th>
                <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wider text-slate-600">Ime i prezime</th>
                <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wider text-slate-600">Email</th>
                <th className="px-6 py-4 text-[11px] font-black uppercase tracking-wider text-slate-600 text-right">Akcija</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#dee2e6]">
              {children.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">
                    Nisu pronađena djeca povezana s vašim računom.
                  </td>
                </tr>
              ) : (
                children.map(child => (
                  <tr key={child.id} className="hover:bg-[#f8f9fa] transition-colors group">
                    <td className="px-6 py-5">
                      <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                        <UserIcon size={16} />
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="font-bold text-slate-800 text-sm whitespace-nowrap">
                        {child.name} {child.surname}
                      </div>
                    </td>
                    <td className="px-6 py-5 text-slate-500 text-xs">
                      {child.email || '—'}
                    </td>
                    <td className="px-6 py-5 text-right">
                      <button
                        onClick={() => handleSelect(child.id)}
                        className="inline-flex items-center gap-1 bg-[#005c8d] text-white py-2 px-6 rounded-sm text-[10px] font-black uppercase tracking-widest hover:bg-[#004a70] transition-all whitespace-nowrap"
                      >
                        Odaberi
                        <ArrowRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
