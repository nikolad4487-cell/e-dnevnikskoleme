import fs from 'fs';

let content = fs.readFileSync('src/pages/student/FinalThesisPage.tsx', 'utf8');
content = content.replace(/\.title/g, '.thesis_title');
content = content.replace(/\.exam_term/g, '.exam_period');
content = content.replace(/\.work_grade/g, '.creation_grade');
content = content.replace(/\.work_grade_date/g, '.creation_date');
content = content.replace(/\.defense_grade_date/g, '.defense_date');
fs.writeFileSync('src/pages/student/FinalThesisPage.tsx', content);

let content2 = fs.readFileSync('src/pages/teacher/FinalThesisTeacherPage.tsx', 'utf8');
content2 = content2.replace(/\.title/g, '.thesis_title');
content2 = content2.replace(/\.exam_term/g, '.exam_period');
content2 = content2.replace(/\.work_grade/g, '.creation_grade');
content2 = content2.replace(/\.work_grade_date/g, '.creation_date');
content2 = content2.replace(/\.defense_grade_date/g, '.defense_date');
fs.writeFileSync('src/pages/teacher/FinalThesisTeacherPage.tsx', content2);

let content3 = fs.readFileSync('src/components/ThesisGradingModal.tsx', 'utf8');
content3 = content3.replace(/\.title/g, '.thesis_title');
content3 = content3.replace(/\.work_grade/g, '.creation_grade');
content3 = content3.replace(/\.work_grade_date/g, '.creation_date');
content3 = content3.replace(/\.defense_grade_date/g, '.defense_date');
fs.writeFileSync('src/components/ThesisGradingModal.tsx', content3);

let content4 = fs.readFileSync('src/components/certificates/FinalThesisTab.tsx', 'utf8');
content4 = content4.replace(/\.title/g, '.thesis_title');
fs.writeFileSync('src/components/certificates/FinalThesisTab.tsx', content4);

console.log("Done");
