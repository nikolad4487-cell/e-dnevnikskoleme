import React, { useState, useEffect } from 'react';
import { FileText, Printer, Lock, Unlock, Loader2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { toast } from 'react-hot-toast';
import { StudentDocument } from '../../../types/certificates';

export default function CertificateManagementPage() {
  const [activeTab, setActiveTab] = useState('CLASS_CERTIFICATES');
  const [documents, setDocuments] = useState<StudentDocument[]>([]);
  const [loading, setLoading] = useState(false);

  const tabs = [
    { id: 'CLASS_CERTIFICATES', label: 'Razredne svjedodžbe' },
    { id: 'FINAL_CERTIFICATES', label: 'Završne svjedodžbe' },
    { id: 'FINAL_THESIS', label: 'Završni rad' },
    { id: 'EXAMS', label: 'Ispiti' },
  ];

  useEffect(() => {
    fetchDocuments();
  }, [activeTab]);

  const fetchDocuments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('student_documents')
      .select('*')
      .eq('document_type', activeTab)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Nije moguće učitati dokumente.');
    } else {
      setDocuments(data || []);
    }
    setLoading(false);
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Svjedodžbe i dokumenti</h1>
      
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {tabs.map(tab => (
            <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-2 px-4 rounded font-bold uppercase text-[10px] ${activeTab === tab.id ? 'bg-[#005c8d] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
                {tab.label}
            </button>
        ))}
      </div>

      <div className="bg-white border rounded shadow-sm">
        <div className="p-4 border-b flex flex-row items-center justify-between">
          <h2 className="font-bold text-lg">Pregled dokumenata ({tabs.find(t => t.id === activeTab)?.label})</h2>
          <div className="flex gap-2">
            <button className="flex items-center text-[10px] font-bold uppercase border px-3 py-1 hover:bg-gray-50"><FileText size={14} className="mr-2"/> Probni ispis</button>
            <button className="flex items-center text-[10px] font-bold uppercase border px-3 py-1 hover:bg-gray-50"><Printer size={14} className="mr-2"/> Grupni ispis</button>
          </div>
        </div>
        <div className="p-4">
          {loading ? (
            <div className="flex justify-center items-center py-10"><Loader2 className="animate-spin" size={24}/></div>
          ) : documents.length === 0 ? (
            <div className="text-center py-10 text-slate-500">
               Nema dokumenata za odabranu kategoriju.
            </div>
          ) : (
            <div className="space-y-4">
              {documents.map(doc => (
                <div key={doc.id} className="flex items-center justify-between p-4 border rounded">
                  <div>
                    <p className="font-semibold">{doc.document_number || 'Bez broja'}</p>
                    <p className="text-sm text-slate-500">Status: {doc.status}</p>
                  </div>
                  <div className="flex gap-2">
                    <button className="text-[10px] font-bold px-3 py-1 border hover:bg-gray-50">Pregled</button>
                    <button className={`p-1.5 border rounded ${doc.locked ? "text-red-500" : "text-green-500"}`}>
                      {doc.locked ? <Lock size={16}/> : <Unlock size={16}/>}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
