import fs from 'fs';

let content = fs.readFileSync('src/pages/student/FinalThesisPage.tsx', 'utf8');
content = content.replace(/\/api\/final-thesis-applications/g, '/api/final-thesis');
fs.writeFileSync('src/pages/student/FinalThesisPage.tsx', content);

let content2 = fs.readFileSync('src/pages/teacher/FinalThesisTeacherPage.tsx', 'utf8');
content2 = content2.replace(/\/api\/final-thesis-applications/g, '/api/final-thesis');
fs.writeFileSync('src/pages/teacher/FinalThesisTeacherPage.tsx', content2);

console.log("Done");
