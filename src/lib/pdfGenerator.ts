import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatSubjectName } from './utils';

// Helper to load Unicode support
export const registerUnicodeFont = async (doc: jsPDF) => {
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

// Formatting helpers for Croatian context
export const formatCroatianDate = (dateStr: string) => {
    if (!dateStr) return '____________';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}.`;
};

export const toCroatianLocative = (place: string) => {
    if (!place || place === '____________') return '____________';
    const cleanPlace = place.trim();
    const lower = cleanPlace.toLowerCase();
    if (lower.endsWith('greb')) return cleanPlace.slice(0, -4) + 'grebu';
    if (lower.endsWith('split')) return cleanPlace + 'u';
    if (lower.endsWith('rijeka')) return cleanPlace.slice(0, -1) + 'ci';
    if (lower.endsWith('osijek')) return cleanPlace.slice(0, -2) + 'ku';
    if (lower.endsWith('zadar')) return cleanPlace.slice(0, -2) + 'ru';
    if (lower.endsWith('pula')) return cleanPlace.slice(0, -1) + 'li';
    if (lower.endsWith('šibenik')) return cleanPlace.slice(0, -2) + 'ku';
    if (lower.endsWith('karlovac')) return cleanPlace.slice(0, -2) + 'cu';
    if (lower.endsWith('varaždin')) return cleanPlace + 'u';
    if (lower.endsWith('slavonski brod')) return cleanPlace + 'u';
    if (lower.endsWith('vinkovci')) return cleanPlace.slice(0, -2) + 'cima';
    if (lower.endsWith('glina')) return cleanPlace.slice(0, -1) + 'ni';
    
    if (lower.endsWith('a')) return cleanPlace.slice(0, -1) + 'i';
    if (lower.endsWith('ec')) return cleanPlace.slice(0, -2) + 'cu';
    return cleanPlace + 'u';
};

export const getGradeLevelWord = (className: string) => {
    const str = (className || '').toUpperCase();
    if (str.startsWith('1') || str.startsWith('I')) return 'prvi';
    if (str.startsWith('2') || str.startsWith('II')) return 'drugi';
    if (str.startsWith('3') || str.startsWith('III')) return 'treći';
    if (str.startsWith('4') || str.startsWith('IV')) return 'četvrti';
    return className || 'prvi';
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
    homeroomTeacherName?: string;
    certificatePlace: string;
    stampUrl?: string;
    principalSigUrl?: string;
    teacherSigUrl?: string;
    templateConfig?: any;
};

export const generateClassCertificatePDF = async (student: any, data: CertificateData, isTrial: boolean = false) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    await registerUnicodeFont(doc);

    // 1. OBRUB DOKUMENTA: RAZREDNA SVJEDODŽBA -> Zeleni obrub (sličan hrvatskim razrednim svjedodžbama)
    // Dvostruki tanki zeleni okvir
    if (data.templateConfig?.CLASS_CERTIFICATE?.layout?.showBorder !== false && data.templateConfig?.layout?.showBorder !== false) {
        doc.setDrawColor(20, 110, 60); // Deep rich school green (e.g. RGB 20, 110, 60)
        doc.setLineWidth(0.4);
        doc.rect(7, 7, 196, 283);     // Vanjski obrub
        doc.setLineWidth(0.2);
        doc.rect(8.5, 8.5, 193, 280); // Unutarnji obrub
    }

    doc.setTextColor(20, 20, 30);
    doc.setFont('NotoSans', 'normal');
    let y = 15;

    // Header
    doc.setFontSize(11);
    doc.text(data.templateConfig?.CLASS_CERTIFICATE?.texts?.headerCountry || 'REPUBLIKA HRVATSKA', 105, y, { align: 'center' });
    y += 8;
    doc.setFontSize(14);
    doc.setFont('NotoSans', 'bold');
    doc.text(data.schoolName.toUpperCase(), 105, y, { align: 'center' });
    y += 10;
    
    // OIB/KLASA/URBROJ
    doc.setFontSize(9);
    doc.setFont('NotoSans', 'normal');
    
    const cleanOib = data.oib ? (data.oib.startsWith('OIB ŠKOLE:') ? data.oib : 'OIB škole: ' + data.oib) : 'OIB škole: ____________';
    const regNum = student?.student_registry_number || student?.registration_number || '____________';
    const cleanRegNum = `MATIČNI BR. UČENIKA: ${regNum}`;
    const cleanKlasa = data.klasa ? (data.klasa.startsWith('KLASA:') ? data.klasa : 'KLASA: ' + data.klasa) : 'KLASA: N/A';
    const cleanUrbroj = data.urbroj ? (data.urbroj.startsWith('URBROJ:') ? data.urbroj : 'URBROJ: ' + data.urbroj) : 'URBROJ: N/A';

    doc.text(cleanOib, 20, y);
    doc.text(cleanRegNum, 20, y+6);
    doc.text(cleanKlasa, 190, y, { align: 'right' });
    doc.text(cleanUrbroj, 190, y+6, { align: 'right' });
    
    y += 15;
    doc.setLineWidth(0.35);
    doc.line(20, y, 190, y);
    y += 15;
    
    // Title
    doc.setFontSize(22);
    doc.setFont('NotoSans', 'bold');
    doc.text(data.templateConfig?.CLASS_CERTIFICATE?.texts?.documentTitle || 'SVJEDODŽBA', 105, y, { align: 'center' });
    y += 12;
    doc.setFontSize(18);
    doc.text(data.studentName.toUpperCase(), 105, y, { align: 'center' });
    
    y += 15;
    
    // Body paragraph 
    doc.setFont('NotoSans', 'normal');
    doc.setFontSize(10);
    const dob = formatCroatianDate(student?.dob);
    const pob = student?.birthplace || student?.pob || '____________';
    const pobInstrumental = toCroatianLocative(pob);
    const citizenship = student?.citizenship || 'Republika Hrvatska';
    const birthCountry = student?.birth_country || 'Republika Hrvatska';
    
    const parentName = (student?.father_name || student?.mother_name || '').trim();
    let parentSegment = '';
    if (parentName) {
        const gender = (student?.gender || 'MALE').toUpperCase();
        const isFemale = gender === 'FEMALE' || gender === 'Ž' || gender === 'ŽENSKI';
        const relation = isFemale ? 'kći' : 'sin';
        parentSegment = `, ${relation} ${parentName}`;
    }
    
    const gradeWord = getGradeLevelWord(data.className);
    const schoolYearStr = data.schoolYear || '______/____.';
    const programNameStr = data.programName || '__________';
    const durationWord = data.programName?.toLowerCase().includes('kuhar') ? 'tri godine' : 'četiri godine';
    
    const bodyText = `Rođen/a ${dob} godine u ${pobInstrumental}, ${birthCountry}, državljanstvo ${citizenship}${parentSegment}, upisao/la je školske godine ${schoolYearStr} prvi put ${gradeWord} razred programa obrazovanja za zanimanje/strukovnog kurikuluma za stjecanje kvalifikacije ${programNameStr} u trajanju od ${durationWord} i postigao/la sljedeći uspjeh:`;
    
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
        if (grades.length === 0) return;
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
                (doc as any).setLineDash([0.5, 1], 0);
                doc.line(startX, y - 1, endX, y - 1);
                (doc as any).setLineDash([], 0);
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
    doc.setFontSize(10);
    doc.text(`Ukupno izostanaka: ${student?.absences || 0} sati; od toga neopravdano: ${student?.unjustified_absences || 0} sati`, 20, y);
    doc.setFont('NotoSans', 'bold');
    doc.text(`Vladanje: ${data.conduct || 'uzorno'}`, 190, y, { align: 'right' });
    y += 10;
    
    const adj: any = { 'odličan': 'odličnim', 'vrlo dobar': 'vrlo dobrim', 'dobar': 'dobrim', 'dovoljan': 'dovoljnim', 'nedovoljan': 'nedovoljnim' };
    const success = data.overallSuccess.toLowerCase();
    const successAdjective = adj[success.split('(')[0].trim()] || success;
    
    const gender = (student?.gender || 'MALE').toUpperCase();
    const isFemale = gender === 'FEMALE' || gender === 'Ž' || gender === 'ŽENSKI';
    const studentNoun = isFemale ? 'Učenica' : 'Učenik';
    const formattedAverage = (data.overallAverage ? data.overallAverage.toString() : '0,00').replace('.', ',');
    
    doc.text(`${studentNoun} je s ${successAdjective} (${formattedAverage}) uspjehom završio ${gradeWord} razred.`, 105, y, { align: 'center' });
    y += 12;
    
    const certificateDateStr = formatCroatianDate(data.date || new Date().toISOString().split('T')[0]);
    const placeAndDate = `${data.certificatePlace || 'Zagreb'}, ${certificateDateStr}`;
    doc.text(placeAndDate, 105, y, { align: 'center' });
    y += 20;

    // Signatures / Potpisni blok
    let sigY = y;
    const customSigY = data.templateConfig?.CLASS_CERTIFICATE?.elements?.signatureLineY || data.templateConfig?.elements?.signatureLineY;
    if (customSigY) {
        sigY = customSigY;
    }

    doc.setFont('NotoSans', 'normal');
    doc.setFontSize(10);
    doc.text(data.homeroomTeacherTitle || 'Razrednik', 45, sigY, { align: 'center' });
    
    if (data.templateConfig?.CLASS_CERTIFICATE?.elements?.showStamp !== false && data.templateConfig?.elements?.showStamp !== false) {
        doc.text('M. P.', 105, sigY + 6, { align: 'center' });
        if (data.stampUrl) {
            try {
                doc.addImage(data.stampUrl, 'PNG', 88, sigY - 10, 34, 34);
            } catch (e) {
                console.warn("Failed rendering stamp image", e);
            }
        }
    }
    doc.text(data.principalTitle || 'Ravnatelj', 165, sigY, { align: 'center' });

    sigY += 12;
    doc.setLineWidth(0.35);
    doc.line(20, sigY, 70, sigY);
    doc.line(140, sigY, 190, sigY);
    
    if (data.teacherSigUrl) {
        try {
            doc.addImage(data.teacherSigUrl, 'PNG', 25, sigY - 12, 40, 10);
        } catch (e) {
            console.warn("Failed to render teacher signature image", e);
        }
    }
    if (data.principalSigUrl) {
        try {
            doc.addImage(data.principalSigUrl, 'PNG', 145, sigY - 12, 40, 10);
        } catch (e) {
            console.warn("Failed to render principal signature image", e);
        }
    }

    sigY += 5;
    doc.setFont('NotoSans', 'bold');
    doc.setFontSize(9.5);
    doc.text(data.homeroomTeacherName || '____________', 45, sigY, { align: 'center' });
    doc.text(data.principalName || '____________', 165, sigY, { align: 'center' });
    
    return doc;
};

export const generateFinalWorkCertificatePDF = async (student: any, data: any, isTrial: boolean = false) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    await registerUnicodeFont(doc);

    // 2. OBRUB DOKUMENTA: SVJEDODŽBA O ZAVRŠNOM RADU -> Zlatni obrub
    // Dvostruki zlatni okvir
    if (data.templateConfig?.FINAL_WORK_CERTIFICATE?.layout?.showBorder !== false && data.templateConfig?.layout?.showBorder !== false) {
        doc.setDrawColor(197, 160, 89); // Gold (RGB 197, 160, 89)
        doc.setLineWidth(0.4);
        doc.rect(7, 7, 196, 283); 
        doc.setLineWidth(0.2);
        doc.rect(8.5, 8.5, 193, 280);
    }

    doc.setTextColor(20, 20, 30);
    doc.setFont('NotoSans', 'normal');
    let y = 15;

    // Header
    doc.setFontSize(11);
    doc.text(data.templateConfig?.FINAL_WORK_CERTIFICATE?.texts?.headerCountry || 'REPUBLIKA HRVATSKA', 105, y, { align: 'center' });
    y += 8;
    doc.setFontSize(14);
    doc.setFont('NotoSans', 'bold');
    doc.text((data.schoolName || 'Naziv škole').toUpperCase(), 105, y, { align: 'center' });
    y += 10;
    
    // OIB/KLASA/URBROJ
    doc.setFontSize(9);
    doc.setFont('NotoSans', 'normal');
    
    const cleanOib = data.oib ? (data.oib.startsWith('OIB ŠKOLE:') ? data.oib : 'OIB škole: ' + data.oib) : 'OIB škole: ____________';
    const regNum = student?.student_registry_number || student?.registration_number || '____________';
    const cleanRegNum = `MATIČNI BR. UČENIKA: ${regNum}`;
    const cleanKlasa = data.klasa ? (data.klasa.startsWith('KLASA:') ? data.klasa : 'KLASA: ' + data.klasa) : 'KLASA: N/A';
    const cleanUrbroj = data.urbroj ? (data.urbroj.startsWith('URBROJ:') ? data.urbroj : 'URBROJ: ' + data.urbroj) : 'URBROJ: N/A';

    doc.text(cleanOib, 20, y);
    doc.text(cleanRegNum, 20, y+6);
    doc.text(cleanKlasa, 190, y, { align: 'right' });
    doc.text(cleanUrbroj, 190, y+6, { align: 'right' });
    
    y += 15;
    doc.setLineWidth(0.35);
    doc.line(20, y, 190, y);
    y += 15;
    
    // Title
    doc.setFontSize(22);
    doc.setFont('NotoSans', 'bold');
    doc.text(data.templateConfig?.FINAL_WORK_CERTIFICATE?.texts?.documentTitle || 'SVJEDODŽBA', 105, y, { align: 'center' });
    y += 8;
    doc.setFontSize(16);
    doc.text('O ZAVRŠNOME RADU', 105, y, { align: 'center' });
    y += 12;
    
    doc.setFontSize(18);
    doc.text((data.studentName || '').toUpperCase(), 105, y, { align: 'center' });
    y += 15;

    // Body text
    const dob = formatCroatianDate(student?.dob);
    const pob = student?.birthplace || student?.pob || '____________';
    const pobInstrumental = toCroatianLocative(pob);
    const citizenship = student?.citizenship || 'Republika Hrvatska';
    const birthCountry = student?.birth_country || 'Republika Hrvatska';
    
    const parentName = (student?.father_name || student?.mother_name || '').trim();
    let parentSegment = '';
    if (parentName) {
        const gender = (student?.gender || 'MALE').toUpperCase();
        const isFemale = gender === 'FEMALE' || gender === 'Ž' || gender === 'ŽENSKI';
        const relation = isFemale ? 'kći' : 'sin';
        parentSegment = `, ${relation} ${parentName}`;
    }

    const gradeWord = getGradeLevelWord(data.className || 'četvrti');
    const completedDate = formatCroatianDate(data.date || new Date().toISOString().split('T')[0]);

    const bodyText = `Rođen/a ${dob} godine u ${pobInstrumental}, ${birthCountry}, državljanstvo ${citizenship}${parentSegment}, nakon završenoga ${gradeWord} razreda, učenik/ca je dana ${completedDate} godine stekao/la sve uvjete za obranu završnoga rada. Učenik/ca je izradio/la i obranio/la završni rad s temom: "${data.thesisTitle || '____________'}" i postigao/la sljedeći uspjeh:`;

    doc.setFont('NotoSans', 'normal');
    doc.setFontSize(10);
    const bodyParagraphLines = doc.splitTextToSize(bodyText, 170);
    doc.text(bodyParagraphLines, 20, y);
    y += (bodyParagraphLines.length * 5.5) + 12;

    // Grades details list
    const grades = [
        { name: "Izrada završnoga rada", value: data.creationGrade },
        { name: "Obrana završnoga rada", value: data.defenseGrade },
        { name: "Opći uspjeh iz završnoga rada", value: data.overallSuccess }
    ];

    const formatGrade = (val: any) => {
        const str = val ? val.toString().trim() : '';
        const map: any = { '5': 'odličan (5)', '4': 'vrlo dobar (4)', '3': 'dobar (3)', '2': 'dovoljan (2)', '1': 'nedovoljan (1)' };
        return map[str] || str;
    };

    doc.setFont('NotoSans', 'bold');
    doc.text('USPJEH IZ ZAVRŠNOGA RADA', 20, y);
    y += 8;
    
    doc.setFont('NotoSans', 'normal');
    grades.forEach(g => {
        const gradeText = formatGrade(g.value);
        doc.text(g.name, 20, y);
        const startX = 20 + doc.getTextWidth(g.name) + 3;
        const endX = 190 - doc.getTextWidth(gradeText) - 3;
        if (endX > startX) {
            (doc as any).setLineDash([0.5, 1], 0);
            doc.line(startX, y - 1, endX, y - 1);
            (doc as any).setLineDash([], 0);
        }
        doc.text(gradeText, 190, y, { align: 'right' });
        y += 8;
    });

    y += 12;
    const certDate = formatCroatianDate(data.date || new Date().toISOString().split('T')[0]);
    const placeAndDate = `${data.certificatePlace || 'Zagreb'}, ${certDate}`;
    doc.text(placeAndDate, 105, y, { align: 'center' });
    y += 20;

    // Signatures
    let sigY = y;
    const customSigY = data.templateConfig?.FINAL_WORK_CERTIFICATE?.elements?.signatureLineY || data.templateConfig?.elements?.signatureLineY;
    if (customSigY) {
        sigY = customSigY;
    }

    doc.text(data.homeroomTeacherTitle || 'Razrednik', 45, sigY, { align: 'center' });
    doc.text('M. P.', 105, sigY + 6, { align: 'center' });
    if (data.stampUrl) {
        try {
            doc.addImage(data.stampUrl, 'PNG', 88, sigY - 10, 34, 34);
        } catch (e) {
            console.warn("Stamp rendering failed", e);
        }
    }
    doc.text(data.principalTitle || 'Ravnatelj', 165, sigY, { align: 'center' });

    sigY += 12;
    doc.line(20, sigY, 70, sigY);
    doc.line(140, sigY, 190, sigY);

    if (data.teacherSigUrl) {
        try {
            doc.addImage(data.teacherSigUrl, 'PNG', 25, sigY - 12, 40, 10);
        } catch (e) {
            console.warn("Teacher signature rendering failed", e);
        }
    }
    if (data.principalSigUrl) {
        try {
            doc.addImage(data.principalSigUrl, 'PNG', 145, sigY - 12, 40, 10);
        } catch (e) {
            console.warn("Principal signature rendering failed", e);
        }
    }

    sigY += 5;
    doc.setFont('NotoSans', 'bold');
    doc.setFontSize(9);
    doc.text(data.homeroomTeacherName || '____________', 45, sigY, { align: 'center' });
    doc.text(data.principalName || '____________', 165, sigY, { align: 'center' });

    return doc;
};

export const generateExamCertificatePDF = async (student: any, exams: any[], globalData: any, gradeLevel: number, isTrial: boolean = false) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    await registerUnicodeFont(doc);

    // 3. POTVRDA O POLOŽENIM ISPITIMA -> Ne koristiti zeleni ni zlatni obrub.
    // Ostaviti bijelu pozadinu i jednostavan crni obrub ili bez obruba (jednostavan crni obrub)
    doc.setDrawColor(40, 40, 40);
    doc.setLineWidth(0.3);
    doc.rect(10, 10, 190, 277);

    doc.setTextColor(20, 20, 30);
    doc.setFont('NotoSans', 'normal');
    let y = 20;

    // Header
    doc.setFontSize(12);
    doc.text((globalData.schoolName || 'Naziv škole').toUpperCase(), 105, y, { align: 'center' });
    y += 15;

    // Title
    doc.setFontSize(18);
    doc.setFont('NotoSans', 'bold');
    doc.text('POTVRDA O POLOŽENIM ISPITIMA', 105, y, { align: 'center' });
    y += 12;

    doc.setFontSize(14);
    doc.text((student?.name || '').toUpperCase(), 105, y, { align: 'center' });
    y += 15;

    // Body
    doc.setFontSize(10);
    doc.setFont('NotoSans', 'normal');
    
    const dob = formatCroatianDate(student?.dob);
    const pob = student?.birthplace || student?.pob || '____________';
    const pobInstrumental = toCroatianLocative(pob);
    
    const gradeLevelWord = getGradeLevelWord(gradeLevel.toString());

    const bodyText = `Kojom se potvrđuje da je učenik/ca rođen/a ${dob} godine u ${pobInstrumental}, položio/la predmetne ispite za ${gradeLevelWord} razred i postigao/la sljedeći uspjeh:`;
    
    const bodyParagraphLines = doc.splitTextToSize(bodyText, 160);
    doc.text(bodyParagraphLines, 25, y);
    y += (bodyParagraphLines.length * 6) + 12;

    // Exams table
    doc.setFont('NotoSans', 'bold');
    doc.text('POLOŽENI ISPITI', 25, y);
    y += 8;
    
    doc.setFont('NotoSans', 'normal');
    if (!exams || exams.length === 0) {
        doc.text('Nema evidentiranih položenih ispita.', 25, y);
        y += 10;
    } else {
        const formatGrade = (val: any) => {
            const str = val ? val.toString().trim() : '';
            const map: any = { '5': 'odličan (5)', '4': 'vrlo dobar (4)', '3': 'dobar (3)', '2': 'dovoljan (2)', '1': 'nedovoljan (1)' };
            return map[str] || str;
        };

        exams.forEach(e => {
            const subjName = formatSubjectName(e.subjects || { name: e.subject_name || 'Nepoznat predmet' });
            const gradeText = formatGrade(e.grade_value || e.grade);
            doc.text(subjName, 25, y);
            const startX = 25 + doc.getTextWidth(subjName) + 3;
            const endX = 185 - doc.getTextWidth(gradeText) - 3;
            if (endX > startX) {
                (doc as any).setLineDash([0.5, 1], 0);
                doc.line(startX, y - 1, endX, y - 1);
                (doc as any).setLineDash([], 0);
            }
            doc.text(gradeText, 185, y, { align: 'right' });
            y += 8;
        });
    }

    y += 20;
    const certDate = formatCroatianDate(globalData.date || new Date().toISOString().split('T')[0]);
    const placeAndDate = `${globalData.place || 'Zagreb'}, ${certDate}`;
    doc.text(placeAndDate, 105, y, { align: 'center' });
    y += 25;

    // Signatures
    doc.text(globalData.homeroomTeacherTitle || 'Razrednik', 50, y, { align: 'center' });
    doc.text(globalData.principalTitle || 'Ravnatelj', 160, y, { align: 'center' });
    y += 12;
    doc.line(25, y, 75, y);
    doc.line(135, y, 185, y);
    y += 5;
    doc.setFont('NotoSans', 'bold');
    doc.text(globalData.homeroomTeacherName || '____________', 50, y, { align: 'center' });
    doc.text(globalData.principalName || '____________', 160, y, { align: 'center' });

    return doc;
};
