const fs = require('fs');

const file = 'src/pages/teacher/ImenikPage.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/setStudents\(mappedStudents\);/g, `
const uniqueStudents = Array.from(new Map(mappedStudents.map(s => [s.id, s])).values());
setStudents(uniqueStudents);
`);

fs.writeFileSync(file, content);
console.log('Fixed ImenikPage');
