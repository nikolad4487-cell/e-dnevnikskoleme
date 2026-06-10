import { jsPDF } from 'jspdf';

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

    await Promise.all([
      loadFont(blobRegular, 'NotoSans', 'normal'),
      loadFont(blobBold, 'NotoSans', 'bold'),
    ]);
  } catch (error) {
    console.error('Failed to load Unicode font', error);
    doc.setFont('helvetica');
  }
};

export const formatCroatianDate = (dateStr: string) => {
  if (!dateStr) return '____________';
  const normalized = String(dateStr).trim();
  if (/^\d{1,2}\.\d{1,2}\.\d{4}\.?$/.test(normalized)) {
    return normalized.endsWith('.') ? normalized : `${normalized}.`;
  }
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return normalized;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}.`;
};

export const toCroatianLocative = (place: string) => {
  if (!place || place === '____________') return '____________';
  const cleanPlace = place.trim();
  const lower = cleanPlace.toLowerCase();
  if (lower === 'zagreb') return 'Zagrebu';
  if (lower === 'glina') return 'Glini';
  if (lower.endsWith('a')) return `${cleanPlace.slice(0, -1)}i`;
  if (lower.endsWith('ec')) return `${cleanPlace.slice(0, -2)}cu`;
  return `${cleanPlace}u`;
};

export const getGradeLevelWord = (className: string) => {
  const value = (className || '').trim().toUpperCase();
  if (value.startsWith('1') || value.startsWith('I')) return 'prvi';
  if (value.startsWith('2') || value.startsWith('II')) return 'drugi';
  if (value.startsWith('3') || value.startsWith('III')) return 'tre\u0107i';
  if (value.startsWith('4') || value.startsWith('IV')) return '\u010detvrti';
  return 'prvi';
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
  thesisTitle?: string;
  creationGrade?: string;
  defenseGrade?: string;
};

type ExamGlobalData = {
  schoolName?: string;
  programName?: string;
  schoolYear?: string;
  place?: string;
  date?: string;
  oib?: string;
  klasa?: string;
  urbroj?: string;
  principalName?: string;
  principalTitle?: string;
  homeroomTeacherName?: string;
  homeroomTeacherTitle?: string;
  stampUrl?: string;
  principalSigUrl?: string;
  teacherSigUrl?: string;
};

const PAGE = {
  width: 210,
  height: 297,
  left: 18,
  right: 192,
};

function getGenderLabel(student: any) {
  const gender = String(student?.gender || '').toUpperCase();
  if (gender === 'FEMALE' || gender === '\u017d' || gender === 'Z') return '\u017d';
  return 'M';
}

function getStudentNoun(student: any) {
  return getGenderLabel(student) === '\u017d' ? 'U\u010denica' : 'U\u010denik';
}

function getParentNames(student: any) {
  const names = [student?.father_name, student?.mother_name]
    .filter(Boolean)
    .map((value: string) => value.trim())
    .filter(Boolean);

  if (names.length === 0) return '____________';
  return names.join(' i ');
}

function getQualificationText(programName: string) {
  const normalized = (programName || '').trim();
  const lower = normalized.toLowerCase();
  const duration = lower.includes('kuhar') || lower.includes('konobar') || lower.includes('slasti\u010dar')
    ? 'tri godine'
    : '\u010detiri godine';
  return `za stjecanje kvalifikacije ${normalized.toLowerCase()} u trajanju od ${duration}`;
}

function formatGradeValue(value: any) {
  const normalized = String(value ?? '').trim().toLowerCase();
  const mapping: Record<string, string> = {
    '1': 'nedovoljan (1)',
    '2': 'dovoljan (2)',
    '3': 'dobar (3)',
    '4': 'vrlo dobar (4)',
    '5': 'odli\u010dan (5)',
    'nedovoljan': 'nedovoljan (1)',
    'dovoljan': 'dovoljan (2)',
    'dobar': 'dobar (3)',
    'vrlo dobar': 'vrlo dobar (4)',
    'odli\u010dan': 'odli\u010dan (5)',
  };

  return mapping[normalized] || String(value || '');
}

function successToAdjectivePhrase(success: string) {
  const lower = String(success || '').toLowerCase();
  if (lower.includes('odli')) return 'odli\u010dnim';
  if (lower.includes('vrlo dobar')) return 'vrlo dobrim';
  if (lower.includes('dobar')) return 'dobrim';
  if (lower.includes('dovoljan')) return 'dovoljnim';
  if (lower.includes('nedovoljan')) return 'nedovoljnim';
  return lower || 'dobrim';
}

function drawDecorativeBorder(doc: jsPDF, color: [number, number, number]) {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.8);
  doc.rect(8, 8, 194, 281);
  doc.setLineWidth(0.35);
  doc.rect(11, 11, 188, 275);
  doc.setLineWidth(0.2);
  doc.rect(14, 14, 182, 269);
}

function drawHeader(doc: jsPDF, schoolName: string) {
  doc.setTextColor(35, 35, 35);
  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(11);
  doc.text('REPUBLIKA HRVATSKA', 105, 24, { align: 'center' });
  doc.setLineWidth(0.25);
  doc.line(28, 32, 182, 32);
  doc.setFont('NotoSans', 'bold');
  doc.setFontSize(13);
  doc.text(schoolName, 105, 42, { align: 'center' });
}

function drawMetaBlock(doc: jsPDF, leftTop: string, leftBottom: string, rightTop: string, rightBottom: string) {
  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(10);
  doc.text(leftTop, 28, 54);
  doc.text(leftBottom, 28, 61);
  doc.text(rightTop, 156, 54);
  doc.text(rightBottom, 156, 61);
}

function drawSignatureBlock(doc: jsPDF, data: { teacherTitle: string; teacherName: string; principalTitle: string; principalName: string; stampUrl?: string; teacherSigUrl?: string; principalSigUrl?: string }, baseY: number) {
  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(11);
  doc.text(data.teacherTitle, 52, baseY, { align: 'center' });
  doc.text(data.principalTitle, 158, baseY, { align: 'center' });

  if (data.stampUrl) {
    try {
      doc.addImage(data.stampUrl, 'PNG', 91, baseY - 12, 28, 28);
    } catch (error) {
      console.warn('Failed rendering stamp image', error);
      doc.text('M. P.', 105, baseY + 10, { align: 'center' });
    }
  } else {
    doc.text('M. P.', 105, baseY + 10, { align: 'center' });
  }

  doc.setLineWidth(0.3);
  doc.line(28, baseY + 16, 76, baseY + 16);
  doc.line(134, baseY + 16, 182, baseY + 16);

  if (data.teacherSigUrl) {
    try {
      doc.addImage(data.teacherSigUrl, 'PNG', 32, baseY + 2, 38, 10);
    } catch (error) {
      console.warn('Failed rendering teacher signature image', error);
    }
  }

  if (data.principalSigUrl) {
    try {
      doc.addImage(data.principalSigUrl, 'PNG', 138, baseY + 2, 38, 10);
    } catch (error) {
      console.warn('Failed rendering principal signature image', error);
    }
  }

  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(10);
  doc.text(data.teacherName || '____________', 52, baseY + 23, { align: 'center' });
  doc.text(data.principalName || '____________', 158, baseY + 23, { align: 'center' });
}

function drawMultilineText(doc: jsPDF, text: string, x: number, y: number, width: number, lineHeight = 5.4) {
  const lines = doc.splitTextToSize(text, width);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function drawGradeBox(doc: jsPDF, mandatoryGrades: CertificateData['grades'], electiveGrades: CertificateData['grades'], x: number, y: number, width: number, minHeight = 105) {
  const titleHeight = 7;
  const rowHeight = 7;
  const categories = [
    { title: 'Obvezni predmeti', rows: mandatoryGrades },
    { title: 'Izborni predmeti', rows: electiveGrades },
  ];
  const lineCount = categories.reduce((sum, category) => sum + 1 + Math.max(category.rows.length, 1), 0);
  const contentHeight = lineCount * rowHeight + 6;
  const boxHeight = Math.max(minHeight, contentHeight + 6);

  doc.setDrawColor(140, 140, 140);
  doc.setLineWidth(0.25);
  doc.rect(x, y, width, boxHeight);

  let cursorY = y + 8;
  categories.forEach((category) => {
    doc.setFont('NotoSans', 'bold');
    doc.setFontSize(11);
    doc.text(category.title, x + 4, cursorY);
    cursorY += titleHeight;

    const rows = category.rows.length > 0 ? category.rows : [{ subjectName: '____________', gradeValue: '' }];
    rows.forEach((row) => {
      const subjectName = row.subjectName || '____________';
      const gradeText = row.gradeValue ? formatGradeValue(row.gradeValue) : '';
      doc.setFont('NotoSans', 'normal');
      doc.setFontSize(10.5);
      doc.text(subjectName, x + 4, cursorY);
      const startX = x + 4 + doc.getTextWidth(subjectName) + 2;
      const endX = x + width - doc.getTextWidth(gradeText) - 6;
      if (endX > startX) {
        (doc as any).setLineDash([0.4, 1], 0);
        doc.line(startX, cursorY - 1.2, endX, cursorY - 1.2);
        (doc as any).setLineDash([], 0);
      }
      if (gradeText) {
        doc.text(gradeText, x + width - 4, cursorY, { align: 'right' });
      }
      cursorY += rowHeight;
    });
  });

  return y + boxHeight;
}

function getExamTitle(examType: string) {
  const upper = String(examType || '').toUpperCase();
  if (upper === 'DIFFERENCE') return 'Razlikovni ispit';
  if (upper === 'SUPPLEMENTARY') return 'Dopunski ispit';
  if (upper === 'REMEDIAL') return 'Popravni ispit';
  return 'Ispit';
}

function getExamCombinedLabel(exams: any[]) {
  const labels = Array.from(new Set(exams.map((exam) => getExamTitle(exam.exam_type))));
  if (labels.length === 0) return 'Razlikovni/Dopunski/Popravni ispit';
  return labels.join(' / ');
}

export const generateClassCertificatePDF = async (student: any, data: CertificateData) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  await registerUnicodeFont(doc);
  drawDecorativeBorder(doc, [150, 203, 195]);
  drawHeader(doc, data.schoolName || 'Naziv škole');
  drawMetaBlock(
    doc,
    `OIB škole: ${data.oib || '____________'}`,
    `Školska godina: ${data.schoolYear || '____________'}`,
    `KLASA: ${data.klasa || '____________'}`,
    `URBROJ: ${data.urbroj || '____________'}`,
  );

  doc.setFont('NotoSans', 'bold');
  doc.setFontSize(24);
  doc.text('SVJEDODŽBA', 105, 84, { align: 'center' });

  doc.setFontSize(17);
  doc.text(data.studentName || '____________', 105, 102, { align: 'center' });
  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(11);
  doc.text(`OIB: ${data.studentOib || '____________'}`, 105, 112, { align: 'center' });
  doc.text(`spol: ${getGenderLabel(student)}`, 182, 112, { align: 'right' });

  const birthDate = formatCroatianDate(student?.dob);
  const birthPlace = toCroatianLocative(student?.birthplace || student?.pob || '____________');
  const birthCountry = student?.birth_country || 'Republika Hrvatska';
  const citizenship = student?.citizenship || 'Republika Hrvatska';
  const parentNames = getParentNames(student);
  const classWord = getGradeLevelWord(data.className);
  const narrative = `ro\u0111en ${birthDate} godine u ${birthPlace}, ${birthCountry}, dr\u017eavljanstvo ${citizenship}, ime i prezime roditelja/skrbnika: ${parentNames}, upisao je \u0161kolske godine ${data.schoolYear} prvi put ${classWord} razred programa obrazovanja ${getQualificationText(data.programName)} i postigao sljede\u0107i uspjeh:`;

  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(10.5);
  let y = drawMultilineText(doc, narrative, 28, 124, 154, 5.2);
  y += 5;

  const mandatoryGrades = data.grades.filter((grade) => !String(grade.subjectType || '').toUpperCase().includes('ELECTIVE') && !String(grade.subjectType || '').toUpperCase().includes('IZBORNI'));
  const electiveGrades = data.grades.filter((grade) => String(grade.subjectType || '').toUpperCase().includes('ELECTIVE') || String(grade.subjectType || '').toUpperCase().includes('IZBORNI'));
  y = drawGradeBox(doc, mandatoryGrades, electiveGrades, 28, y, 154, 112);
  y += 8;

  const absences = student?.absences ?? 0;
  const unjustifiedAbsences = student?.unjustified_absences ?? 0;
  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(10.5);
  doc.text(`Ukupno izostanaka: ${absences} sati; od toga neopravdano: ${unjustifiedAbsences} sati`, 28, y);
  doc.setFont('NotoSans', 'bold');
  doc.text(`Vladanje: ${data.conduct || 'uzorno'}`, 182, y, { align: 'right' });
  y += 10;

  const noun = getStudentNoun(student);
  const average = String(data.overallAverage || '0,00').replace('.', ',');
  const successAdjective = successToAdjectivePhrase(data.overallSuccess);
  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(11);
  doc.text(`${noun} je s ${successAdjective} (${average}) uspjehom zavr\u0161io ${classWord} razred.`, 105, y, { align: 'center' });
  y += 12;

  doc.text(`${data.certificatePlace || 'Zagreb'}, ${formatCroatianDate(data.date)}`, 105, y, { align: 'center' });
  drawSignatureBlock(doc, {
    teacherTitle: data.homeroomTeacherTitle || 'Razrednik',
    teacherName: data.homeroomTeacherName || '____________',
    principalTitle: data.principalTitle || 'Ravnatelj',
    principalName: data.principalName || '____________',
    stampUrl: data.stampUrl,
    teacherSigUrl: data.teacherSigUrl,
    principalSigUrl: data.principalSigUrl,
  }, 255);

  return doc;
};

export const generateFinalWorkCertificatePDF = async (student: any, data: CertificateData) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  await registerUnicodeFont(doc);
  drawDecorativeBorder(doc, [224, 192, 120]);
  drawHeader(doc, data.schoolName || 'Naziv škole');
  drawMetaBlock(
    doc,
    `OIB škole: ${data.oib || '____________'}`,
    `Matični broj učenika: ${student?.student_registry_number || '____________'}`,
    `KLASA: ${data.klasa || '____________'}`,
    `URBROJ: ${data.urbroj || '____________'}`,
  );

  doc.setFont('NotoSans', 'bold');
  doc.setFontSize(22);
  doc.text('SVJEDODŽBA', 105, 84, { align: 'center' });
  doc.text('O ZAVRŠNOME RADU', 105, 95, { align: 'center' });

  doc.setFontSize(17);
  doc.text(data.studentName || '____________', 105, 112, { align: 'center' });
  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(11);
  doc.text(`OIB: ${data.studentOib || '____________'}`, 105, 122, { align: 'center' });
  doc.text(`spol: ${getGenderLabel(student)}`, 182, 122, { align: 'right' });

  const birthDate = formatCroatianDate(student?.dob);
  const birthPlace = toCroatianLocative(student?.birthplace || student?.pob || '____________');
  const birthCountry = student?.birth_country || 'Republika Hrvatska';
  const citizenship = student?.citizenship || 'Republika Hrvatska';
  const parentNames = getParentNames(student);
  const classWord = getGradeLevelWord(data.className || '3');
  const narrative = `ro\u0111en ${birthDate} godine u ${birthPlace}, ${birthCountry}, dr\u017eavljanstvo ${citizenship}, ime i prezime roditelja/skrbnika: ${parentNames}. Nakon zavr\u0161enoga ${classWord} razreda u\u010denik je ${formatCroatianDate(data.date)} godine stekao sve uvjete za obranu zavr\u0161noga rada. U\u010denik je izradio i obranio zavr\u0161ni rad i postigao sljede\u0107i uspjeh:`;

  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(10.5);
  let y = drawMultilineText(doc, narrative, 28, 136, 154, 5.2);
  y += 8;

  doc.setDrawColor(214, 190, 140);
  doc.setLineWidth(0.25);
  doc.rect(58, y, 94, 78);

  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(11);
  doc.text(`Izrada zavr\u0161noga rada........................ ${data.creationGrade || '____________'}`, 105, y + 16, { align: 'center' });
  doc.text(`Obrana zavr\u0161noga rada...................... ${data.defenseGrade || '____________'}`, 105, y + 30, { align: 'center' });

  doc.setFont('NotoSans', 'bold');
  doc.setFontSize(15);
  doc.text('OPĆI USPJEH', 105, y + 47, { align: 'center' });
  doc.setFontSize(13);
  doc.text(String(data.overallSuccess || '').replace(/\s*\(\d\)\s*/g, '').trim() || '____________', 105, y + 58, { align: 'center' });

  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(11);
  doc.text('U\u010denik je stekao zanimanje/kvalifikaciju', 105, y + 72, { align: 'center' });
  doc.setFont('NotoSans', 'bold');
  doc.setFontSize(13);
  doc.text(data.programName || '____________', 105, y + 83, { align: 'center' });

  y += 94;
  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(11);
  doc.text(`${data.certificatePlace || 'Zagreb'}, ${formatCroatianDate(data.date)}`, 105, y, { align: 'center' });
  drawSignatureBlock(doc, {
    teacherTitle: data.homeroomTeacherTitle || 'Razrednik',
    teacherName: data.homeroomTeacherName || '____________',
    principalTitle: data.principalTitle || 'Ravnatelj',
    principalName: data.principalName || '____________',
    stampUrl: data.stampUrl,
    teacherSigUrl: data.teacherSigUrl,
    principalSigUrl: data.principalSigUrl,
  }, 255);

  return doc;
};

export const generateExamCertificatePDF = async (student: any, exams: any[], globalData: ExamGlobalData, gradeLevel: number) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  await registerUnicodeFont(doc);

  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.35);
  doc.rect(12, 12, 186, 273);
  drawHeader(doc, globalData.schoolName || 'Naziv škole');
  drawMetaBlock(
    doc,
    `OIB škole: ${globalData.oib || '____________'}`,
    '',
    `KLASA: ${globalData.klasa || '____________'}`,
    `URBROJ: ${globalData.urbroj || '____________'}`,
  );

  doc.setFont('NotoSans', 'bold');
  doc.setFontSize(22);
  doc.text('POTVRDA', 105, 78, { align: 'center' });
  doc.setFontSize(17);
  doc.text('O POLOŽENOME RAZLIKOVNOM/DOPUNSKOM/POPRAVNOM ISPITU', 105, 92, { align: 'center', maxWidth: 150 });

  doc.setFontSize(17);
  doc.text(student?.name || '____________', 105, 116, { align: 'center' });
  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(11);
  doc.text(`OIB: ${student?.oib || '____________'}`, 105, 126, { align: 'center' });

  const birthDate = formatCroatianDate(student?.dob);
  const birthPlace = toCroatianLocative(student?.birthplace || student?.pob || '____________');
  const citizenship = student?.citizenship || 'hrvatsko';
  const periodStart = exams.length > 0 ? formatCroatianDate(exams.map((exam) => exam.exam_date).filter(Boolean).sort()[0]) : '____________';
  const periodEnd = exams.length > 0 ? formatCroatianDate(exams.map((exam) => exam.exam_date).filter(Boolean).sort().slice(-1)[0]) : '____________';
  const programName = exams[0]?.program_name || globalData.programName || globalData.schoolYear || student?.program_name || '____________';
  const classText = `${gradeLevel}. razred srednje škole`;
  const combinedLabel = getExamCombinedLabel(exams);

  let y = 144;
  doc.setFont('NotoSans', 'normal');
  doc.setFontSize(10.5);
  doc.text(`rođen ${birthDate} godine u ${birthPlace}, Republika Hrvatska, državljanstvo ${citizenship}`, 28, y);
  y += 10;
  doc.text(`Vrsta ispita: ${combinedLabel}`, 28, y);
  y += 10;
  doc.text(`Razdoblje polaganja ispita: ${periodStart} - ${periodEnd}`, 28, y);
  y += 10;
  doc.text(`Naziv programa obrazovanja prema kojem se ispit polaže: ${programName}`, 28, y, { maxWidth: 150 });
  y += 10;
  doc.text(`Razred za koji se ispit polaže: ${classText}`, 28, y);
  y += 14;

  const orderedExams = [...(exams || [])].sort((a, b) => String(a.exam_date || '').localeCompare(String(b.exam_date || '')));
  orderedExams.forEach((exam) => {
    const subjectName = exam?.subjects?.name || exam?.subject_name || 'Nepoznat predmet';
    const gradeText = formatGradeValue(exam?.grade_value || exam?.grade);
    const examLabel = getExamTitle(exam.exam_type);
    const examDate = formatCroatianDate(exam.exam_date || exam.date || '');
    const lineText = `${subjectName} (${String(exam?.subject_type || 'obvezan').toLowerCase()})`;
    doc.text(lineText, 30, y);
    const gradeX = 118;
    const examTypeX = 145;
    const dateX = 182;
    const subjectEnd = gradeX - doc.getTextWidth(gradeText) - 6;
    const lineStart = 30 + doc.getTextWidth(lineText) + 2;
    if (subjectEnd > lineStart) {
      (doc as any).setLineDash([0.4, 1], 0);
      doc.line(lineStart, y - 1.2, subjectEnd, y - 1.2);
      (doc as any).setLineDash([], 0);
    }
    doc.text(gradeText, gradeX, y, { align: 'right' });
    doc.text(examLabel, examTypeX, y);
    doc.text(examDate, dateX, y, { align: 'right' });
    y += 8;
  });

  y = Math.max(y + 14, 238);
  doc.text(`${globalData.place || 'Zagreb'}, ${formatCroatianDate(globalData.date || new Date().toISOString())}`, 105, y, { align: 'center' });
  drawSignatureBlock(doc, {
    teacherTitle: globalData.homeroomTeacherTitle || 'Razrednik',
    teacherName: globalData.homeroomTeacherName || '____________',
    principalTitle: globalData.principalTitle || 'Ravnatelj',
    principalName: globalData.principalName || '____________',
    stampUrl: globalData.stampUrl,
    teacherSigUrl: globalData.teacherSigUrl,
    principalSigUrl: globalData.principalSigUrl,
  }, 252);

  return doc;
};
