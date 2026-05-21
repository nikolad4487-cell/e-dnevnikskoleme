import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useParams } from 'react-router-dom';
import { MessageSquare, Plus, Trash2, Settings, Users, X } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function InformativkaAdminPage() {
  const { classId } = useParams<{ classId: string }>();
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [currentChannel, setCurrentChannel] = useState<any>(null);
  const [newChannel, setNewChannel] = useState({ name: '', type: 'SUBJECT_CHANNEL', subject_id: '', staff_only_posting: true, allow_student_messages: false });
  const [subjects, setSubjects] = useState<any[]>([]);

  useEffect(() => {
    if (classId) {
      fetchChannels();
      fetchSubjects();
    }
  }, [classId]);

  const fetchChannels = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('chat_groups')
      .select('*')
      .eq('class_id', classId)
      .in('type', ['SUBJECT_CHANNEL', 'CUSTOM_CHANNEL', 'CLASS_CHANNEL']);
      
    if (data) setChannels(data);
    setLoading(false);
  };

  const fetchSubjects = async () => {
    const { data } = await supabase.from('subjects').select('id, name');
    if (data) setSubjects(data);
  };
  
  const openSettings = (channel: any) => {
    setCurrentChannel(channel);
    setNewChannel({
        name: channel.name,
        type: channel.type,
        subject_id: channel.subject_id || '',
        staff_only_posting: !!channel.staff_only_posting,
        allow_student_messages: !!channel.allow_student_messages
    });
    setIsSettingsModalOpen(true);
  };

  const handleUpdateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentChannel) return;
    
    const payload: any = {
      name: newChannel.name,
      type: newChannel.type,
      subject_id: newChannel.type === 'SUBJECT_CHANNEL' ? newChannel.subject_id || null : null,
      staff_only_posting: newChannel.staff_only_posting,
      allow_student_messages: newChannel.allow_student_messages,
    };
    
    console.log("UPDATE CHANNEL PAYLOAD", payload);
    
    const { error } = await supabase.from('chat_groups').update(payload).eq('id', currentChannel.id);
    
    if (error) {
        console.log("UPDATE CHANNEL ERROR", error);
        toast.error("Greška pri ažuriranju: " + error.message);
    } else {
        toast.success("Kanal uspješno ažuriran");
        setIsSettingsModalOpen(false);
        fetchChannels();
    }
  };
  
  const handleCreateAllSubjectChannels = async () => {
    if (!classId) return;
    setLoading(true);
    const { data: classData } = await supabase.from('classes').select('school_id').eq('id', classId).single();
    const schoolId = classData?.school_id;
    const { data: profile } = await supabase.auth.getUser();
    const userId = profile?.user?.id;

    try {
        const { data: subjects, error: subjErr } = await supabase
            .from('class_subject_teachers')
            .select('subject_id, subject:subjects(name)')
            .eq('class_id', classId);
        
        const uniqueSubjects = Array.from(new Map((subjects || []).map((s: any) => [s.subject_id, s])).values());
        
        console.log("SUBJECTS FOUND", uniqueSubjects);
        
        if (subjErr || uniqueSubjects.length === 0) {
            toast.error("Nema predmeta u razredu za koje se mogu stvoriti kanali.");
            setLoading(false);
            return;
        }

        let createdChannels = [];
        for (const s of uniqueSubjects) {
            const subjectId = (s as any).subject_id;
            const subjectName = (s as any).subject?.name;
            
            const { data: existing } = await supabase
                .from('chat_groups')
                .select('id')
                .eq('class_id', classId)
                .eq('subject_id', subjectId)
                .maybeSingle();

            if (!existing) {
                const payload = {
                    name: subjectName,
                    type: 'SUBJECT_CHANNEL',
                    class_id: classId,
                    subject_id: subjectId,
                    school_id: schoolId,
                    staff_only_posting: true,
                    created_by: userId
                };
                
                const { data, error } = await supabase.from('chat_groups').insert([payload]).select().single();
                if (error) {
                    console.log("CHANNEL CREATE ERROR", error);
                    toast.error("Greška pri stvaranju kanala: " + error.message);
                } else {
                    console.log("SUBJECT CHANNEL CREATED", data);
                    createdChannels.push(data);
                    
                    const { data: teachers } = await supabase
                        .from('class_subject_teachers')
                        .select('teacher_id')
                        .eq('class_id', classId)
                        .eq('subject_id', subjectId);
                        
                    const { data: students } = await supabase
                        .from('student_subject_enrollments')
                        .select('student_id')
                        .eq('class_id', classId)
                        .eq('subject_id', subjectId);

                    const members = [
                        ...(teachers || []).map((t: any) => ({ group_id: data.id, user_id: t.teacher_id, role: 'OWNER' })),
                        ...(students || []).map((st: any) => ({ group_id: data.id, user_id: st.student_id, role: 'MEMBER' }))
                    ];

                    if (members.length > 0) {
                        await supabase.from('chat_group_members').insert(members);
                    }
                }
            }
        }
        
        console.log("CHANNELS CREATED", createdChannels);
        if (createdChannels.length > 0) toast.success(`Stvoreno kanala: ${createdChannels.length}`);
        else toast("Svi kanali već postoje.");
        fetchChannels();
    } catch(err) {
        toast.error('Greška pri stvaranju');
    } finally {
        setLoading(false);
    }
  };

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classId) return;
    
    const { data: classData } = await supabase.from('classes').select('school_id').eq('id', classId).single();
    const schoolId = classData?.school_id;
    const { data: profile } = await supabase.auth.getUser();
    const userId = profile?.user?.id;
    
    const payload = {
      name: newChannel.name,
      type: newChannel.type,
      class_id: classId,
      school_id: schoolId,
      subject_id: newChannel.type === 'SUBJECT_CHANNEL' ? newChannel.subject_id || null : null,
      staff_only_posting: newChannel.staff_only_posting,
      allow_student_messages: newChannel.allow_student_messages,
      created_by: userId
    };
    
    console.log("CREATE NEW CHANNEL CLICKED");
    
    const { data, error } = await supabase.from('chat_groups').insert([payload]).select().single();
    
    if (error) {
        console.log("CREATE CHANNEL ERROR", error);
        toast.error("Greška pri stvaranju: " + error.message);
    } else {
        console.log("CREATE CHANNEL RESULT", data);
        toast.success("Kanal uspješno stvoren");
        setIsModalOpen(false);
        fetchChannels();
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-6">Administracija Informativke</h2>
      <div className="flex gap-2 mb-6">
        <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-[#005c8d] text-white px-4 py-2 rounded">
            <Plus size={16} /> Kreiraj novi kanal
        </button>
        <button 
            onClick={handleCreateAllSubjectChannels}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded"
        >
            <Users size={16} /> Stvori kanale za sve predmete
        </button>
      </div>

      {isSettingsModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
            <form onSubmit={handleUpdateChannel} className="bg-white p-6 rounded shadow-lg w-full max-w-md">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold">Postavke kanala</h3>
                    <button type="button" onClick={() => setIsSettingsModalOpen(false)}><X size={20}/></button>
                </div>
                <input required placeholder="Naziv kanala" className="w-full border p-2 mb-2" value={newChannel.name} onChange={e => setNewChannel({...newChannel, name: e.target.value})} />
                
                <label className="flex items-center gap-2 mb-2 text-sm"><input type="checkbox" checked={newChannel.staff_only_posting} onChange={e => setNewChannel({...newChannel, staff_only_posting: e.target.checked})} /> Samo djelatnici objavljuju</label>
                <label className="flex items-center gap-4 mb-4 text-sm"><input type="checkbox" checked={newChannel.allow_student_messages} onChange={e => setNewChannel({...newChannel, allow_student_messages: e.target.checked})} /> Učenici smiju pisati</label>
                <button type="submit" className="w-full bg-[#005c8d] text-white p-2 rounded">Spremi promjene</button>
            </form>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
            <form onSubmit={handleCreateChannel} className="bg-white p-6 rounded shadow-lg w-full max-w-md">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold">Novi kanal</h3>
                    <button type="button" onClick={() => setIsModalOpen(false)}><X size={20}/></button>
                </div>
                <input required placeholder="Naziv kanala" className="w-full border p-2 mb-2" value={newChannel.name} onChange={e => setNewChannel({...newChannel, name: e.target.value})} />
                <select className="w-full border p-2 mb-2" value={newChannel.type} onChange={e => setNewChannel({...newChannel, type: e.target.value})}>
                    <option value="SUBJECT_CHANNEL">Predmetni kanal</option>
                    <option value="CUSTOM_CHANNEL">Custom kanal</option>
                    <option value="CLASS_CHANNEL">Razredni kanal</option>
                </select>
                {newChannel.type === 'SUBJECT_CHANNEL' && (
                    <select className="w-full border p-2 mb-2" value={newChannel.subject_id} onChange={e => setNewChannel({...newChannel, subject_id: e.target.value})}>
                        <option value="">Odaberi predmet</option>
                        {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                )}
                <label className="flex items-center gap-2 mb-2 text-sm"><input type="checkbox" checked={newChannel.staff_only_posting} onChange={e => setNewChannel({...newChannel, staff_only_posting: e.target.checked})} /> Samo djelatnici objavljuju</label>
                <label className="flex items-center gap-2 mb-4 text-sm"><input type="checkbox" checked={newChannel.allow_student_messages} onChange={e => setNewChannel({...newChannel, allow_student_messages: e.target.checked})} /> Učenici smiju pisati</label>
                <button type="submit" className="w-full bg-[#005c8d] text-white p-2 rounded">Spremi</button>
            </form>
        </div>
      )}

      <div className="bg-white border rounded shadow-sm">
        {loading ? <p className="p-4">Učitavanje...</p> : (
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs uppercase font-bold text-gray-500">
                <th className="p-4">Naziv</th>
                <th className="p-4">Tip</th>
                <th className="p-4">Radnje</th>
              </tr>
            </thead>
            <tbody>
              {channels.map(channel => (
                <tr key={channel.id} className="border-b">
                  <td className="p-4">{channel.name}</td>
                  <td className="p-4">{channel.type}</td>
                  <td className="p-4 flex gap-2">
                    <button onClick={() => openSettings(channel)} className="text-gray-400 hover:text-blue-600"><Settings size={16} /></button>
                    <button className="text-gray-400 hover:text-red-600"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
