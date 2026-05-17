const fs = require('fs');

const file = 'src/pages/teacher/AdministrationPage.tsx';
let content = fs.readFileSync(file, 'utf8');

// Fix missing curly braces
content = content.replace(/if \(subAll\) \nconst mappedSub/g, `if (subAll) {\nconst mappedSub`);
content = content.replace(/setAllSubjects\(uniqueSub\);\n/g, `setAllSubjects(uniqueSub);\n}\n`);

content = content.replace(/if \(updatedSubjects\) \nconst mappedSub2/g, `if (updatedSubjects) {\nconst mappedSub2`);
content = content.replace(/setAllSubjects\(uniqueSub2\);\n/g, `setAllSubjects(uniqueSub2);\n}\n`);

fs.writeFileSync(file, content);
console.log('Fixed braces');
