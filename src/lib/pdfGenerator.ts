import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Helper to load Unicode support
const registerUnicodeFont = async (doc: jsPDF) => {
    // Fonts (Simplified for now - ensuring only one instance used)
    const fontUrlRegular = 'https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf';
    const fontUrlBold = 'https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSans/NotoSans-Bold.ttf';
    
    try {
        const [resRegular, resBold] = await Promise.all([fetch(fontUrlRegular), fetch(fontUrlBold)]);
        const [blobRegular, blobBold] = await Promise.all([resRegular.blob(), resBold.blob()]);
        
        const loadFont = (blob: Blob, name: string, style: string) => new Promise<void>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64data = reader.result as string;
                const base64str = base64data.split(',')[1];
                doc.addFileToVFS(`${name}-${style}.ttf`, base64str);
                doc.addFont(`${name}-${style}.ttf`, name, style);
                resolve();
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });

        await Promise.all([loadFont(blobRegular, 'NotoSans', 'normal'), loadFont(blobBold, 'NotoSans', 'bold')]);
    } catch (e) {
        console.error("Failed to load Unicode font", e);
        doc.setFont('helvetica'); // Fallback
    }
};

export type CertificateData = {
    schoolName: string;
    schoolYear: string;
    className: string;
    programName: string;
    studentName: string;
    studentOib: string;
    grades: { subjectName: string; gradeValue: number | string; subjectType?: string }[];
    overallSuccess: string;
    overallAverage: string;
    conduct: string;
    date: string;
    klasa: string;
    urbroj: string;
    oib?: string;
    principalName: string;
    principalTitle: string;
    homeroomTeacherTitle: string;
    homeroomTeacherName: string;
    certificatePlace: string;
    stampUrl?: string;
    principalSigUrl?: string;
    teacherSigUrl?: string;
};

