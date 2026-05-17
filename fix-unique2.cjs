const fs = require('fs');

const file = 'src/pages/teacher/AdministrationPage.tsx';
let content = fs.readFileSync(file, 'utf8');

// deduplicate allSubjects
content = content.replace(/setAllSubjects\(mapList\(subAll, mappers\.subject\)\);/g, `
const mappedSub = mapList(subAll, mappers.subject);
const uniqueSub = Array.from(new Map(mappedSub.map(s => [s.id, s])).values());
setAllSubjects(uniqueSub);
`);

content = content.replace(/setAllSubjects\(mapList\(updatedSubjects, mappers\.subject\)\);/g, `
const mappedSub2 = mapList(updatedSubjects, mappers.subject);
const uniqueSub2 = Array.from(new Map(mappedSub2.map(s => [s.id, s])).values());
setAllSubjects(uniqueSub2);
`);

// deduplicate teachers
content = content.replace(/setTeachers\(mappedTeachers as any\);/g, `
const uniqueTeachers = Array.from(new Map(mappedTeachers.map(t => [t.id, t])).values());
setTeachers(uniqueTeachers as any);
`);

fs.writeFileSync(file, content);
console.log('Fixed more lists');
