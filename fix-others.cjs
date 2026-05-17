const fs = require('fs');

const fixFile = (file, target, newText) => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(target, newText);
    fs.writeFileSync(file, content);
  }
}

fixFile('src/pages/teacher/BiljeskePage.tsx', /setStudents\(studentsList\);/g, `
const uniqueStudents = Array.from(new Map(studentsList.map(s => [s.id, s])).values());
setStudents(uniqueStudents);
`);

fixFile('src/pages/teacher/IzostanciPage.tsx', /setStudents\(studentsList\);/g, `
const uniqueStudents = Array.from(new Map(studentsList.map(s => [s.id, s])).values());
setStudents(uniqueStudents);
`);

fixFile('src/pages/admin/StudentSubjectEnrollmentPage.tsx', /setStudents\(mappedStudents\);/g, `
const uniqueStudents = Array.from(new Map(mappedStudents.map(s => [s.id, s])).values());
setStudents(uniqueStudents);
`);

console.log('Fixed more pages!');
