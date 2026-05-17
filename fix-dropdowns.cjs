const fs = require('fs');
let file = 'src/pages/teacher/AdministrationPage.tsx';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/\{t\.surname\} \{t\.name\}/g, '{t.name}');
fs.writeFileSync(file, content);
console.log('Fixed dropdowns');
