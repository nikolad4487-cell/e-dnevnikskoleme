import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useSelection } from '../../contexts/SelectionContext';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { 
  Plus, 
  Edit2, 
  Upload, 
  Building2, 
  ArrowLeft, 
  Save, 
  FileImage, 
  Check, 
  HelpCircle,
  FileText,
  ShieldAlert,
  X,
  Signature,
  Sliders,
  Settings,
  Sparkles,
  Layers,
  Eye,
  Type
} from 'lucide-react';

interface SchoolData {
  id: string;
  name: string;
  type: string;
  address: string;
  city: string;
}

interface DocumentSettingsData {
  id?: string;
  school_id: string;
  school_name?: string;
  school_name_print?: string;
  oib?: string;
  city?: string;
  county?: string;
  principal_name?: string;
  principal_title?: string;
  school_number?: string;
  default_klasa?: string;
  default_urbroj?: string;
  stamp_url?: string;
  stamp_image_url?: string;
  principal_signature_url?: string;
  teacher_signature_url?: string;
  overall_success_label?: string;
  conduct_label?: string;
  certificate_place?: string;
  certificate_date?: string;
  desired_school_name?: string;
  homeroom_teacher_title?: string;
  certificate_template_config?: string;
}

export default function AdminSettingsPage() {
  const { selectedSchoolId } = useSelection();
  const { user, userSchoolRoles } = useAuth();
  const navigate = useNavigate();

  // Resolve active schoolId
  let schoolId = selectedSchoolId;
  if (!schoolId) {
    if (user && (user as any).school_id) {
      schoolId = (user as any).school_id;
    } else if (user && (user as any).schoolId) {
      schoolId = (user as any).schoolId;
    } else if (userSchoolRoles && userSchoolRoles.length > 0) {
      schoolId = userSchoolRoles[0].schoolId;
    } else if (user && (user as any).roles && (user as any).roles.length > 0) {
      schoolId = (user as any).roles[0].school_id || (user as any).roles[0].schoolId;
    }
  }

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingType, setUploadingType] = useState<'stamp' | 'principal' | 'teacher' | null>(null);

  // General School states
  const [school, setSchool] = useState<SchoolData | null>(null);
  const [schoolName, setSchoolName] = useState('');
  const [schoolAddress, setSchoolAddress] = useState('');
  const [schoolCity, setSchoolCity] = useState('');

  // Document Settings states
  const [docSettings, setDocSettings] = useState<DocumentSettingsData | null>(null);
  const [printName, setPrintName] = useState('');
  const [oib, setOib] = useState('');
  const [county, setCounty] = useState('');
  const [principalName, setPrincipalName] = useState('');
  const [principalTitle, setPrincipalTitle] = useState('');
  const [schoolNumber, setSchoolNumber] = useState('');
  const [klasa, setKlasa] = useState('');
  const [urbroj, setUrbroj] = useState('');
  const [successLabel, setSuccessLabel] = useState('');

  // Asset URLs state
  const [stampUrl, setStampUrl] = useState('');
  const [principalSigUrl, setPrincipalSigUrl] = useState('');
  const [teacherSigUrl, setTeacherSigUrl] = useState('');

  // File objects for selection before manual upload trigger
  const [stampFile, setStampFile] = useState<File | null>(null);
  const [principalFile, setPrincipalFile] = useState<File | null>(null);
  const [teacherFile, setTeacherFile] = useState<File | null>(null);

  // Active page tab
  const [activeTab, setActiveTab] = useState<'SETTINGS' | 'TEMPLATE'>('SETTINGS');

  // Helper function for default config
  const getDefaultTemplateConfig = () => ({
    CLASS_CERTIFICATE: {
      layout: {
        borderStyle: "double-turquoise",
        showBorder: true,
        showWatermark: true,
        topMargin: 15,
        bottomMargin: 15,
        leftMargin: 20,
        rightMargin: 20
      },
      typography: {
        headerFontSize: 11,
        schoolNameFontSize: 14,
        titleFontSize: 22,
        studentNameFontSize: 18,
        bodyFontSize: 10,
        tableHeaderFontSize: 10,
        tableBodyFontSize: 9
      },
      texts: {
        headerCountry: "REPUBLIKA HRVATSKA",
        documentTitle: "SVJEDODŽBA",
        bodyTemplate: "rođen/a {birthday} godine u {birthplace}, {birth_country}, državljanstvo {citizenship}, kći/sin {parents_name}, upisao/la je školske godine {school_year} prvi put {class_year} razred programa obrazovanja za zanimanje/strukovnog kurikuluma za stjecanje kvalifikacije {program_name} u trajanju od {duration_years} i postigao/la sljedeći uspjeh:"
      },
      elements: {
        showTable: true,
        showSignatures: true,
        showStamp: true,
        showAbsences: true,
        splitSubjects: true,
        signatureLineY: 255
      }
    },
    FINAL_WORK_CERTIFICATE: {
      layout: {
        borderStyle: "gold-line",
        showBorder: true,
        showWatermark: true,
        topMargin: 15,
        bottomMargin: 15,
        leftMargin: 20,
        rightMargin: 20
      },
      typography: {
        headerFontSize: 11,
        schoolNameFontSize: 14,
        titleFontSize: 22,
        studentNameFontSize: 18,
        bodyFontSize: 10,
        tableHeaderFontSize: 10,
        tableBodyFontSize: 9
      },
      texts: {
        headerCountry: "REPUBLIKA HRVATSKA",
        documentTitle: "SVJEDODŽBA",
        documentSubtitle: "O ZAVRŠNOME RADU",
        bodyTemplate: "rođen/a {birthday} godine u {birthplace}, {birth_country}, državljanstvo {citizenship}, ime i prezime roditelja/skrbnika: {parents_name}. Nakon završenoga {class_name} razreda učenik/ca je {date_conditions_met} godine stekao/la sve uvjete za obranu završnoga rada. Učenik/ca je izradio/la i obranio/la završni rad s temom: \"{thesis_title}\" i postigao/la sljedeći uspjeh:"
      },
      elements: {
        showTable: true,
        showSignatures: true,
        showStamp: true,
        showAbsences: false,
        splitSubjects: false,
        signatureLineY: 250
      }
    }
  });

  const [templateConfig, setTemplateConfig] = useState<any>(getDefaultTemplateConfig());
  const [editingTemplateType, setEditingTemplateType] = useState<'CLASS_CERTIFICATE' | 'FINAL_WORK_CERTIFICATE'>('CLASS_CERTIFICATE');

  useEffect(() => {
    if (schoolId) {
      fetchSettings();
    } else {
      setLoading(false);
    }
  }, [schoolId]);

  const fetchSettings = async () => {
    if (!schoolId) return;
    try {
      setLoading(true);

      // 1. Fetch School
      const { data: schoolData, error: sErr } = await supabase
        .from('schools')
        .select('*')
        .eq('id', schoolId)
        .single();
      if (sErr) throw sErr;
      setSchool(schoolData);
      setSchoolName(schoolData.name || '');
      setSchoolAddress(schoolData.address || '');
      setSchoolCity(schoolData.city || '');

      // 2. Fetch Document Settings
      const { data: settingsData, error: dErr } = await supabase
        .from('school_document_settings')
        .select('*')
        .eq('school_id', schoolId)
        .maybeSingle();

      if (settingsData) {
        setDocSettings(settingsData);
        setPrintName(settingsData.school_name_print || settingsData.school_name || '');
        setOib(settingsData.oib || '');
        setCounty(settingsData.county || '');
        setPrincipalName(settingsData.principal_name || '');
        setPrincipalTitle(settingsData.principal_title || '');
        setSchoolNumber(settingsData.school_number || '');
        setKlasa(settingsData.default_klasa || '');
        setUrbroj(settingsData.default_urbroj || '');
        setSuccessLabel(settingsData.overall_success_label || '');

        // Generate public image preview URLs if present in storage paths
        setStampUrl(settingsData.stamp_url || settingsData.stamp_image_url || '');
        setPrincipalSigUrl(settingsData.principal_signature_url || '');
        setTeacherSigUrl(settingsData.teacher_signature_url || '');

        let parsedTemplate = null;
        try {
          if (settingsData.certificate_template_config) {
            parsedTemplate = JSON.parse(settingsData.certificate_template_config);
          } else if (settingsData.desired_school_name) {
            parsedTemplate = JSON.parse(settingsData.desired_school_name);
          }
        } catch (e) {
          console.log("No templates found or invalid template json");
        }
        
        const freshDefault = getDefaultTemplateConfig();
        if (parsedTemplate) {
          if (parsedTemplate.CLASS_CERTIFICATE || parsedTemplate.FINAL_WORK_CERTIFICATE) {
            setTemplateConfig({
              CLASS_CERTIFICATE: parsedTemplate.CLASS_CERTIFICATE ? { ...freshDefault.CLASS_CERTIFICATE, ...parsedTemplate.CLASS_CERTIFICATE } : freshDefault.CLASS_CERTIFICATE,
              FINAL_WORK_CERTIFICATE: parsedTemplate.FINAL_WORK_CERTIFICATE ? { ...freshDefault.FINAL_WORK_CERTIFICATE, ...parsedTemplate.FINAL_WORK_CERTIFICATE } : freshDefault.FINAL_WORK_CERTIFICATE
            });
          } else if (parsedTemplate.layout) {
            // Migrating legacy flat layout configuration to CLASS_CERTIFICATE
            setTemplateConfig({
              CLASS_CERTIFICATE: parsedTemplate,
              FINAL_WORK_CERTIFICATE: freshDefault.FINAL_WORK_CERTIFICATE
            });
          } else {
            setTemplateConfig(freshDefault);
          }
        } else {
          setTemplateConfig(freshDefault);
        }
      } else {
        setDocSettings(null);
        setTemplateConfig(getDefaultTemplateConfig());
      }
    } catch (err: any) {
      console.error('fetchSettings error', err);
      toast.error('Pogreška pri učitavanju postavki: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGeneralAndDocs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId) return;

    try {
      setSaving(true);

      // A. Update School Table
      const { error: sError } = await supabase
        .from('schools')
        .update({
          name: schoolName,
          address: schoolAddress,
          city: schoolCity
        })
        .eq('id', schoolId);
      if (sError) throw sError;

      // B. Upsert Document Settings Table
      const payload: DocumentSettingsData = {
        school_id: schoolId,
        school_name: schoolName, // synchronize
        school_name_print: printName,
        oib,
        city: schoolCity,
        county,
        principal_name: principalName,
        principal_title: principalTitle,
        school_number: schoolNumber,
        default_klasa: klasa,
        default_urbroj: urbroj,
        overall_success_label: successLabel,
        certificate_template_config: JSON.stringify(templateConfig),
        desired_school_name: JSON.stringify(templateConfig)
      };

      // Safeguard writing into both possible columns
      if (stampUrl) {
         payload.stamp_url = stampUrl;
         payload.stamp_image_url = stampUrl;
      }
      if (principalSigUrl) payload.principal_signature_url = principalSigUrl;
      if (teacherSigUrl) payload.teacher_signature_url = teacherSigUrl;

      const { error: dError } = await supabase
        .from('school_document_settings')
        .upsert(payload, { onConflict: 'school_id' });

      if (dError) throw dError;

      toast.success('Postavke škole i dokumenata su uspješno spremljene.');
      fetchSettings();
    } catch (err: any) {
      toast.error('Pogreška pri spremanju postavki: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUploadFile = async (type: 'stamp' | 'principal' | 'teacher') => {
    const file = type === 'stamp' ? stampFile : (type === 'principal' ? principalFile : teacherFile);
    if (!file) {
      toast.error('Najprije odaberite datoteku za upload.');
      return;
    }

    try {
      setUploadingType(type);
      const fileExt = file.name.split('.').pop();
      const fileName = `${schoolId}-${type}-${Math.random().toString(36).substring(3)}.${fileExt}`;
      const path = `${schoolId}/${type === 'stamp' ? 'stamps' : 'signatures'}/${fileName}`;

      // Upload file directly to school-assets bucket
      const { error: uploadError } = await supabase.storage
        .from('school-assets')
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: publicUrlData } = supabase.storage.from('school-assets').getPublicUrl(path);
      const publicUrl = publicUrlData?.publicUrl || '';

      const payload: any = {
        school_id: schoolId,
      };

      if (type === 'stamp') {
        payload.stamp_url = publicUrl;
        payload.stamp_path = path;
        payload.stamp_image_url = path;
      } else if (type === 'principal') {
        payload.principal_signature_url = publicUrl;
        payload.principal_signature_path = path;
        // general signature compatibility
        payload.signature_url = publicUrl;
        payload.signature_path = path;
      } else if (type === 'teacher') {
        payload.teacher_signature_url = publicUrl;
        payload.teacher_signature_path = path;
      }

      const { error: dbError } = await supabase
        .from('school_document_settings')
        .upsert(payload, { onConflict: 'school_id' });

      if (dbError) throw dbError;

      toast.success(`${type === 'stamp' ? 'Pečat' : 'Potpis'} uspješno uploadan i dodijeljen.`);
      
      // Clear specific file state and update preview URLs
      if (type === 'stamp') {
        setStampFile(null);
        setStampUrl(publicUrl);
      } else if (type === 'principal') {
        setPrincipalFile(null);
        setPrincipalSigUrl(publicUrl);
      } else {
        setTeacherFile(null);
        setTeacherSigUrl(publicUrl);
      }

      fetchSettings();
    } catch (err: any) {
      toast.error('Pogreška pri uploadu: ' + err.message);
    } finally {
      setUploadingType(null);
    }
  };

  // Helper to generate public URLs for rendering preview
  const getPublicPreviewUrl = (storagePath: string) => {
    if (!storagePath) return '';
    const { data } = supabase.storage.from('school-assets').getPublicUrl(storagePath);
    return data?.publicUrl || '';
  };

  return (
    <div className="p-6 font-sans bg-[#f8f9fa] min-h-screen">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Navigation & Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#dee2e6] pb-6">
          <div>
            <div className="flex items-center gap-2 text-[#005c8d] text-xs font-black uppercase tracking-widest mb-2 cursor-pointer hover:underline" onClick={() => navigate('/admin-skole')}>
              <ArrowLeft size={14} /> Natrag u administraciju
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase leading-none mb-2">Postavke škole</h1>
            <p className="text-slate-500 font-medium text-sm">Upravljanje matičnim podacima, službenim pečatima i memorandumima</p>
          </div>

          <div className="flex bg-slate-200/60 p-1 rounded-sm text-xs font-black uppercase tracking-wider">
            <button
              onClick={() => setActiveTab('SETTINGS')}
              className={`px-4 py-2 rounded-sm transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'SETTINGS'
                  ? 'bg-[#005c8d] text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Settings size={14} /> Opće postavke
            </button>
            <button
              onClick={() => setActiveTab('TEMPLATE')}
              className={`px-4 py-2 rounded-sm transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'TEMPLATE'
                  ? 'bg-[#005c8d] text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sliders size={14} /> Template svjedodžbe
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20 text-[#005c8d] animate-pulse">
            <Building2 size={48} className="animate-bounce" />
          </div>
        ) : !schoolId ? (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 p-6 text-center rounded-sm font-bold">
            Greška: Odaberite aktivnu školu najprije na popisu škola.
          </div>
        ) : activeTab === 'SETTINGS' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Form Fields column */}
            <form onSubmit={handleSaveGeneralAndDocs} className="lg:col-span-2 space-y-6">
              
              {/* General school container */}
              <div className="bg-white border border-[#dee2e6] rounded-sm p-6 shadow-xs space-y-4">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight border-b pb-2 mb-4 flex items-center gap-2">
                  <Building2 size={16} /> Opći podaci o ustanovi
                </h3>

                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Cijeli naziv škole</label>
                  <input 
                    type="text" 
                    value={schoolName}
                    onChange={e => setSchoolName(e.target.value)}
                    className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] focus:bg-white outline-none transition-all"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Adresa</label>
                    <input 
                      type="text" 
                      value={schoolAddress}
                      onChange={e => setSchoolAddress(e.target.value)}
                      className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] focus:bg-white outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Grad / Mjesto</label>
                    <input 
                      type="text" 
                      value={schoolCity}
                      onChange={e => setSchoolCity(e.target.value)}
                      className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] focus:bg-white outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Certificate & Document Settings container */}
              <div className="bg-white border border-[#dee2e6] rounded-sm p-6 shadow-xs space-y-4">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight border-b pb-2 mb-4 flex items-center gap-2">
                  <FileText size={16} /> Postavke dokumenata i svjedodžbi
                </h3>

                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Naziv škole za ispis na svjedodžbi</label>
                  <input 
                    type="text" 
                    value={printName}
                    onChange={e => setPrintName(e.target.value)}
                    className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] focus:bg-white outline-none transition-all"
                    placeholder="Ostavite prazno za zadani naziv"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">OIB škole</label>
                    <input 
                      type="text" 
                      value={oib}
                      maxLength={11}
                      onChange={e => setOib(e.target.value)}
                      className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] focus:bg-white outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Županija</label>
                    <input 
                      type="text" 
                      value={county}
                      onChange={e => setCounty(e.target.value)}
                      className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] focus:bg-white outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Ime i prezime ravnatelja</label>
                    <input 
                      type="text" 
                      value={principalName}
                      onChange={e => setPrincipalName(e.target.value)}
                      className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] focus:bg-white outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Titula ravnatelja (Ispod potpisa)</label>
                    <input 
                      type="text" 
                      value={principalTitle}
                      onChange={e => setPrincipalTitle(e.target.value)}
                      className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] focus:bg-white outline-none transition-all"
                      placeholder="npr. ravnatelj"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Zadani KLASA</label>
                    <input 
                      type="text" 
                      value={klasa}
                      onChange={e => setKlasa(e.target.value)}
                      className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] focus:bg-white outline-none transition-all"
                   />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Zadani URBROJ</label>
                    <input 
                      type="text" 
                      value={urbroj}
                      onChange={e => setUrbroj(e.target.value)}
                      className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] focus:bg-white outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Matični broj (Šifra)</label>
                    <input 
                      type="text" 
                      value={schoolNumber}
                      onChange={e => setSchoolNumber(e.target.value)}
                      className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] focus:bg-white outline-none transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Oznaka postignutog uspjeha (Pravna formula)</label>
                  <input 
                    type="text" 
                    value={successLabel}
                    onChange={e => setSuccessLabel(e.target.value)}
                    className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-3 font-bold text-slate-900 text-xs focus:border-[#005c8d] focus:bg-white outline-none transition-all"
                    placeholder="npr. završila je s odličnim (5) uspjehom"
                  />
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => navigate('/admin-skole')}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-[10px] uppercase tracking-wider py-4 rounded-sm transition-colors text-center cursor-pointer"
                >
                  Odustani
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-[#005c8d] text-white hover:bg-[#004a71] font-black text-[10px] uppercase tracking-wider py-4 rounded-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:bg-slate-300"
                >
                  <Save size={14} />
                  {saving ? 'Spremanje...' : 'Spremi sve postavke'}
                </button>
              </div>

            </form>

            {/* Sidebar Columns - Pečat & Signature Uploader */}
            <div className="space-y-6">

              {/* Stamp (Pečat) section */}
              <div className="bg-white border border-[#dee2e6] rounded-sm p-6 shadow-xs space-y-4">
                <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-wider border-b pb-2 flex items-center gap-2">
                  <FileImage size={15} /> Pečat škole (Službeni pečat)
                </h4>

                {stampUrl ? (
                  <div className="bg-slate-50 border p-4 rounded-sm flex flex-col items-center justify-center relative group min-h-[140px]">
                    <img 
                      src={getPublicPreviewUrl(stampUrl)} 
                      alt="Pečat škole preview" 
                      className="max-h-24 max-w-full object-contain mix-blend-multiply opacity-90"
                      referrerPolicy="no-referrer"
                    />
                    <span className="block text-[9px] text-slate-400 font-bold mt-2 font-mono truncate max-w-full">
                      {stampUrl.split('/').pop()}
                    </span>
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 p-4 rounded-sm text-center text-[10px] text-amber-700 font-bold">
                    Nije uploadan pečat škole.
                  </div>
                )}

                <div className="pt-2 space-y-2">
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={e => e.target.files && setStampFile(e.target.files[0])}
                    className="block w-full text-[10px] text-slate-500 file:mr-4 file:py-1.5 file:px-3 file:rounded-sm file:border-0 file:text-[10px] file:font-black file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                  />
                  {stampFile && (
                    <button
                      type="button"
                      disabled={uploadingType === 'stamp'}
                      onClick={() => handleUploadFile('stamp')}
                      className="w-full bg-slate-800 hover:bg-slate-900 text-white font-black uppercase text-[9px] py-2 rounded-sm tracking-widest flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Upload size={12} />
                      {uploadingType === 'stamp' ? 'Slanje...' : 'Upload pečata'}
                    </button>
                  )}
                </div>
              </div>

              {/* Principal Signature (Potpis) section */}
              <div className="bg-white border border-[#dee2e6] rounded-sm p-6 shadow-xs space-y-4">
                <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-wider border-b pb-2 flex items-center gap-2">
                  <Signature size={15} /> Službeni potpis ravnatelja
                </h4>

                {principalSigUrl ? (
                  <div className="bg-slate-50 border p-4 rounded-sm flex flex-col items-center justify-center min-h-[100px] relative">
                    <img 
                      src={getPublicPreviewUrl(principalSigUrl)} 
                      alt="Signature" 
                      className="max-h-16 max-w-full object-contain mix-blend-multiply"
                      referrerPolicy="no-referrer"
                    />
                    <span className="block text-[9px] text-slate-400 font-bold mt-2 font-mono truncate max-w-full">
                      {principalSigUrl.split('/').pop()}
                    </span>
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 p-4 rounded-sm text-center text-[10px] text-amber-700 font-bold">
                    Nije uploadan potpis ravnatelja.
                  </div>
                )}

                <div className="pt-2 space-y-2">
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={e => e.target.files && setPrincipalFile(e.target.files[0])}
                    className="block w-full text-[10px] text-slate-500 file:mr-4 file:py-1.5 file:px-3 file:rounded-sm file:border-0 file:text-[10px] file:font-black file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                  />
                  {principalFile && (
                    <button
                      type="button"
                      disabled={uploadingType === 'principal'}
                      onClick={() => handleUploadFile('principal')}
                      className="w-full bg-slate-800 hover:bg-slate-900 text-white font-black uppercase text-[9px] py-2 rounded-sm tracking-widest flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Upload size={12} />
                      {uploadingType === 'principal' ? 'Slanje...' : 'Upload potpisa'}
                    </button>
                  )}
                </div>
              </div>

              {/* Homeroom teacher Signature section */}
              <div className="bg-white border border-[#dee2e6] rounded-sm p-6 shadow-xs space-y-4">
                <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-wider border-b pb-2 flex items-center gap-2">
                  <Signature size={15} /> Predložak potpisa razrednika
                </h4>

                {teacherSigUrl ? (
                  <div className="bg-slate-50 border p-4 rounded-sm flex flex-col items-center justify-center min-h-[100px] relative">
                    <img 
                      src={getPublicPreviewUrl(teacherSigUrl)} 
                      alt="Teacher signature" 
                      className="max-h-16 max-w-full object-contain mix-blend-multiply"
                      referrerPolicy="no-referrer"
                    />
                    <span className="block text-[9px] text-slate-400 font-bold mt-2 font-mono truncate max-w-full">
                      {teacherSigUrl.split('/').pop()}
                    </span>
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 p-4 rounded-sm text-center text-[10px] text-amber-700 font-bold">
                    Nije uploadan opći potpis razrednika.
                  </div>
                )}

                <div className="pt-2 space-y-2">
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={e => e.target.files && setTeacherFile(e.target.files[0])}
                    className="block w-full text-[10px] text-slate-500 file:mr-4 file:py-1.5 file:px-3 file:rounded-sm file:border-0 file:text-[10px] file:font-black file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                  />
                  {teacherFile && (
                    <button
                      type="button"
                      disabled={uploadingType === 'teacher'}
                      onClick={() => handleUploadFile('teacher')}
                      className="w-full bg-slate-800 hover:bg-slate-900 text-white font-black uppercase text-[9px] py-2 rounded-sm tracking-widest flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Upload size={12} />
                      {uploadingType === 'teacher' ? 'Slanje...' : 'Upload potpisa'}
                    </button>
                  )}
                </div>
              </div>

            </div>

          </div>
        ) : (
          /* TEMPLATE Tab content with interactive editor & live preview */
          <div className="space-y-6">
            
            {/* Template type selection tabs */}
            <div className="flex border-b border-[#dee2e6] bg-slate-50 p-1 rounded-sm gap-2">
              <button
                type="button"
                onClick={() => setEditingTemplateType('CLASS_CERTIFICATE')}
                className={`flex-1 py-3 px-4 font-black text-xs uppercase tracking-wider rounded-xs transition-all cursor-pointer text-center ${
                  editingTemplateType === 'CLASS_CERTIFICATE'
                    ? 'bg-[#005c8d] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 bg-transparent hover:bg-slate-100'
                }`}
              >
                1. Razredna svjedodžba (CLASS_CERTIFICATE)
              </button>
              <button
                type="button"
                onClick={() => setEditingTemplateType('FINAL_WORK_CERTIFICATE')}
                className={`flex-1 py-3 px-4 font-black text-xs uppercase tracking-wider rounded-xs transition-all cursor-pointer text-center ${
                  editingTemplateType === 'FINAL_WORK_CERTIFICATE'
                    ? 'bg-[#005c8d] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 bg-transparent hover:bg-slate-100'
                }`}
              >
                2. Svjedodžba o završnome radu (FINAL_WORK_CERTIFICATE)
              </button>
            </div>

            {/* Helper block explaining dynamic placeholders */}
            <div className="bg-slate-50 border border-slate-200 rounded-sm p-4 text-xs font-bold text-slate-700 flex items-center gap-3">
              <span className="p-1.5 rounded-full bg-slate-200 text-slate-800"><Sliders size={16} /></span>
              <span>Trenutno uređujete predložak za: <u className="text-[#005c8d] uppercase">{editingTemplateType === 'CLASS_CERTIFICATE' ? 'Razredne svjedodžbe' : 'Svjedodžbu o završnome radu'}</u>. Sve promjene, stilovi i koordinate ispod primjenjuju se specifično za ovaj tip dokumenta.</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            
            {/* Editor column (col-span-2) */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Box 1: Border & Watermark Layout */}
              <div className="bg-white border border-[#dee2e6] rounded-sm p-5 shadow-xs space-y-4">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-tight border-b pb-2 flex items-center gap-1.5">
                  <Layers size={14} className="text-[#005c8d]" /> Izgled i Službeni obrub
                </h3>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Stil obruba svjedodžbe</label>
                    <select
                      value={(templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType]).layout?.borderStyle || 'double-turquoise'}
                      onChange={e => {
                        const curr = templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType];
                        setTemplateConfig({
                          ...templateConfig,
                          [editingTemplateType]: {
                            ...curr,
                            layout: { ...curr.layout, borderStyle: e.target.value }
                          }
                        });
                      }}
                      className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-2 text-xs font-bold text-slate-900 outline-none"
                    >
                      <option value="double-turquoise">Klasični tirkizni dupli obrub</option>
                      <option value="sleek-dark">Moderni tamno sivi tanki obrub</option>
                      <option value="gold-line">Zlatni obrub s ornamentima</option>
                      <option value="minimal">Minimalistički obrub bez kuteva</option>
                      <option value="none">Bez obruba i ukrasa</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-4 pt-1">
                    <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType]).layout?.showBorder ?? true}
                        onChange={e => {
                          const curr = templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType];
                          setTemplateConfig({
                            ...templateConfig,
                            [editingTemplateType]: {
                              ...curr,
                              layout: { ...curr.layout, showBorder: e.target.checked }
                            }
                          });
                        }}
                        className="rounded-sm border-[#dee2e6] text-[#005c8d] focus:ring-[#005c8d] cursor-pointer"
                      />
                      Prikaži obrub
                    </label>

                    <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType]).layout?.showWatermark ?? true}
                        onChange={e => {
                          const curr = templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType];
                          setTemplateConfig({
                            ...templateConfig,
                            [editingTemplateType]: {
                              ...curr,
                              layout: { ...curr.layout, showWatermark: e.target.checked }
                            }
                          });
                        }}
                        className="rounded-sm border-[#dee2e6] text-[#005c8d] focus:ring-[#005c8d] cursor-pointer"
                      />
                      Vodeni žig PROBNI ISPIS
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="block text-[8px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Margina GORE / DOLJE (mm)</label>
                      <input
                        type="number"
                        min="5"
                        max="40"
                        value={(templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType]).layout?.topMargin ?? 15}
                        onChange={e => {
                          const val = parseInt(e.target.value) || 15;
                          const curr = templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType];
                          setTemplateConfig({
                            ...templateConfig,
                            [editingTemplateType]: {
                              ...curr,
                              layout: { ...curr.layout, topMargin: val, bottomMargin: val }
                            }
                          });
                        }}
                        className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-2 text-xs font-bold text-slate-900 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[8px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Margina LIJEVO / DESNO (mm)</label>
                      <input
                        type="number"
                        min="5"
                        max="40"
                        value={(templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType]).layout?.leftMargin ?? 20}
                        onChange={e => {
                          const val = parseInt(e.target.value) || 20;
                          const curr = templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType];
                          setTemplateConfig({
                            ...templateConfig,
                            [editingTemplateType]: {
                              ...curr,
                              layout: { ...curr.layout, leftMargin: val, rightMargin: val }
                            }
                          });
                        }}
                        className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-2 text-xs font-bold text-slate-900 outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Box 2: Typography Settings */}
              <div className="bg-white border border-[#dee2e6] rounded-sm p-5 shadow-xs space-y-4">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-tight border-b pb-2 flex items-center gap-1.5">
                  <Type size={14} className="text-[#005c8d]" /> Veličina fontova (pt)
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[8px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Zaglavlje (REPUBLIKA HR...)</label>
                    <input
                      type="number"
                      value={(templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType]).typography?.headerFontSize ?? 11}
                      onChange={e => {
                        const curr = templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType];
                        setTemplateConfig({
                          ...templateConfig,
                          [editingTemplateType]: {
                            ...curr,
                            typography: { ...curr.typography, headerFontSize: parseInt(e.target.value) || 11 }
                          }
                        });
                      }}
                      className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-2 text-xs font-bold text-slate-900 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Cijeli naziv škole</label>
                    <input
                      type="number"
                      value={(templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType]).typography?.schoolNameFontSize ?? 14}
                      onChange={e => {
                        const curr = templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType];
                        setTemplateConfig({
                          ...templateConfig,
                          [editingTemplateType]: {
                            ...curr,
                            typography: { ...curr.typography, schoolNameFontSize: parseInt(e.target.value) || 14 }
                          }
                        });
                      }}
                      className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-2 text-xs font-bold text-slate-900 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Glavni naslov (SVJEDODŽBA)</label>
                    <input
                      type="number"
                      value={(templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType]).typography?.titleFontSize ?? 22}
                      onChange={e => {
                        const curr = templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType];
                        setTemplateConfig({
                          ...templateConfig,
                          [editingTemplateType]: {
                            ...curr,
                            typography: { ...curr.typography, titleFontSize: parseInt(e.target.value) || 22 }
                          }
                        });
                      }}
                      className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-2 text-xs font-bold text-slate-900 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Ime i prezime učenika</label>
                    <input
                      type="number"
                      value={(templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType]).typography?.studentNameFontSize ?? 18}
                      onChange={e => {
                        const curr = templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType];
                        setTemplateConfig({
                          ...templateConfig,
                          [editingTemplateType]: {
                            ...curr,
                            typography: { ...curr.typography, studentNameFontSize: parseInt(e.target.value) || 18 }
                          }
                        });
                      }}
                      className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-2 text-xs font-bold text-slate-900 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Tekst o učeniku / programu</label>
                    <input
                      type="number"
                      value={(templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType]).typography?.bodyFontSize ?? 10}
                      onChange={e => {
                        const curr = templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType];
                        setTemplateConfig({
                          ...templateConfig,
                          [editingTemplateType]: {
                            ...curr,
                            typography: { ...curr.typography, bodyFontSize: parseInt(e.target.value) || 10 }
                          }
                        });
                      }}
                      className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-2 text-xs font-bold text-slate-900 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Tablica ocjena (Nastavni predmet)</label>
                    <input
                      type="number"
                      value={(templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType]).typography?.tableBodyFontSize ?? 9}
                      onChange={e => {
                        const curr = templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType];
                        setTemplateConfig({
                          ...templateConfig,
                          [editingTemplateType]: {
                            ...curr,
                            typography: { 
                              ...curr.typography, 
                              tableHeaderFontSize: parseInt(e.target.value) || 10,
                              tableBodyFontSize: parseInt(e.target.value) || 9 
                            }
                          }
                        });
                      }}
                      className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-2 text-xs font-bold text-slate-900 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Box 3: Službeni Tekstovi i Predlošci */}
              <div className="bg-white border border-[#dee2e6] rounded-sm p-5 shadow-xs space-y-4">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-tight border-b pb-2 flex items-center gap-1.5">
                  <Type size={14} className="text-[#005c8d]" /> Službeni Tekstovi i Dinamički Opis
                </h3>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Službena država u zaglavlju</label>
                    <input
                      type="text"
                      value={(templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType]).texts?.headerCountry || 'REPUBLIKA HRVATSKA'}
                      onChange={e => {
                        const curr = templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType];
                        setTemplateConfig({
                          ...templateConfig,
                          [editingTemplateType]: {
                            ...curr,
                            texts: { ...curr.texts, headerCountry: e.target.value }
                          }
                        });
                      }}
                      className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-2 text-xs font-bold text-slate-900 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Naziv dokumenta (Naslov)</label>
                    <input
                      type="text"
                      value={(templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType]).texts?.documentTitle || 'SVJEDODŽBA'}
                      onChange={e => {
                        const curr = templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType];
                        setTemplateConfig({
                          ...templateConfig,
                          [editingTemplateType]: {
                            ...curr,
                            texts: { ...curr.texts, documentTitle: e.target.value }
                          }
                        });
                      }}
                      className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-2 text-xs font-bold text-slate-900 outline-none"
                    />
                  </div>

                  {editingTemplateType === 'FINAL_WORK_CERTIFICATE' && (
                    <div>
                      <label className="block text-[9px] font-extrabold text-slate-500 uppercase tracking-wider mb-1">Podnaslov svjedodžbe</label>
                      <input
                        type="text"
                        value={(templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType]).texts?.documentSubtitle || 'O ZAVRŠNOME RADU'}
                        onChange={e => {
                          const curr = templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType];
                          setTemplateConfig({
                            ...templateConfig,
                            [editingTemplateType]: {
                              ...curr,
                              texts: { ...curr.texts, documentSubtitle: e.target.value }
                            }
                          });
                        }}
                        className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-2 text-xs font-bold text-slate-900 outline-none"
                      />
                    </div>
                  )}

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-[9px] font-extrabold text-slate-500 uppercase tracking-wider">Predložak teksta o učeniku</label>
                      <span className="text-[8px] bg-[#005c8d]/10 text-[#005c8d] px-1 rounded-sm font-mono uppercase font-extrabold">Dinamički tekst</span>
                    </div>
                    <textarea
                      rows={5}
                      value={(templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType]).texts?.bodyTemplate || ''}
                      onChange={e => {
                        const curr = templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType];
                        setTemplateConfig({
                          ...templateConfig,
                          [editingTemplateType]: {
                            ...curr,
                            texts: { ...curr.texts, bodyTemplate: e.target.value }
                          }
                        });
                      }}
                      className="w-full bg-[#f8f9fa] border border-[#dee2e6] rounded-sm p-2 text-xs font-medium text-slate-900 outline-none font-sans leading-relaxed resize-none"
                    />
                    
                    {/* Helper tags for merging */}
                    <div className="pt-2">
                      <span className="block text-[8px] font-extrabold text-slate-500 uppercase tracking-tight mb-1">Klikni za umetanje tokena u tekst:</span>
                      <div className="flex flex-wrap gap-1">
                        {[
                          { token: '{birthday}', label: 'rođendan' },
                          { token: '{birthplace}', label: 'mjesto rođenja' },
                          { token: '{birth_country}', label: 'država' },
                          { token: '{citizenship}', label: 'državljanstvo' },
                          { token: '{parents_name}', label: 'roditelji' },
                          { token: '{school_year}', label: 'šk. god' },
                          ...(editingTemplateType === 'CLASS_CERTIFICATE' 
                            ? [{ token: '{class_year}', label: 'razred' }]
                            : [{ token: '{class_code}', label: 'oznaka razreda' }]
                          ),
                          { token: '{program_name}', label: 'zanimanje' },
                          { token: '{duration_years}', label: 'trajanje' },
                          ...(editingTemplateType === 'FINAL_WORK_CERTIFICATE'
                            ? [
                                { token: '{thesis_title}', label: 'tema rada' },
                                { token: '{date_conditions_met}', label: 'datum uvjeta' }
                              ]
                            : []
                          )
                        ].map(t => (
                          <button
                            key={t.token}
                            type="button"
                            onClick={() => {
                              const curr = templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType];
                              const currentVal = curr.texts?.bodyTemplate || '';
                              setTemplateConfig({
                                ...templateConfig,
                                [editingTemplateType]: {
                                  ...curr,
                                  texts: { ...curr.texts, bodyTemplate: currentVal + ' ' + t.token + ' ' }
                                }
                              });
                            }}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded-sm text-[8px] font-extrabold uppercase font-mono tracking-wide"
                          >
                            {t.token} ({t.label})
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Box 4: Display Options */}
              <div className="bg-white border border-[#dee2e6] rounded-sm p-5 shadow-xs space-y-4">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-tight border-b pb-2 flex items-center gap-1.5">
                  <Sliders size={14} className="text-[#005c8d]" /> Elementi i Koordinate prikaza
                </h3>

                <div className="space-y-3">
                  <div className="flex flex-col gap-2 pt-1">
                    {editingTemplateType === 'CLASS_CERTIFICATE' && (
                      <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType]).elements?.splitSubjects ?? true}
                          onChange={e => {
                            const curr = templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType];
                            setTemplateConfig({
                              ...templateConfig,
                              [editingTemplateType]: {
                                ...curr,
                                elements: { ...curr.elements, splitSubjects: e.target.checked }
                              }
                            });
                          }}
                          className="rounded-sm border-[#dee2e6] text-[#005c8d] focus:ring-[#005c8d] cursor-pointer"
                        />
                        Razdvoji nastavne predmete na obvezne i izborne (Preporučeno)
                      </label>
                    )}

                    <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType]).elements?.showStamp ?? true}
                        onChange={e => {
                          const curr = templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType];
                          setTemplateConfig({
                            ...templateConfig,
                            [editingTemplateType]: {
                              ...curr,
                              elements: { ...curr.elements, showStamp: e.target.checked }
                            }
                          });
                        }}
                        className="rounded-sm border-[#dee2e6] text-[#005c8d] focus:ring-[#005c8d] cursor-pointer"
                      />
                      Prikaži pečat škole (M.P.)
                    </label>

                    <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType]).elements?.showSignatures ?? true}
                        onChange={e => {
                          const curr = templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType];
                          setTemplateConfig({
                            ...templateConfig,
                            [editingTemplateType]: {
                              ...curr,
                              elements: { ...curr.elements, showSignatures: e.target.checked }
                            }
                          });
                        }}
                        className="rounded-sm border-[#dee2e6] text-[#005c8d] focus:ring-[#005c8d] cursor-pointer"
                      />
                      Prikaži potpise razrednika i ravnatelja
                    </label>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-[9px] font-extrabold text-slate-500 uppercase tracking-wider">Vertikalna visina potpisa (Y u mm)</label>
                      <span className="text-[10px] font-mono text-slate-900 font-extrabold">{(templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType]).elements?.signatureLineY ?? 255}mm</span>
                    </div>
                    <input
                      type="range"
                      min="180"
                      max="285"
                      value={(templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType]).elements?.signatureLineY ?? 255}
                      onChange={e => {
                        const curr = templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType];
                        setTemplateConfig({
                          ...templateConfig,
                          [editingTemplateType]: {
                            ...curr,
                            elements: { ...curr.elements, signatureLineY: parseInt(e.target.value) }
                          }
                        });
                      }}
                      className="w-full accent-[#005c8d] h-1.5 bg-slate-200 rounded-sm cursor-pointer"
                    />
                    <span className="block text-[8px] text-slate-400 font-bold mt-1">
                      {editingTemplateType === 'CLASS_CERTIFICATE' 
                        ? 'Prilagodite Y koordinatu kako biste izbjegli preklapanje preko tablice ako učenik ima puno predmeta'
                        : 'Prilagodite Y koordinatu za potpise i pečat na dnu svjedodžbe o završnom radu'
                      }
                    </span>
                  </div>
                </div>
              </div>

              {/* Global Save Button */}
              <button
                type="button"
                onClick={handleSaveGeneralAndDocs}
                disabled={saving}
                className="w-full bg-[#005c8d] hover:bg-[#004a71] text-white font-black text-xs uppercase tracking-widest py-4 rounded-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:bg-slate-300"
              >
                <Save size={16} />
                {saving ? 'Spremanje...' : 'Spremi promjene predloška'}
              </button>

            </div>

            {/* Visual Interactive Live Preview column (col-span-3) */}
            <div className="lg:col-span-3 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase font-black tracking-widest text-[#005c8d] flex items-center gap-1">
                  <Eye size={12} strokeWidth={2} /> Autentičan prikazi na papiru (A4)
                </span>
                <span className="text-[8px] bg-emerald-50 text-emerald-800 px-2 py-0.5 font-bold uppercase rounded-sm border border-emerald-100">Aktivan predložak</span>
              </div>

              {/* The Paper sheet container */}
              <div className="relative bg-[#faf7f3] border border-slate-300 rounded-sm shadow-xl p-8 min-h-[750px] font-serif prose whitespace-normal text-slate-900 flex flex-col justify-between overflow-hidden">
                {(() => {
                  const activeConf = templateConfig[editingTemplateType] || (getDefaultTemplateConfig() as any)[editingTemplateType];
                  return (
                    <>
                      {/* Visual double border matching double-turquoise or gold or sleek */}
                      {activeConf.layout?.showBorder && (
                        <div className={`absolute inset-4 pointer-events-none ${
                          activeConf.layout?.borderStyle === 'double-turquoise' ? 'border-[3px] border-double border-[#4ebec7] rounded-sm' :
                          activeConf.layout?.borderStyle === 'sleek-dark' ? 'border border-[#2d3748] rounded-none' :
                          activeConf.layout?.borderStyle === 'gold-line' ? 'border-2 border-[#d4af37] after:absolute after:inset-1 after:border after:border-[#d4af37] rounded-sm' :
                          activeConf.layout?.borderStyle === 'minimal' ? 'border-y-2 border-x-0 border-[#1e293b]' : ''
                        }`} />
                      )}

                      {/* Simulated Watermark if checked */}
                      {activeConf.layout?.showWatermark && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden select-none opacity-4 z-0">
                          <span className="text-[52px] font-mono font-black text-slate-400/10 rotate-45 transform uppercase tracking-widest whitespace-nowrap">
                            PROBNI ISPIS
                          </span>
                        </div>
                      )}

                      <div className="z-10 space-y-6 relative flex-1 font-serif">
                        
                        {/* Country header */}
                        <div className="text-center font-serif font-medium tracking-[0.2em] uppercase leading-none" style={{ fontSize: `${activeConf.typography?.headerFontSize ?? 11}px` }}>
                          {activeConf.texts?.headerCountry || 'REPUBLIKA HRVATSKA'}
                        </div>

                        {/* School title */}
                        <div className="text-center font-serif font-black uppercase tracking-tight text-slate-900" style={{ fontSize: `${activeConf.typography?.schoolNameFontSize ?? 14}px` }}>
                          {schoolName || 'UGOSTITELJSKO-TURISTIČKO UČILIŠTE, ZAGREB'}
                        </div>

                        {/* Doc details row */}
                        <div className="flex justify-between items-baseline text-[9px] font-sans font-bold text-slate-600 border-b border-dashed pb-2 mx-4 uppercase">
                          <div className="space-y-1">
                            <div>OIB škole: {oib || '81245638102'}</div>
                            <div>Matični br. učenika: 2415/26</div>
                          </div>
                          <div className="text-right space-y-1">
                            <div>KLASA: {klasa || '602-03/24-03/01'}</div>
                            <div>URBROJ: {urbroj || '251-140-02-23-4-2a-1'}</div>
                          </div>
                        </div>

                        {/* Document giant title */}
                        <div className="text-center py-4">
                          <h2 className="font-serif uppercase tracking-[0.15em] font-extrabold leading-none border-b border-double border-slate-900 inline-block pb-1" style={{ fontSize: `${activeConf.typography?.titleFontSize ?? 22}px` }}>
                            {activeConf.texts?.documentTitle || 'SVJEDODŽBA'}
                          </h2>
                          {editingTemplateType === 'FINAL_WORK_CERTIFICATE' && (
                            <h3 className="block font-serif uppercase tracking-[0.1em] font-bold text-[13px] text-slate-800 mt-2">
                              {activeConf.texts?.documentSubtitle || 'O ZAVRŠNOME RADU'}
                            </h3>
                          )}
                        </div>

                        {/* Student Name */}
                        <div className="text-center">
                          <span className="block text-[10px] font-sans font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">učenik/ca</span>
                          <h1 className="font-serif font-black uppercase text-slate-900 leading-none" style={{ fontSize: `${activeConf.typography?.studentNameFontSize ?? 18}px` }}>
                            NIKOLA ĐURIĆ
                          </h1>
                          <span className="block text-[9px] text-slate-500 font-sans font-bold uppercase tracking-wider mt-1">OIB: 98896944712   |   spol: Muški</span>
                        </div>

                        {/* Personal data dynamic wrap paragraph */}
                        <div 
                          className="font-serif text-justify leading-relaxed mx-4 hyphens-auto"
                          style={{ fontSize: `${activeConf.typography?.bodyFontSize ?? 10}px` }}
                        >
                          rođen 10.12.2005. godine u Zagrebu, Republika Hrvatska, državljanstvo Republika Hrvatska, ime i prezime roditelja/skrbnika: Dražen Đurić, 
                          {editingTemplateType === 'CLASS_CERTIFICATE' ? (
                            <span> upisao je školske godine {docSettings?.overall_success_label ? '2023./24.' : '____/_____'} prvi put prvi razred programa obrazovanja za zanimanje/strukovnog kurikuluma za stjecanje kvalifikacije kuhar u trajanju od tri godine i postigao sljedeći uspjeh:</span>
                          ) : (
                            <span> s uspjehom je završio izradbu i obranu završnoga rada u strukovnom programu obrazovanja za zanimanje kuhar školske godine 2023./2024. te je postigao sljedeći uspjeh:</span>
                          )}
                        </div>

                        {/* Dynamic split subject tables or final work grades */}
                        {editingTemplateType === 'CLASS_CERTIFICATE' ? (
                          <>
                            {activeConf.elements?.showTable && (
                              <div className="mx-4 font-serif border border-slate-400">
                                {activeConf.elements?.splitSubjects ? (
                                  <>
                                    <div className="bg-slate-100 text-left px-3 py-1 font-sans text-[9px] font-extrabold border-b border-slate-400 uppercase tracking-wider">
                                      I. Obvezni Predmeti
                                    </div>
                                    {[
                                      ['Hrvatski jezik', 'odličan (5)'],
                                      ['Matematika', 'vrlo dobar (4)'],
                                      ['Engleski jezik', 'odličan (5)']
                                    ].map(([subj, gr], i) => (
                                      <div key={i} className="flex justify-between items-center px-4 py-1.5 border-b border-slate-200 text-xs">
                                        <span className="font-medium font-serif">{subj}</span>
                                        <span className="font-bold underline font-sans text-[11px]">{gr}</span>
                                      </div>
                                    ))}

                                    <div className="bg-slate-100 text-left px-3 py-1 font-sans text-[9px] font-extrabold border-y border-slate-400 uppercase tracking-wider">
                                      II. Izborni Predmeti
                                    </div>
                                    {[
                                      ['Vjeronauk', 'odličan (5)'],
                                      ['Informatika', 'odličan (5)']
                                    ].map(([subj, gr], i) => (
                                      <div key={i} className="flex justify-between items-center px-4 py-1.5 border-b border-slate-200 text-xs last:border-b-0">
                                        <span className="font-medium font-serif">{subj}</span>
                                        <span className="font-bold underline font-sans text-[11px]">{gr}</span>
                                      </div>
                                    ))}
                                  </>
                                ) : (
                                  <>
                                    <div className="bg-slate-100 flex justify-between px-4 py-1.5 font-sans text-[9px] font-black uppercase border-b border-slate-400">
                                      <span>Nastavni predmet</span>
                                      <span>Zaključna ocjena</span>
                                    </div>
                                    {[
                                      ['Hrvatski jezik', 'odličan (5)'],
                                      ['Matematika', 'vrlo dobar (4)'],
                                      ['Engleski jezik', 'odličan (5)'],
                                      ['Vjeronauk (izborni)', 'odličan (5)'],
                                    ].map(([subj, gr], i) => (
                                      <div key={i} className="flex justify-between items-center px-4 py-1.5 border-b border-slate-200 text-xs last:border-b-0">
                                        <span className="font-medium font-serif">{subj}</span>
                                        <span className="font-bold underline font-sans text-[11px]">{gr}</span>
                                      </div>
                                    ))}
                                  </>
                                )}
                              </div>
                            )}
                          </>
                        ) : (
                          /* FINAL WORK CERTIFICATE Layout specifics (grade definitions and design) */
                          <div className="mx-4 font-serif space-y-3">
                            <div className="border border-slate-400">
                              <div className="bg-slate-100 text-left px-3 py-1 font-sans text-[9px] font-extrabold border-b border-slate-400 uppercase tracking-wider">
                                Rezultat i ocjene završnoga rada
                              </div>
                              <div className="flex justify-between items-center px-4 py-2 border-b border-slate-200 text-xs text-slate-800">
                                <span className="font-serif">Tema / naslov završnog rada:</span>
                                <span className="font-bold font-sans text-right max-w-[60%]">"Implementacija suvremene gastronomske ponude"</span>
                              </div>
                              <div className="flex justify-between items-center px-4 py-2 border-b border-slate-200 text-xs">
                                <span className="font-serif">Ocjena izradbe završnog rada:</span>
                                <span className="font-bold underline font-sans text-[11px]">odličan (5)</span>
                              </div>
                              <div className="flex justify-between items-center px-4 py-2 text-xs">
                                <span className="font-serif">Ocjena obrane završnog rada:</span>
                                <span className="font-bold underline font-sans text-[11px]">odličan (5)</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Summary details box */}
                        {editingTemplateType === 'CLASS_CERTIFICATE' ? (
                          <div className="grid grid-cols-2 gap-4 border border-dashed border-slate-300 bg-slate-50/50 p-3 mx-4 text-xs font-serif">
                            <div className="space-y-1 leading-normal">
                              <div><strong>Opći uspjeh učenika:</strong> <span className="underline font-bold">odličan (5)</span></div>
                              <div><strong>Opći prosjek:</strong> <span className="underline">4.67</span></div>
                            </div>
                            <div className="space-y-1">
                              <div><strong>Vladanje:</strong> <span className="underline">uzorno</span></div>
                              <div><strong>Izostanci (opravdano):</strong> <span className="underline">0 sati</span></div>
                            </div>
                          </div>
                        ) : (
                          <div className="border border-dashed border-slate-300 bg-slate-50/50 p-3 mx-4 text-xs font-serif">
                            <div className="flex justify-between leading-normal">
                              <div><strong>Opći uspjeh iz završnoga rada:</strong> <span className="underline font-bold">odličan (5)</span></div>
                              <div><strong>Stečeno zanimanje:</strong> <span className="underline font-bold">kuhar</span></div>
                            </div>
                          </div>
                        )}

                      </div>

                      {/* Footer block: signatures and stamp positioned logically at the bottom area */}
                      <div className="mt-8 mx-4 z-10 font-serif">
                        <div className="text-[10px] text-slate-500 font-sans font-bold uppercase mb-4">
                          U {county || 'Zagrebu'}, {new Date().toLocaleDateString('hr-HR')}. godine
                        </div>

                        <div className="flex justify-between items-end relative min-h-[60px] border-t border-slate-300 pt-3">
                          
                          {/* Teacher signature left */}
                          <div className="text-center w-1/3">
                            <div className="h-8 flex items-center justify-center relative">
                              {teacherSigUrl && activeConf.elements?.showSignatures && (
                                <img 
                                  src={getPublicPreviewUrl(teacherSigUrl)} 
                                  alt="razrednik sig" 
                                  className="max-h-6 object-contain mix-blend-multiply opacity-80"
                                  referrerPolicy="no-referrer"
                                />
                              )}
                            </div>
                            <span className="block border-t border-slate-400 mt-1" />
                            <span className="text-[9px] font-sans font-bold text-slate-500 block mt-1 uppercase">Razrednik</span>
                          </div>

                          {/* Stamp center */}
                          <div className="flex flex-col items-center justify-center w-1/3 min-h-[50px]">
                            {stampUrl && activeConf.elements?.showStamp ? (
                              <div className="relative">
                                <img 
                                  src={getPublicPreviewUrl(stampUrl)} 
                                  alt="stamp" 
                                  className="max-h-12 w-12 object-contain mix-blend-multiply opacity-80"
                                  referrerPolicy="no-referrer"
                                />
                                <span className="absolute inset-0 text-[6px] text-slate-400 font-bold font-sans flex items-center justify-center">M.P.</span>
                              </div>
                            ) : (
                              <span className="text-[10px] font-sans font-bold text-slate-400">M.P.</span>
                            )}
                          </div>

                          {/* Principal right */}
                          <div className="text-center w-1/3">
                            <div className="h-8 flex items-center justify-center relative">
                              {principalSigUrl && activeConf.elements?.showSignatures && (
                                <img 
                                  src={getPublicPreviewUrl(principalSigUrl)} 
                                  alt="principal sig" 
                                  className="max-h-6 object-contain mix-blend-multiply opacity-80"
                                  referrerPolicy="no-referrer"
                                />
                              )}
                            </div>
                            <span className="block font-sans text-[8px] font-black truncate max-w-full z-10 leading-none">
                              {principalName || 'Ravnatelj Ime'}
                            </span>
                            <span className="block border-t border-slate-400 mt-1" />
                            <span className="text-[9px] font-sans font-bold text-slate-500 block mt-1 uppercase">{principalTitle || 'Ravnatelj'}</span>
                          </div>

                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

          </div>
        </div>
        )}
      </div>
    </div>
  );
}
