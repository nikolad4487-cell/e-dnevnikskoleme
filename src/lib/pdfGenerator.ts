import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

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
    principalName: string;
    principalTitle: string;
    homeroomTeacherTitle: string;
    certificatePlace: string;
    stampUrl?: string;
    principalSigUrl?: string;
    teacherSigUrl?: string;
    templateConfig?: any;
};

export const generateClassCertificatePDF = async (student: any, data: CertificateData, isTrial: boolean = false) => {
    // Standard portrait A4: 210mm x 297mm
    const doc = new jsPDF('p', 'mm', 'a4');

    // 1. Resolve template configuration (fallback to premium defaults)
    const defaultTemplateConfig = {
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
    };

    const template = data.templateConfig || defaultTemplateConfig;
    const layout = template.layout || defaultTemplateConfig.layout;
    const typography = template.typography || defaultTemplateConfig.typography;
    const texts = template.texts || defaultTemplateConfig.texts;
    const elements = template.elements || defaultTemplateConfig.elements;

    // --- OFFICIAL BORDER FRAME ---
    if (layout.showBorder) {
        doc.saveGraphicsState();
        if (layout.borderStyle === 'double-turquoise') {
            doc.setDrawColor(78, 190, 199);
            doc.setLineWidth(1.2);
            doc.rect(4, 4, 202, 289, 'S');
            doc.setLineWidth(0.4);
            doc.rect(5.5, 5.5, 199, 286, 'S');
        } else if (layout.borderStyle === 'sleek-dark') {
            doc.setDrawColor(40, 45, 55);
            doc.setLineWidth(0.5);
            doc.rect(4, 4, 202, 289, 'S');
        } else if (layout.borderStyle === 'gold-line') {
            doc.setDrawColor(212, 175, 55);
            doc.setLineWidth(1.0);
            doc.rect(4, 4, 202, 289, 'S');
            doc.setLineWidth(0.3);
            doc.rect(5.5, 5.5, 199, 286, 'S');
        } else if (layout.borderStyle === 'minimal') {
            doc.setDrawColor(30, 40, 60);
            doc.setLineWidth(0.8);
            doc.line(4, 4, 206, 4);
            doc.line(4, 293, 206, 293);
        }
        doc.restoreGraphicsState();
    }

    // --- TRIAL WATERMARK ---
    if (isTrial && layout.showWatermark !== false) {
        doc.saveGraphicsState();
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(215, 215, 215);
        doc.setFontSize(48);
        doc.text('PROBNI ISPIS', 50, 180, { angle: 45 });
        doc.restoreGraphicsState();
    }

    doc.setTextColor(20, 20, 30);
    doc.setFont('helvetica', 'normal');
    let y = layout.topMargin || 15;

    // --- COUNTRY HEADER AND SCHOOL NAME ---
    doc.setFontSize(10);
    doc.text(texts.headerCountry || 'REPUBLIKA HRVATSKA', 105, y, { align: 'center' });
    y += 6;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(data.schoolName.toUpperCase(), 105, y, { align: 'center' });
    
    // OIB (left), KLASA/URBROJ (right)
    y += 5;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`OIB škole: ${data.oib || 'N/A'}`, 20, y);
    doc.text(`KLASA: ${data.klasa || 'N/A'}`, 190, y, { align: 'right' });
    y += 4;
    doc.text(`URBROJ: ${data.urbroj || 'N/A'}`, 190, y, { align: 'right' });
    
    y += 15;
    
    // --- SVJEDODŽBA TITLE ---
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(texts.documentTitle || 'SVJEDODŽBA', 105, y, { align: 'center' });
    
    // --- STUDENT DETAILS ---
    y += 10;
    doc.setFontSize(16);
    doc.text(data.studentName.toUpperCase(), 105, y, { align: 'center' });
    
    y += 6;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`OIB: ${data.studentOib}   |   spol: ${student?.gender === 'FEMALE' || student?.gender === 'Ž' ? 'Ženski' : 'Muški'}`, 105, y, { align: 'center' });
    
    // --- TEMPLATED BODY PARAGRAPH ---
    y += 12;
    let bodyText = texts.bodyTemplate || defaultTemplateConfig.texts.bodyTemplate;
    bodyText = bodyText.replace('{birthday}', student?.dob || '____________');
    bodyText = bodyText.replace('{birthplace}', student?.birthplace || student?.pob || '____________');
    bodyText = bodyText.replace('{birth_country}', student?.birth_country || 'Republika Hrvatska');
    bodyText = bodyText.replace('{citizenship}', student?.citizenship || 'Republika Hrvatska');
    
    const parentDetails = student?.father_name || student?.mother_name || '____________';
    bodyText = bodyText.replace('{parents_name}', parentDetails);
    bodyText = bodyText.replace('{school_year}', data.schoolYear || '______/____.');
    bodyText = bodyText.replace('{class_year}', data.className || '____');
    bodyText = bodyText.replace('{program_name}', data.programName || '__________');
    bodyText = bodyText.replace('{duration_years}', 'tri godine');

    const bodyParagraphLines = doc.splitTextToSize(bodyText, 170);
    doc.text(bodyParagraphLines, 20, y);
    y += (bodyParagraphLines.length * 6) + 5;

    // --- SUBJECTS ---
    const formatGradeRepresentation = (val: any) => {
        const str = val ? val.toString().trim() : '';
        if (str === '5') return 'odličan (5)';
        if (str === '4') return 'vrlo dobar (4)';
        if (str === '3') return 'dobar (3)';
        if (str === '2') return 'dovoljan (2)';
        if (str === '1') return 'nedovoljan (1)';
        return str;
    };

    const obligatoryGrades = data.grades.filter(g => {
        const t = (g.subjectType || '').toUpperCase();
        return t !== 'ELECTIVE' && t !== 'IZBORNI';
    });
    const electiveGrades = data.grades.filter(g => {
        const t = (g.subjectType || '').toUpperCase();
        return t === 'ELECTIVE' || t === 'IZBORNI';
    });

    // Obligatory
    if (obligatoryGrades.length > 0) {
        doc.setFont('helvetica', 'bold');
        doc.text('OBVEZNI PREDMETI:', 20, y);
        y += 7;
        doc.setFont('helvetica', 'normal');
        obligatoryGrades.forEach(g => {
            doc.text(g.subjectName, 20, y);
            const gradeText = formatGradeRepresentation(g.gradeValue);
            // Measure widths to draw dots
            const subjectWidth = doc.getTextWidth(g.subjectName);
            const gradeWidth = doc.getTextWidth(gradeText);
            const startX = 20 + subjectWidth + 2;
            const endX = 190 - gradeWidth - 2;
            
            // Draw dotted line
            doc.setLineDash([0.5, 1], 0);
            doc.line(startX, y - 1, endX, y - 1);
            doc.setLineDash([], 0);
            
            doc.text(gradeText, 190, y, { align: 'right' });
            y += 6;
        });
        y += 5;
    }

    // Elective
    if (electiveGrades.length > 0) {
        doc.setFont('helvetica', 'bold');
        doc.text('IZBORNI PREDMETI:', 20, y);
        y += 7;
        doc.setFont('helvetica', 'normal');
        electiveGrades.forEach(g => {
            doc.text(g.subjectName, 20, y);
            const gradeText = formatGradeRepresentation(g.gradeValue);
            // Measure widths to draw dots
            const subjectWidth = doc.getTextWidth(g.subjectName);
            const gradeWidth = doc.getTextWidth(gradeText);
            const startX = 20 + subjectWidth + 2;
            const endX = 190 - gradeWidth - 2;
            
            // Draw dotted line
            doc.setLineDash([0.5, 1], 0);
            doc.line(startX, y - 1, endX, y - 1);
            doc.setLineDash([], 0);
            
            doc.text(gradeText, 190, y, { align: 'right' });
            y += 6;
        });
        y += 5;
    }

    // --- SUMMARY ---
    y += 5;
    doc.setFontSize(10);
    doc.text(`Ukupno izostanaka: ${student?.absences || 0} sati; od toga neopravdano: ${student?.unjustified_absences || 0} sati.`, 20, y);
    y += 6;
    doc.text(`Vladanje: ${data.conduct || 'uzorno'}.`, 20, y);
    y += 8;
    doc.text(`Učenik je s ${data.overallSuccess} (${data.overallAverage}) uspjehom završio ${data.className} razred.`, 20, y);
    
    // --- SIGNATURES ---
    const sigY = elements.signatureLineY || 255;
    y = sigY - 20;
    
    // Signature lines
    doc.line(20, y, 70, y);
    doc.line(140, y, 190, y);
    
    doc.setFontSize(9);
    doc.text(data.homeroomTeacherTitle || 'Razrednik', 45, y + 5, { align: 'center' });
    doc.text(data.principalTitle || 'Ravnatelj', 165, y + 5, { align: 'center' });

    // Stamp
    if (elements.showStamp) {
        doc.setFontSize(9);
        doc.text('M. P.', 105, y+2, { align: 'center' });
    }

    return doc;
};

