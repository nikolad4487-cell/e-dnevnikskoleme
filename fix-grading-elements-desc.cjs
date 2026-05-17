const fs = require('fs');

let file = 'src/pages/teacher/ImenikPage.tsx';
let content = fs.readFileSync(file, 'utf8');

const startIndex = content.indexOf('function GradingElementsModal');

const modalCode = `function GradingElementsModal({ isOpen, onClose, subject, classId, schoolId, teacherId, onRefresh }: { isOpen: boolean, onClose: () => void, subject: Subject, classId: string, schoolId: string, teacherId: string, onRefresh: () => void }) {
  const [elements, setElements] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [newElementName, setNewElementName] = useState('');
  const [newElementDesc, setNewElementDesc] = useState('');
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [editingElementName, setEditingElementName] = useState('');
  const [editingElementDesc, setEditingElementDesc] = useState('');

  const fetchElements = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('grading_elements')
        .select('*')
        .eq('school_id', schoolId)
        .eq('class_id', classId)
        .eq('subject_id', subject.id)
        .eq('teacher_id', teacherId)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (data) setElements(data); // mapList deleted because we want native DB row shape with description
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchElements();
  }, [isOpen]);

  const handleAdd = async () => {
    if (!newElementName.trim()) return;
    try {
      const { error } = await supabase.from('grading_elements').insert([{
        school_id: schoolId,
        teacher_id: teacherId,
        class_id: classId,
        subject_id: subject.id,
        name: newElementName.trim(),
        description: newElementDesc.trim() || null,
        display_order: elements.length
      }]);
      if (error) throw error;
      setNewElementName('');
      setNewElementDesc('');
      fetchElements();
      onRefresh();
    } catch (err) {
      toast.error('Greška pri dodavanju elementa.');
    }
  };

  const handleEdit = async () => {
    if (!editingElementId || !editingElementName.trim()) return;
    try {
      const { error } = await supabase
        .from('grading_elements')
        .update({
          name: editingElementName.trim(),
          description: editingElementDesc.trim() || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingElementId)
        .eq('teacher_id', teacherId);
        
      if (error) throw error;
      setEditingElementId(null);
      setEditingElementName('');
      setEditingElementDesc('');
      fetchElements();
      onRefresh();
      toast.success('Element uspješno ažuriran.');
    } catch (err) {
      toast.error('Greska pri ažuriranju.');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const { count } = await supabase.from('grades').select('*', { count: 'exact', head: true }).eq('category', name);
    if (count && count > 0) {
      toast.error('Element se ne može obrisati jer postoje ocjene u toj kategoriji.');
      return;
    }
    
    try {
      await supabase.from('grading_elements').delete().eq('id', id).eq('teacher_id', teacherId);
      fetchElements();
      onRefresh();
      toast.success('Element uspješno obrisan.');
    } catch (err) {
      toast.error('Greska pri brisanju.');
    }
  };

  const handleMove = async (id: string, dir: 'UP' | 'DOWN') => {
    const idx = elements.findIndex(e => e.id === id);
    if (dir === 'UP' && idx === 0) return;
    if (dir === 'DOWN' && idx === elements.length - 1) return;
    
    const newElements = [...elements];
    const targetIdx = dir === 'UP' ? idx - 1 : idx + 1;
    [newElements[idx], newElements[targetIdx]] = [newElements[targetIdx], newElements[idx]];
    
    try {
      const updates = newElements.map((e, index) => ({
        id: e.id,
        school_id: schoolId,
        teacher_id: teacherId,
        class_id: classId,
        subject_id: subject.id,
        name: e.name,
        description: e.description,
        display_order: index
      }));
      await supabase.from('grading_elements').upsert(updates);
      fetchElements();
      onRefresh();
    } catch (err) {
      toast.error('Greška pri reoslijedu.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[400] p-4">
      <div className="bg-white max-w-md w-full border border-gray-400 shadow-2xl">
        <div className="p-3 bg-[#005c8d] text-white flex justify-between items-center text-[11px] font-black uppercase tracking-widest">
          <span>Elementi ocjenjivanja: {subject.name}</span>
          <button onClick={onClose} className="hover:text-amber-300 transition-colors"><X size={16}/></button>
        </div>
        <div className="p-6 space-y-6">
          <div className="space-y-3">
            {elements.length === 0 && (
               <div className="text-center p-6 bg-slate-50 border-2 border-dashed border-slate-200 text-xs font-bold text-slate-400 uppercase tracking-widest">
                 Nema definiranih elemenata.
               </div>
            )}
            {elements.map((e) => (
              <div key={e.id} className="flex flex-col gap-2 p-3 bg-slate-50 border-l-[3px] border-[#005c8d] shadow-sm">
                {editingElementId === e.id ? (
                  <div className="flex flex-col gap-2">
                    <input 
                      type="text" 
                      value={editingElementName} 
                      onChange={ev => setEditingElementName(ev.target.value)} 
                      className="px-3 py-1.5 border-2 border-[#005c8d] bg-white text-xs font-bold text-slate-900 outline-none"
                      placeholder="Naziv elementa"
                      autoFocus
                    />
                    <input 
                      type="text" 
                      value={editingElementDesc} 
                      onChange={ev => setEditingElementDesc(ev.target.value)} 
                      className="px-3 py-1.5 border border-slate-300 bg-white text-xs text-slate-600 outline-none"
                      placeholder="Opis (opcionalno)"
                    />
                    <div className="flex gap-2 justify-end mt-1">
                      <button onClick={handleEdit} className="p-1.5 px-3 bg-[#005c8d] text-white hover:bg-[#004a70] text-[10px] font-bold uppercase flex items-center gap-1"><Check size={12}/> Spremi</button>
                      <button onClick={() => setEditingElementId(null)} className="p-1.5 px-3 bg-slate-200 text-slate-600 hover:bg-slate-300 text-[10px] uppercase font-bold flex items-center gap-1"><X size={12}/> Odustani</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-black text-slate-800 uppercase tracking-tight">{e.name}</span>
                      <div className="flex gap-1.5 items-center">
                         <button onClick={() => { setEditingElementId(e.id); setEditingElementName(e.name); setEditingElementDesc(e.description || ''); }} className="text-[9px] font-black uppercase text-[#005c8d] hover:underline">Uredi</button>
                         <span className="text-slate-300 text-[9px]">|</span>
                         <button onClick={() => handleDelete(e.id, e.name)} className="text-[9px] font-black uppercase text-red-600 hover:underline">Obriši</button>
                      </div>
                    </div>
                    {e.description && <p className="text-[10px] text-slate-500 italic">{e.description}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 pt-4 border-t border-slate-100">
            <input 
              type="text" 
              value={newElementName} 
              onChange={e => setNewElementName(e.target.value)}
              placeholder="Novi element (npr. Domaća zadaća)"
              className="px-3 py-2 border-2 border-slate-200 bg-white text-xs font-bold text-slate-900 outline-none focus:border-[#005c8d]"
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            />
            <input 
              type="text" 
              value={newElementDesc} 
              onChange={e => setNewElementDesc(e.target.value)}
              placeholder="Opis (opcionalno)"
              className="px-3 py-2 border border-slate-200 bg-white text-xs text-slate-600 outline-none focus:border-[#005c8d]"
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            />
            <button onClick={handleAdd} className="mt-1 bg-[#005c8d] text-white px-4 py-2 text-[10px] font-black uppercase hover:bg-[#004a70] transition-colors leading-none tracking-widest">Dodaj element</button>
          </div>
        </div>
      </div>
    </div>
  );
}
`;

content = content.substring(0, startIndex) + modalCode;
fs.writeFileSync(file, content);