export const generateClassCertificatePDF = async (student: any, data: CertificateData, isTrial: boolean = false) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    await registerUnicodeFont(doc);

    doc.setTextColor(20, 20, 30);
    doc.setFont('NotoSans', 'normal');
    let y = 15;

    // Header
    doc.setFontSize(14);
    doc.text('REPUBLIKA HRVATSKA', 105, y, { align: 'center' });
    y += 8;
    doc.setFontSize(16);
    doc.setFont('NotoSans', 'bold');
    doc.text(data.schoolName.toUpperCase(), 105, y, { align: 'center' });
    y += 10;
    
    // OIB/KLASA/URBROJ
    doc.setFontSize(10);
    doc.setFont('NotoSans', 'normal');
    doc.text(`OIB škole: ${data.oib || '____________'}`, 20, y);
    doc.text(`MATIČNI BR. UČENIKA: ${student?.registration_number || '____________'}`, 20, y+6);
    doc.text(`KLASA: ${data.klasa || '____________'}`, 190, y, { align: 'right' });
    doc.text(`URBROJ: ${data.urbroj || '____________'}`, 190, y+6, { align: 'right' });
    
    y += 15;
    doc.setLineWidth(0.3);
    doc.line(20, y, 190, y);
    y += 15;
    
    // Title
    doc.setFontSize(24);
    doc.setFont('NotoSans', 'bold');
    doc.text('SVJEDODŽBA', 105, y, { align: 'center' });
    y += 12;
    doc.setFontSize(20);
    doc.text(data.studentName.toUpperCase(), 105, y, { align: 'center' });
    
    y += 15;
    
    // Body paragraph 
    doc.setFont('NotoSans', 'normal');
    doc.setFontSize(11);
    const dob = student?.dob ? new Date(student.dob).toLocaleDateString('hr-HR') : '____________';
    const pob = student?.birthplace || '____________';
    const pobInstrumental = pob.endsWith('greb') ? pob.replace('greb', 'grebu') : pob;
    
    const bodyText = `Rođen/a ${dob} godine u ${pobInstrumental}, Republika Hrvatska, državljanstvo Republika Hrvatska, kći/sin ____________, upisao/la školske godine ${data.schoolYear || '______/____.'} prvi put prvi razred programa obrazovanja za zanimanje ${data.programName || '__________'} i postigao/la sljedeći uspjeh:`;
    
    const bodyParagraphLines = doc.splitTextToSize(bodyText, 170);
    doc.text(bodyParagraphLines, 20, y);
    y += (bodyParagraphLines.length * 6) + 10;

    // Subjects
    const formatGrade = (val: any) => {
        const str = val ? val.toString().trim() : '';
        const map: any = { '5': 'odličan (5)', '4': 'vrlo dobar (4)', '3': 'dobar (3)', '2': 'dovoljan (2)', '1': 'nedovoljan (1)' };
        return map[str] || str;
    };

    const drawSubjects = (label: string, grades: any[]) => {
        doc.setFont('NotoSans', 'bold');
        doc.text(label, 20, y);
        y += 8;
        doc.setFont('NotoSans', 'normal');
        grades.forEach(g => {
            const gradeText = formatGrade(g.gradeValue);
            doc.text(g.subjectName, 20, y);
            const startX = 20 + doc.getTextWidth(g.subjectName) + 3;
            const endX = 190 - doc.getTextWidth(gradeText) - 3;
            if (endX > startX) {
                doc.setLineDash([0.5, 1], 0);
                doc.line(startX, y - 1, endX, y - 1);
                doc.setLineDash([], 0);
            }
            doc.text(gradeText, 190, y, { align: 'right' });
            y += 7;
        });
        y += 5;
    };

    drawSubjects('I. OBVEZNI PREDMETI', data.grades.filter((g:any) => !['ELECTIVE','IZBORNI'].includes((g.subjectType || '').toUpperCase())));
    drawSubjects('II. IZBORNI PREDMETI', data.grades.filter((g:any) => ['ELECTIVE','IZBORNI'].includes((g.subjectType || '').toUpperCase())));

    // Below table
    doc.setFont('NotoSans', 'normal');
    doc.text(`Ukupno izostanaka: ${student?.absences || 0} sati; od toga neopravdano: ${student?.unjustified_absences || 0} sati`, 20, y);
    doc.setFont('NotoSans', 'bold');
    doc.text(`Vladanje: ${data.conduct || 'uzorno'}`, 190, y, { align: 'right' });
    y += 10;
    
    const adj: any = { 'odličan': 'odličnim', 'vrlo dobar': 'vrlo dobrim', 'dobar': 'dobrim', 'dovoljan': 'dovoljnim', 'nedovoljan': 'nedovoljnim' };
    const success = data.overallSuccess.toLowerCase();
    const successAdjective = adj[success.split('(')[0].trim()] || success;
    
    doc.text(`Učenik je s ${successAdjective} (${data.overallAverage.replace('.',',')}) uspjehom završio prvi razred.`, 105, y, { align: 'center' });
    y += 15;
    
    doc.text(`Zagreb, ${new Date().toLocaleDateString('hr-HR')}`, 105, y, { align: 'center' });
    y += 20;

    // Signatures
    doc.text('Razrednik', 40, y, { align: 'center' });
    doc.text('Ravnatelj', 170, y, { align: 'center' });
    doc.text('M. P.', 105, y + 2, { align: 'center' });
    y += 10;
    doc.line(20, y, 70, y);
    doc.line(140, y, 190, y);
    y += 5;
    doc.setFont('NotoSans', 'bold');
    doc.text(data.homeroomTeacherName || '____________', 40, y, { align: 'center' });
    doc.text(data.principalName || '____________', 170, y, { align: 'center' });
    
    return doc;
};

export const generateFinalWorkCertificatePDF = async (student: any, data: any, isTrial: boolean = false) => {
    // Basic implementation for final work certificate
    const doc = new jsPDF('p', 'mm', 'a4');
    await registerUnicodeFont(doc);
    return doc;
};

export const generateExamCertificatePDF = async (student: any, exams: any[], globalData: any, gradeLevel: number, isTrial: boolean = false) => {
    // Basic implementation for exam certificate
    const doc = new jsPDF('p', 'mm', 'a4');
    await registerUnicodeFont(doc);
    return doc;
};

