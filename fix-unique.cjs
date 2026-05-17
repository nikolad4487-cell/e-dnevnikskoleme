const fs = require('fs');

const file = 'src/pages/teacher/AdministrationPage.tsx';
let content = fs.readFileSync(file, 'utf8');

// replace setStudents(mapped as any); with a deduplicated version
content = content.replace(/setStudents\(mapped as any\);/g, `
const uniqueMapped = Array.from(new Map(mapped.map(m => [m.id, m])).values());
setStudents(uniqueMapped as any);
`);

fs.writeFileSync(file, content);
console.log('Fixed setStudents');
