const fs = require('fs');
let file = 'src/pages/teacher/BiljeskePage.tsx';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/a\.surname\? \|\|/g, 'a.surname ||');
fs.writeFileSync(file, content);
console.log('Fixed syntax error in BiljeskePage');
