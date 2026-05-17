const fs = require('fs');

const file = 'src/pages/teacher/DnevnikRadaPage.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/setStudents\(studentList\);/g, `
const uniqueStudents = Array.from(new Map(studentList.map(s => [s.id, s])).values());
setStudents(uniqueStudents);
`);

fs.writeFileSync(file, content);
console.log('Fixed DnevnikRadaPage');