export const generateFinalWorkCertificatePDF = async (student: any, data: any, isTrial: boolean = false) => {
    // Standard portrait A4: 210mm x 297mm
    const doc = new jsPDF('p', 'mm', 'a4');

    const defaultTemplateConfig = {
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
    };

    // 1. Resolve template configuration
    let template = data.templateConfig;
    if (template && template.FINAL_WORK_CERTIFICATE) {
        template = template.FINAL_WORK_CERTIFICATE;
    } else if (template && !template.layout && template.CLASS_CERTIFICATE) {
        // If template has CLASS_CERTIFICATE but no FINAL_WORK_CERTIFICATE root
        template = defaultTemplateConfig;
    }
    
    const layout = template?.layout || defaultTemplateConfig.layout;
    const typography = template?.typography || defaultTemplateConfig.typography;
    const texts = template?.texts || defaultTemplateConfig.texts;
    const elements = template?.elements || defaultTemplateConfig.elements;

    // --- OFFICIAL BORDER FRAME ---
    if (layout.showBorder) {
        doc.saveGraphicsState();
        if (layout.borderStyle === 'double-turquoise') {
            doc.setDrawColor(78, 190, 199);
            doc.setLineWidth(1.2);
            doc.rect(4, 4, 202, 289, 'S');
            doc.setLineWidth(0.4);
            doc.rect(5.5, 5.5, 199, 286, 'S');
        } else if (layout.borderStyle === 'sleek-dark') {
            doc.setDrawColor(40, 45, 55);
            doc.setLineWidth(0.5);
            doc.rect(4, 4, 202, 289, 'S');
        } else if (layout.borderStyle === 'gold-line') {
            doc.setDrawColor(212, 175, 55);
            doc.setLineWidth(1.0);
            doc.rect(4, 4, 202, 289, 'S');
            doc.setLineWidth(0.3);
            doc.rect(5.5, 5.5, 199, 286, 'S');
        } else if (layout.borderStyle === 'minimal') {
            doc.setDrawColor(30, 40, 60);
            doc.setLineWidth(0.8);
            doc.line(4, 5, 206, 5);
            doc.line(4, 292, 206, 292);
        }
        doc.restoreGraphicsState();
    }

    // --- TRIAL WATERMARK ---
    if (isTrial && layout.showWatermark !== false) {
        doc.saveGraphicsState();
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(215, 215, 215);
        doc.setFontSize(48);
        doc.text('PROBNI ISPIS', 50, 180, { angle: 45 });
        doc.restoreGraphicsState();
    }

    doc.setTextColor(20, 20, 30);
    doc.setFont('helvetica', 'normal');

    // --- TOP MARGIN OFFSET ---
    let y = layout.topMargin || 15;

    // --- COUNTRY HEADER ---
    doc.setFontSize(typography.headerFontSize || 11);
    doc.setFont('helvetica', 'normal');
    doc.text(texts.headerCountry || 'REPUBLIKA HRVATSKA', 105, y, { align: 'center' });

    // --- SCHOOL NAME ---
    y += 7;
    doc.setFontSize(typography.schoolNameFontSize || 14);
    doc.setFont('helvetica', 'bold');
    doc.text(data.schoolName.toUpperCase(), 105, y, { align: 'center' });

    // Horizontal thin separator
    y += 5;
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.4);
    doc.line(20, y, 190, y);

    // --- ACADEMIC METADATA SUB-HEADER ---
    y += 6;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    // Left Metadata
    doc.text(`Stečeno zanimanje/kvalifikacija: ${data.programName || 'N/A'}`, 20, y);
    doc.text(`Matični broj učenika: ${student?.registry_number || student?.student_registry_number || 'N/A'}`, 20, y + 6);
    
    // Right Metadata
    doc.text(`OIB škole: ${data.oib || 'N/A'}`, 190, y, { align: 'right' });
    doc.text(`KLASA: ${data.klasa || 'N/A'}   |   URBROJ: ${data.urbroj || 'N/A'}`, 190, y + 6, { align: 'right' });

    y += 12;

    // --- DOCUMENT TITULAR ---
    doc.setFontSize(typography.titleFontSize || 22);
    doc.setFont('helvetica', 'bold');
    doc.text(texts.documentTitle || 'SVJEDODŽBA', 105, y, { align: 'center' });

    // Document Subtitle
    const documentSubtitle = texts.documentSubtitle || "O ZAVRŠNOME RADU";
    if (documentSubtitle) {
        y += 6;
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(documentSubtitle, 105, y, { align: 'center' });
    }

    // Underline decorative line
    y += 3;
    doc.setDrawColor(40, 45, 55);
    doc.setLineWidth(0.6);
    doc.line(70, y, 140, y);

    // --- STUDENT DETAILS ---
    y += 8;
    doc.setFontSize(typography.studentNameFontSize || 18);
    doc.setFont('helvetica', 'bold');
    doc.text(data.studentName.toUpperCase(), 105, y, { align: 'center' });

    y += 5;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const genderLabel = student?.gender === 'FEMALE' || student?.gender === 'Ž' ? 'kći/sin' : 'učenik/ca';
    doc.text(`OIB: ${data.studentOib}   |   spol: ${student?.gender === 'FEMALE' || student?.gender === 'Ž' ? 'Ženski' : 'Muški'}`, 105, y, { align: 'center' });

    // --- TEMPLATED BODY PARAGRAPH ---
    y += 7;
    doc.setFontSize(typography.bodyFontSize || 10);
    
    let bodyText = texts.bodyTemplate || defaultTemplateConfig.texts.bodyTemplate;
    bodyText = bodyText.replace('{birthday}', student?.dob || '____________');
    bodyText = bodyText.replace('{birthplace}', student?.birthplace || student?.pob || '____________');
    bodyText = bodyText.replace('{birth_country}', student?.birth_country || 'Republika Hrvatska');
    bodyText = bodyText.replace('{citizenship}', student?.citizenship || 'Republika Hrvatska');
    
    const parentDetails = student?.father_name || student?.mother_name || '____________';
    bodyText = bodyText.replace('{parents_name}', parentDetails);
    bodyText = bodyText.replace('{school_year}', data.schoolYear || '______/____.');
    bodyText = bodyText.replace('{class_name}', data.className || '____');
    bodyText = bodyText.replace('{class_year}', data.className || '____');
    bodyText = bodyText.replace('{program_name}', data.programName || '__________');
    
    const dateConditions = data.degreeDate || data.date || '____________';
    bodyText = bodyText.replace('{date_conditions_met}', dateConditions);
    bodyText = bodyText.replace('{thesis_title}', data.thesisTitle || '____________');

    const bodyParagraphLines = doc.splitTextToSize(bodyText, 170);
    doc.text(bodyParagraphLines, 20, y);

    // Increment Y past body text dynamically
    y += (bodyParagraphLines.length * ((typography.bodyFontSize || 10) * 0.45)) + 4;

    const formatGradeValue = (val: any) => {
        const str = val ? val.toString().trim() : '';
        if (str === '5') return 'odličan (5)';
        if (str === '4') return 'vrlo dobar (4)';
        if (str === '3') return 'dobar (3)';
        if (str === '2') return 'dovoljan (2)';
        if (str === '1') return 'nedovoljan (1)';
        return str;
    };

    if (elements.showTable) {
        const tableRows = [
            ['Izrada završnoga rada', formatGradeValue(data.creationGrade)],
            ['Obrana završnoga rada', formatGradeValue(data.defenseGrade)]
        ];
        
        autoTable(doc, {
            startY: y,
            margin: { left: 20, right: 20 },
            head: [['Dio završnog rada', 'Ocjena']],
            body: tableRows,
            theme: 'striped',
            headStyles: {
                fillColor: [212, 175, 55],
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                halign: 'left',
                fontSize: typography.tableHeaderFontSize || 10
            },
            styles: {
                fontSize: typography.tableBodyFontSize || 9,
                cellPadding: 3,
                font: 'helvetica'
            },
            columnStyles: {
                0: { cellWidth: 120 },
                1: { cellWidth: 50, halign: 'center', fontStyle: 'bold' }
            }
        });
        y = (doc as any).lastAutoTable.finalY + 7;
    }

    // --- SUMMARY container ---
    doc.saveGraphicsState();
    doc.setDrawColor(212, 175, 55);
    doc.setFillColor(248, 250, 252);
    doc.rect(20, y, 170, 14, 'FD');
    doc.restoreGraphicsState();

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`Opći uspjeh iz završnoga rada:`, 25, y + 9);
    doc.setFont('helvetica', 'normal');
    doc.text(`${formatGradeValue(data.overallSuccess || 5)}`, 90, y + 9);

    // --- ISSUE DETAILS ---
    y += 24;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`U / Na ${data.certificatePlace}, ${data.date}.`, 20, y);

    // --- PERFECTLY ALIGNED SIGNATURE ROWS near bottom area ---
    const sigY = elements.signatureLineY || 250;

    if (elements.showSignatures) {
        // Left Column: Homeroom Teacher
        if (data.teacherSigUrl) {
            try {
                doc.addImage(data.teacherSigUrl, 'PNG', 20, sigY - 14, 44, 12);
            } catch (e) {
                console.warn("Failed rendering homeroom teacher signature image", e);
            }
        }
        doc.setDrawColor(200, 200, 200);
        doc.line(20, sigY, 70, sigY);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(data.homeroomTeacherTitle || 'Razrednik', 45, sigY + 5, { align: 'center' });

        // Middle Column: Stamp Space
        if (elements.showStamp && data.stampUrl) {
            try {
                doc.addImage(data.stampUrl, 'PNG', 88, sigY - 17, 34, 34);
            } catch (e) {
                console.warn("Failed rendering stamp image", e);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.text('M. P.', 105, sigY - 2, { align: 'center' });
            }
        } else if (elements.showStamp) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.text('M. P.', 105, sigY - 2, { align: 'center' });
        }

        // Right Column: Principal
        if (data.principalSigUrl) {
            try {
                doc.addImage(data.principalSigUrl, 'PNG', 140, sigY - 14, 44, 12);
            } catch (e) {
                console.warn("Failed rendering principal signature image", e);
            }
        }
        doc.line(140, sigY, 190, sigY);
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(data.principalName, 165, sigY - 16, { align: 'center' });
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(data.principalTitle || 'Ravnatelj', 165, sigY + 5, { align: 'center' });
    }

    return doc;
};

