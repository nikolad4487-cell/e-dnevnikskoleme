
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

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
};

const setupBasePDF = (doc: jsPDF, isTrial: boolean) => {
    if (isTrial) {
        doc.setTextColor(200, 200, 200);
        doc.setFontSize(50);
        doc.text('PROBNI ISPIS', 40, 150, { angle: 45 });
    }
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('REPUBLIKA HRVATSKA', 105, 20, { align: 'center' });
    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
};

export const generateClassCertificatePDF = (student: any, data: CertificateData, isTrial: boolean = false) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    setupBasePDF(doc, isTrial);
    
    doc.text(data.schoolName, 105, 30, { align: 'center' });
    doc.setFontSize(12);
    doc.text(`Učenik: ${data.studentName}`, 20, 50);
    doc.text(`OIB: ${data.studentOib}`, 20, 55);

    const tableData = data.grades.map(g => [g.subjectName, g.gradeValue]);
    (doc as any).autoTable({
        startY: 70,
        head: [['Predmet', 'Zaključna ocjena']],
        body: tableData,
    });

    const finalY = (doc as any).lastAutoTable.finalY + 20;
    doc.text(`Opći uspjeh: ${data.overallSuccess} (${data.overallAverage})`, 20, finalY);
    doc.text(`Vladanje: ${data.conduct}`, 20, finalY + 10);
    doc.text(`Ravnatelj: ${data.principalName}`, 150, finalY + 30);
    
    return doc;
};
