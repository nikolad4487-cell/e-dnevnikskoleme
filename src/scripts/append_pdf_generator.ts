import * as fs from 'fs';
import * as path from 'path';

const file = 'src/lib/pdfGenerator.ts';
const absolutePath = path.resolve(file);
let content = fs.readFileSync(absolutePath, 'utf8');

const functionToAppend = `
export const generateExamCertificatePDF = async (student: any, exam: any, subjectName: string, globalData: any, isTrial: boolean = false) => {
    // A4 Portrait
    const doc = new jsPDF('p', 'mm', 'a4');

    // 1. Double border (Teal standard frame matching school styling)
    doc.saveGraphicsState();
    doc.setStrokeColor(0, 92, 141); 
    doc.setLineWidth(0.8);
    doc.rect(15, 15, 180, 267);
    doc.rect(16.5, 16.5, 177, 264);
    doc.restoreGraphicsState();

    // 2. Draft Watermark
    if (isTrial) {
        doc.saveGraphicsState();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(36);
        doc.setTextColor(240, 210, 210);
        doc.text('PROBNA POTVRDA', 105, 150, { align: 'center', angle: 45 });
        doc.restoreGraphicsState();
    }

    // 3. School Header Column
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    doc.text('REPUBLIKA HRVATSKA', 25, 30);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(globalData.schoolName || 'Srednja škola e-Dnevnik', 25, 35);
    
    const place = globalData.place || 'Zagreb';
    doc.text(place, 25, 40);

    // 4. File Metadata (KLASA, URBROJ)
    const klasa = globalData.klasa || '602-03/26-01/01';
    const urbroj = globalData.urbroj || '251-89-01-26-1';
    const cleanKlasa = klasa.startsWith('KLASA:') ? klasa : \`KLASA: \${klasa}\`;
    const cleanUrbroj = urbroj.startsWith('URBROJ:') ? urbroj : \`URBROJ: \${urbroj}\`;
    
    doc.text(cleanKlasa, 25, 52);
    doc.text(cleanUrbroj, 25, 57);
    
    const dateText = globalData.date ? \`U \${place}, \${globalData.date}\` : \`U \${place}, \${new Date().toLocaleDateString('hr-HR')}.\`;
    doc.text(dateText, 25, 62);

    // 5. Legislative Basis Text
    const examTypeRaw = exam.type || exam.exam_type || 'SUPPLEMENTARY';
    let typeAdjGenHr = 'dopunskog';
    let typeNounHr = 'DOPUNSKOM'; 
    if (examTypeRaw.includes('DIFFERENCE') || examTypeRaw.includes('DIFFERENTIAL')) {
        typeAdjGenHr = 'razlikovnog';
        typeNounHr = 'RAZLIKOVNOM';
    } else if (examTypeRaw.includes('REMEDIAL') || examTypeRaw.includes('MAKEUP')) {
        typeAdjGenHr = 'popravnog';
        typeNounHr = 'POPRAVNOM';
    } else if (examTypeRaw.includes('CLASS')) {
        typeAdjGenHr = 'razrednog';
        typeNounHr = 'RAZREDNOM';
    } else if (examTypeRaw.includes('SUBJECT')) {
        typeAdjGenHr = 'predmetnog';
        typeNounHr = 'PREDMETNOM';
    }

    doc.setFontSize(9.5);
    const basisText = \`Na temelju članka 84. Zakona o odgoju i obrazovanju u osnovnoj i srednjoj školi te odredaba Statuta ustanove \${globalData.schoolName || 'škole'}, nakon uspješno položenog \${typeAdjGenHr} ispita, izdaje se:\`;
    
    const splitBasis = doc.splitTextToSize(basisText, 160);
    doc.text(splitBasis, 25, 80);

    // 6. MAIN DISPLAY TITLE
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(0, 92, 141); 
    doc.text('P O T V R D A', 105, 102, { align: 'center' });
    
    doc.setFontSize(11);
    doc.setTextColor(80, 80, 80);
    doc.text(\`O POLOŽENOM \${typeNounHr} ISPITU\`, 105, 108, { align: 'center' });

    // 7. Student narrative
    const fullName = \`\${student.name || ''} \${student.surname || ''}\`.trim() || 'Učenik';
    const dob = student.dob ? new Date(student.dob).toLocaleDateString('hr-HR') + '.' : '—';
    const pob = student.pob || student.birthplace || '—';
    const bCountry = student.birth_country || 'Republika Hrvatska';
    const citizenship = student.citizenship || 'hrvatsko';
    const oib = student.oib || '—';
    const matBr = student.student_registry_number || '—';
    const yrLabel = globalData.schoolYear || '—';
    const clsNm = globalData.className || '—';

    const getPronounHr = () => {
        if (student.gender === 'FEMALE') return 'položila je';
        return 'položio je';
    };

    const getStatusPronounHr = () => {
        if (student.gender === 'FEMALE') return 'rođena';
        return 'rođen';
    };

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(40, 40, 40);
    
    const bodySentence = \`\${fullName}, \${getStatusPronounHr()} \${dob} u mjestu \${pob}, država \${bCountry}, državljanstvo \${citizenship}, OIB: \${oib}, upisan u matičnu knjigu pod rednim brojem \${matBr} u školskoj godini \${yrLabel} kao redoviti učenik u razrednom odjelu \${clsNm}, \${getPronounHr()} dana \${exam.date ? new Date(exam.date).toLocaleDateString('hr-HR') + '.' : '—'}:\`;

    const splitBody = doc.splitTextToSize(bodySentence, 160);
    doc.text(splitBody, 25, 122);

    // 8. CERTIFICATION TARGET HEADER
    const nextY = 122 + (splitBody.length * 6) + 10;
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0, 92, 141);
    const examYearLabel = exam.examGradeLevel || exam.exam_grade_level || '—';
    doc.text(\`\${typeNounHr} ISPIT ZA \${examYearLabel}. RAZRED\`, 105, nextY, { align: 'center' });

    // 9. SUBJECT DETAILS BOX
    const boxY = nextY + 6;
    
    doc.saveGraphicsState();
    doc.setDrawColor(220, 220, 220);
    doc.setFillColor(252, 252, 252);
    doc.rect(25, boxY, 160, 25, 'F');
    doc.rect(25, boxY, 160, 25);
    doc.restoreGraphicsState();

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(110, 110, 110);
    doc.text('Aktivni predmet:', 32, boxY + 9);
    doc.text('Iznos ocjene:', 32, boxY + 18);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(20, 20, 20);
    doc.text(subjectName, 68, boxY + 9);
    
    const gradeValRaw = exam.gradeValue || exam.grade_value || '—';
    
    const getGradeLabelHr = (val: number | string) => {
        const num = parseInt(String(val));
        switch(num) {
            case 5: return "odličan (5)";
            case 4: return "vrlo dobar (4)";
            case 3: return "dobar (3)";
            case 2: return "dovoljan (2)";
            case 1: return "nedovoljan (1)";
            default: return String(val || "—");
        }
    };
    
    doc.text(getGradeLabelHr(gradeValRaw), 68, boxY + 18);

    // 10. LEGAL PURPOSE FOOTER
    const purpY = boxY + 36;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    const purposeText = 'Ova se potvrda izdaje u svrhu reguliranja i dokazivanja položenih obveza i polaganja ispita sukladno propisima Ministarstva znanosti i obrazovanja te se u druge svrhe ne može koristiti.';
    const splitPurpose = doc.splitTextToSize(purposeText, 160);
    doc.text(splitPurpose, 25, purpY);

    // 11. STAMPS & SIGNATURES near bottom
    const sigY = 245;

    // Stamp Space
    if (globalData.stampUrl) {
        try {
            doc.addImage(globalData.stampUrl, 'PNG', 88, sigY - 17, 34, 34);
        } catch (e) {
            console.warn("Failed rendering stamp image", e);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.text('M. P.', 105, sigY - 2, { align: 'center' });
        }
    } else {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text('M. P.', 105, sigY - 1, { align: 'center' });
    }

    // Left Signature
    if (globalData.teacherSigUrl) {
        try {
            doc.addImage(globalData.teacherSigUrl, 'PNG', 20, sigY - 14, 44, 12);
        } catch (e) {
            console.warn("Failed rendering signature", e);
        }
    }
    doc.saveGraphicsState();
    doc.setDrawColor(200, 200, 200);
    doc.line(20, sigY, 70, sigY);
    doc.restoreGraphicsState();
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Razrednik', 45, sigY + 5, { align: 'center' });

    // Right Signature
    if (globalData.principalSigUrl) {
        try {
            doc.addImage(globalData.principalSigUrl, 'PNG', 140, sigY - 14, 44, 12);
        } catch (e) {
            console.warn("Failed rendering signature", e);
        }
    }
    doc.saveGraphicsState();
    doc.setDrawColor(200, 200, 200);
    doc.line(140, sigY, 190, sigY);
    doc.restoreGraphicsState();
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 30, 30);
    doc.text(globalData.principalName || 'Ravnatelj ustanove', 165, sigY - 16, { align: 'center' });
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(globalData.principalTitle || 'Ravnatelj', 165, sigY + 5, { align: 'center' });

    return doc;
};
`;

if (!content.includes('export const generateExamCertificatePDF')) {
  fs.appendFileSync(absolutePath, functionToAppend, 'utf8');
  console.log("Success! Appended generateExamCertificatePDF to bottom of pdfGenerator.ts");
} else {
  console.log("generateExamCertificatePDF is already present in pdfGenerator.ts!");
}