export const generateExamCertificatePDF = async (student: any, exams: any[], globalData: any, gradeLevel: number, isTrial: boolean = false) => {
    // A4 Portrait
    const doc = new jsPDF('p', 'mm', 'a4');

    // ... (logic to build the official table)
    // 1. Double border (Teal standard frame matching school styling)
    doc.saveGraphicsState();
    doc.setDrawColor(0, 92, 141); 
    doc.setLineWidth(0.8);
    doc.rect(15, 15, 180, 267);
    doc.rect(16.5, 16.5, 177, 264);
    doc.restoreGraphicsState();

    // 2. School Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('REPUBLIKA HRVATSKA', 25, 30);
    doc.setFont('helvetica', 'normal');
    doc.text(globalData.schoolName || 'Srednja škola', 25, 35);
    doc.text(globalData.place || 'Zagreb', 25, 40);

    // 3. Document Header
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 92, 141);
    doc.text('P O T V R D A', 105, 70, { align: 'center' });
    doc.setFontSize(11);
    doc.text('O POLOŽENOM RAZLIKOVNOM / DOPUNSKOM / POPRAVNOM ISPITU', 105, 77, { align: 'center' });

    // 4. Student info
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(14);
    doc.text(student.name, 105, 95, { align: 'center' });
    
    // ... Table with exams
    let y = 110;
    const tableRows = exams.map(e => [
        e.subjects?.name || 'Nepoznat predmet',
        e.grade_value ? `odličan (${e.grade_value})` : '—', // This mapping needs improvement based on user requirements 1-5
        e.exam_type || '—',
        new Date(e.date).toLocaleDateString('hr-HR')
    ]);

    autoTable(doc, {
        startY: y,
        margin: { left: 20, right: 20 },
        head: [['Predmet', 'Ocjena', 'Vrsta ispita', 'Datum']],
        body: tableRows,
        theme: 'striped',
    });

    return doc;
};
