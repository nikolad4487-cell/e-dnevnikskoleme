
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
// Note: In this environment, we might need to rely on standard fonts if NotoSans is not bundled.
// Standard helvetica does not support Croatian chars well. 
// A better approach is to use standard font and hope for the best or bundle a font if allowed.                

export type CertificateData = {
    schoolName: string;
    studentName: string;
    studentOib: string;
    grades: { subjectName: string; gradeValue: number | string }[];
    overallSuccess: string;
    overallAverage: string;
    conduct: string;
    date: string;
    klasa: string;
    urbroj: string;
    principalName: string;
    stampUrl?: string;
    principalSigUrl?: string;
    teacherSigUrl?: string;
};

const setupBasePDF = (doc: jsPDF, isTrial: boolean) => {
    if (isTrial) {
        doc.setTextColor(200, 200, 200);
        doc.setFontSize(50);
        doc.text('PROBNI ISPIS', 40, 150, { angle: 45 });
    }
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(16);
    // Setting font to helvetica which might support standard Latin-1, 
    // for full Croatian support we would need a custom font file.
    doc.setFont('helvetica', 'normal'); 
    doc.text('REPUBLIKA HRVATSKA', 105, 20, { align: 'center' });
    doc.setFontSize(14);
};

export const generateClassCertificatePDF = async (student: any, data: CertificateData, isTrial: boolean = false) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    setupBasePDF(doc, isTrial);
    
    doc.text(data.schoolName, 105, 30, { align: 'center' });
    doc.setFontSize(12);
    
    // Using simple replacement for testing if basic characters pass
    const replaceChars = (text: string) => text.replace(/č/g, 'c').replace(/ć/g, 'c').replace(/ž/g, 'z').replace(/š/g, 's').replace(/đ/g, 'd')
                                              .replace(/Č/g, 'C').replace(/Ć/g, 'C').replace(/Ž/g, 'Z').replace(/Š/g, 'S').replace(/Đ/g, 'D');

    doc.text(`Učenik: ${replaceChars(data.studentName)}`, 20, 50);
    doc.text(`OIB: ${data.studentOib}`, 20, 55);

    const tableData = data.grades.map(g => [replaceChars(g.subjectName), g.gradeValue]);
    autoTable(doc, {
        startY: 70,
        head: [['Predmet', 'Zakljucna ocjena']], // Changed Zaključna
        body: tableData,
    });

    const finalY = (doc as any).lastAutoTable.finalY + 20;
    doc.text(`Opci uspjeh: ${replaceChars(data.overallSuccess)} (${data.overallAverage})`, 20, finalY); // Changed Opći
    doc.text(`Vladanje: ${replaceChars(data.conduct)}`, 20, finalY + 10);
    
    // Signatures
    if (data.stampUrl) doc.addImage(data.stampUrl, 'PNG', 70, finalY + 40, 70, 70);
    if (data.teacherSigUrl) doc.addImage(data.teacherSigUrl, 'PNG', 20, finalY + 40, 40, 20);
    doc.text(`Razrednik:`, 20, finalY + 65);
    if (data.principalSigUrl) doc.addImage(data.principalSigUrl, 'PNG', 150, finalY + 40, 40, 20);
    doc.text(`Ravnatelj: ${replaceChars(data.principalName)}`, 150, finalY + 65);
    
    return doc;
};
