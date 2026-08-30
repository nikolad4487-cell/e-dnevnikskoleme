import React, { useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import toast from 'react-hot-toast';
import { Download, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { registerUnicodeFont } from '../../lib/pdfGenerator';

type CertificateRecord = {
  id: string;
  issuedAt: string;
  purpose: string;
  studentName: string;
  verification: VerificationData;
};

type VerificationData = {
  serialNumber: string;
  recordNumber: string;
  controlNumber: string;
  seal: string;
};

const CERTIFICATE_PURPOSES = [
  'dobivanja sredstava za izgradnju kuće ili obnovu kuće na području posebne državne skrbi',
  'dobivanja vize',
  'dokaza da je učenik upisan u glazbenu školu',
  'dokaza o pohađanju deficitarnog zanimanja',
  'financiranja/sufinanciranja troškova nabave školskih udžbenika',
  'isplate invalidnine za roditelje',
  'isplate naknade za tuđu pomoć i njegu',
  'ostvarivanja popusta prilikom kupnje antivirus programa, nabavke kompjuterske opreme i korištenja internet usluga',
  'ostvarivanja prava kod sezonskog zapošljavanja učenika',
  'ostvarivanja prava kod upisa djece u jaslice',
  'ostvarivanja prava na besplatne udžbenike',
  'ostvarivanja prava na besplatnu školsku kuhinju za brata/sestru',
  'ostvarivanja prava na dječji doplatak',
  'ostvarivanja prava na dopunsko zdravstveno osiguranje',
  'ostvarivanja prava na humanitarnu pomoć',
  'ostvarivanja prava na jednokratnu financijsku pomoć',
  'ostvarivanja prava na obiteljsku mirovinu',
  'ostvarivanja prava na pomoć za podmirivanje troškova školske prehrane',
  'ostvarivanja prava na popust prilikom učlanjenja u gradsku knjižnicu',
  'ostvarivanja prava na poreznu olakšicu',
  'ostvarivanja prava na povlastice kod kupnje voznih karata (učeničke iskaznice)',
  'ostvarivanja prava na redovito zdravstveno osiguranje',
  'ostvarivanja prava na socijalnu pomoć',
  'ostvarivanja prava na socijalnu skrb',
  'ostvarivanja prava na subvenciju za brata ili sestru',
  'ostvarivanja prava na učenički prijevoz',
  'ostvarivanja prava roditelja kod zapošljavanja',
  'ostvarivanja studentskih prava braće/sestara',
  'ostvarivanje prava prilikom otvaranja bankovnog računa',
  'plaćenog dopusta roditelja zbog prilagodbe djeteta koje kreće u prvi razred',
  'primanja obiteljske invalidnine',
  'priznavanja prava na opskrbninu hrvatskom branitelju',
  'sanitarnog pregleda',
  'smještaja brata ili sestre u studentski dom',
  'smještaja u učeničkom domu',
  'stambenog zbrinjavanja',
  'stipendiranja',
  'subvencija troškova produženog boravka',
  'subvencije udžbenika',
  'subvencioniranja troškova prijevoza od lokalne samouprave',
  'upisa učenika na fakultet',
  'upisa učenika u srednju školu',
  'vođenja prekršajnog postupka',
  'vođenja procesa za naplatu alimentacije',
];

const randomString = (length: number, alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') => {
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join('');
};

const randomDigits = (length: number) => randomString(length, '0123456789');

const createVerification = (): VerificationData => ({
  serialNumber: randomDigits(34),
  recordNumber: `2026-33-${randomDigits(4)}`,
  controlNumber: `${randomDigits(3)}-${randomDigits(3)}-${randomDigits(3)}`,
  seal: `${randomString(46)}\n${randomString(46)}\n${randomString(36)}`,
});

const formatDate = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('hr-HR');
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  return `${date.toLocaleDateString('hr-HR')} ${date.toLocaleTimeString('hr-HR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
};

const getGradeLevel = (className?: string) => {
  const match = (className || '').match(/\d+/);
  return match?.[0] || '';
};

const storageKey = (studentId?: string) => `studentCertificates:${studentId || 'unknown'}`;

export default function PotvrdePage() {
  const { user: currentUser } = useAuth();
  const { selectedChildId, selectedClassId, selectedSchoolId } = useSelection();
  const targetStudentId = selectedChildId || currentUser?.id;

  const [loading, setLoading] = useState(true);
  const [purpose, setPurpose] = useState('');
  const [viewMode, setViewMode] = useState<'generate' | 'history'>('generate');
  const [studentProfile, setStudentProfile] = useState<any>(null);
  const [classInfo, setClassInfo] = useState<any>(null);
  const [programInfo, setProgramInfo] = useState<any>(null);
  const [schoolInfo, setSchoolInfo] = useState<any>(null);
  const [certificates, setCertificates] = useState<CertificateRecord[]>([]);

  useEffect(() => {
    const loadData = async () => {
      if (!targetStudentId) return;
      setLoading(true);

      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', targetStudentId)
        .maybeSingle();

      if (profileError) {
        console.error('Certificate profile load error:', profileError);
      }

      const enrollmentQuery = supabase
        .from('student_class_enrollments')
        .select('*, classes:class_id (*), programs:program_id (*)')
        .eq('student_id', targetStudentId)
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: false });

      const { data: enrollment, error: enrollmentError } = selectedClassId
        ? await enrollmentQuery.eq('class_id', selectedClassId).limit(1).maybeSingle()
        : await enrollmentQuery.limit(1).maybeSingle();

      if (enrollmentError) {
        console.error('Certificate enrollment load error:', enrollmentError);
      }

      const cls = (enrollment as any)?.classes || null;
      const program = (enrollment as any)?.programs || null;
      const schoolId = cls?.school_id || selectedSchoolId;

      let school = null;
      if (schoolId) {
        const { data } = await supabase
          .from('schools')
          .select('*')
          .eq('id', schoolId)
          .maybeSingle();
        school = data;
      }

      setStudentProfile(profile);
      setClassInfo(cls);
      setProgramInfo(program);
      setSchoolInfo(school);
      setLoading(false);
    };

    loadData();
  }, [selectedClassId, selectedSchoolId, targetStudentId]);

  useEffect(() => {
    if (!targetStudentId) return;
    try {
      const stored = localStorage.getItem(storageKey(targetStudentId));
      setCertificates(stored ? JSON.parse(stored) : []);
    } catch {
      setCertificates([]);
    }
  }, [targetStudentId]);

  const studentName = studentProfile?.name || currentUser?.name || 'Učenik';
  const schoolYear = classInfo?.school_year || '2025/2026';
  const programName = programInfo?.name || classInfo?.program?.name || 'program obrazovanja';
  const schoolName = schoolInfo?.name || 'Ugostiteljsko-turističko učilište Zagreb';
  const schoolCity = schoolInfo?.city || 'Zagreb';

  const sortedCertificates = useMemo(
    () => [...certificates].sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime()),
    [certificates]
  );

  const saveCertificates = (items: CertificateRecord[]) => {
    setCertificates(items);
    if (targetStudentId) {
      localStorage.setItem(storageKey(targetStudentId), JSON.stringify(items));
    }
  };

  const drawCroatianMark = (doc: jsPDF, x: number, y: number) => {
    const size = 2.2;
    doc.setDrawColor(190, 190, 190);
    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        doc.setFillColor((row + col) % 2 === 0 ? 219 : 255, (row + col) % 2 === 0 ? 48 : 255, (row + col) % 2 === 0 ? 52 : 255);
        doc.rect(x + col * size, y + row * size, size, size, 'FD');
      }
    }
    doc.setDrawColor(0, 0, 0);
    doc.rect(x, y, size * 5, size * 5);
  };

  const buildPdf = async (record: CertificateRecord) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    await registerUnicodeFont(doc);
    doc.setFont('NotoSans', 'normal');
    doc.setTextColor(0, 0, 0);

    doc.setFontSize(9);
    doc.text(schoolName, 28, 28);
    doc.text(schoolCity, 28, 33);

    doc.setFont('NotoSans', 'bold');
    doc.setFontSize(16);
    doc.text('ELEKTRONIČKI ZAPIS', 105, 62, { align: 'center' });

    doc.setFontSize(8.5);
    const birthPlace = studentProfile?.birthplace || studentProfile?.pob || schoolCity;
    const address = studentProfile?.address || 'adresa nije unesena';
    const gradeLevel = getGradeLevel(classInfo?.name);
    const body = `Potvrđuje se da je ${studentName}, OIB ${studentProfile?.oib || '____________'}, rođen ${formatDate(studentProfile?.dob) || '____________'} u ${birthPlace}, Hrvatska, s mjestom prebivališta ${address}, učenik ${gradeLevel || '_'} razreda srednje škole u školskoj godini ${schoolYear}, programa ${programName}.`;
    const purposeText = `Ova potvrda izdaje se prema članku 159. Zakona o općem upravnom postupku ("Narodne novine", broj 47/09, 110/21) na temelju podataka iz službene evidencije i služi isključivo kao dokaz o redovitom školovanju u svrhu ${record.purpose}.`;
    const feeText = 'Potvrda je oslobođena od plaćanja upravne pristojbe prema članku 9. stavak 21. Zakona o upravnim pristojbama ("Narodne novine", br. 115/16).';

    doc.setFont('NotoSans', 'bold');
    doc.text(doc.splitTextToSize(body, 155), 28, 83);
    doc.setFont('NotoSans', 'normal');
    doc.text(doc.splitTextToSize(purposeText, 155), 28, 105);
    doc.text(doc.splitTextToSize(feeText, 155), 28, 128);

    const tableX = 28;
    const tableY = 220;
    const colA = 50;
    const colB = 34;
    const colC = 86;
    const rowHeights = [10, 10, 10, 10, 10, 16, 12, 10];
    const totalWidth = colA + colB + colC;
    const totalHeight = rowHeights.reduce((sum, height) => sum + height, 0);

    doc.setLineWidth(0.25);
    doc.rect(tableX, tableY, totalWidth, totalHeight);
    doc.line(tableX + colA, tableY, tableX + colA, tableY + totalHeight);
    doc.line(tableX + colA + colB, tableY, tableX + colA + colB, tableY + totalHeight - rowHeights[5] - rowHeights[6] - rowHeights[7]);

    let lineY = tableY;
    rowHeights.forEach((height) => {
      lineY += height;
      doc.line(tableX, lineY, tableX + totalWidth, lineY);
    });

    drawCroatianMark(doc, tableX + 18, tableY + 10);
    doc.setFontSize(5.5);
    doc.text('Republika Hrvatska', tableX + 25, tableY + 33, { align: 'center' });
    doc.text('Ministarstvo znanosti, obrazovanja i mladih', tableX + 25, tableY + 39, { align: 'center' });

    doc.setFontSize(5.5);
    const rows = [
      ['Vrijeme izdavanja', formatDateTime(record.issuedAt)],
      ['Izdavatelj certifikata', 'C=HR L=Zagreb O=Hrvatska akademska i istraživačka mreža - CARNet\nOU=RIS CN=Odjel za razvoj usluga'],
      ['Serijski broj', record.verification.serialNumber],
      ['Algoritam potpisa', 'RSA-SHA256'],
      ['Broj zapisa', record.verification.recordNumber],
    ];

    let currentY = tableY;
    rows.forEach(([label, value], index) => {
      const centerY = currentY + rowHeights[index] / 2 + 1.5;
      doc.text(label, tableX + colA + 2, centerY);
      doc.text(doc.splitTextToSize(value, colC - 4), tableX + colA + colB + 2, currentY + 4);
      currentY += rowHeights[index];
    });

    doc.text('Kontrolni broj', tableX + colA + 2, currentY + 6);
    doc.text(record.verification.controlNumber, tableX + colA + colB + 2, currentY + 6);
    currentY += rowHeights[5] - 6;

    doc.text('Elektronički pečat', tableX + 2, currentY + 8);
    doc.text(doc.splitTextToSize(record.verification.seal, totalWidth - colA - 4), tableX + colA + 2, currentY + 4);
    currentY += rowHeights[6];

    doc.text('Informacije za provjeru dokumenta', tableX + 2, currentY + 5);
    doc.text(doc.splitTextToSize('Elektronički zapis se čuva i najviše 3 mjeseca od trenutka generiranja te se u tom roku može izvršiti provjera elektroničkog zapisa koji se pristupa korištenjem broja zapisa i kontrolnog broja otisnutog u kontrolnom dijelu elektroničkog zapisa, putem Internet adrese https://ocjene.skole.hr/potvrde/verify', totalWidth - colA - 4), tableX + colA + 2, currentY + 3);
    currentY += rowHeights[7];

    doc.text('Napomena', tableX + 2, currentY + 5);
    doc.text('Elektronički pečat kreiran je certifikatom Hrvatske akademske i istraživačke mreže', tableX + colA + 2, currentY + 5);

    return doc;
  };

  const downloadPdf = async (record: CertificateRecord) => {
    const pdf = await buildPdf(record);
    const fileName = `${record.studentName.replace(/\s+/g, '-')}-${formatDate(record.issuedAt).replace(/\./g, '')}-potvrda.pdf`;
    pdf.save(fileName);
  };

  const handleGenerate = async () => {
    if (!purpose) {
      toast.error('Odaberite svrhu potvrde.');
      return;
    }

    const record: CertificateRecord = {
      id: crypto.randomUUID(),
      issuedAt: new Date().toISOString(),
      purpose,
      studentName,
      verification: createVerification(),
    };

    const nextCertificates = [record, ...certificates];
    saveCertificates(nextCertificates);
    await downloadPdf(record);
    toast.success('Potvrda je generirana.');
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white p-8">
        <div className="text-sm font-medium text-slate-500">Učitavanje potvrda...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-white overflow-auto">
      <div className="w-full px-5 py-8 space-y-8">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setViewMode(viewMode === 'history' ? 'generate' : 'history')}
            className="px-4 py-2 bg-[#1780c2] text-white rounded-md text-sm font-medium flex items-center gap-2"
          >
            <FileText size={15} />
            {viewMode === 'history' ? 'Generiraj' : 'Moje potvrde'}
          </button>
        </div>

        {viewMode === 'generate' ? (
          <section className="pt-8">
            <div className="space-y-5">
              <h1 className="text-xl font-bold text-slate-950">Trebam potvrdu u svrhu:</h1>
              <select
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                className="w-full h-9 border border-slate-200 rounded-md px-3 text-sm bg-white outline-none focus:border-[#1780c2]"
              >
                <option value="">-- odaberite svrhu --</option>
                {CERTIFICATE_PURPOSES.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
              <div className="flex justify-center pt-4">
                <button
                  type="button"
                  onClick={handleGenerate}
                  className="px-5 py-2.5 bg-[#1780c2] text-white rounded-md text-sm font-medium"
                >
                  Generiraj potvrdu
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="pt-6">
            <div className="border border-slate-200 rounded-lg overflow-hidden shadow-sm">
              <div className="bg-[#1780c2] text-white text-center font-bold py-2">MOJE POTVRDE</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="p-3 font-bold">Datum</th>
                    <th className="p-3 font-bold">Učenik</th>
                    <th className="p-3 font-bold">Svrha</th>
                    <th className="p-3 font-bold">Preuzmi</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCertificates.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-400 font-medium">Nema izdanih potvrda.</td>
                    </tr>
                  ) : (
                    sortedCertificates.map((record) => (
                      <tr key={record.id} className="border-b border-slate-100 text-center">
                        <td className="p-3">{formatDate(record.issuedAt)}</td>
                        <td className="p-3">{record.studentName}</td>
                        <td className="p-3">{record.purpose}</td>
                        <td className="p-3">
                          <button
                            type="button"
                            onClick={() => downloadPdf(record)}
                            className="inline-flex items-center justify-center text-slate-700 hover:text-[#1780c2]"
                            aria-label="Preuzmi potvrdu"
                          >
                            <Download size={15} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
