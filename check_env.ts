import fs from 'fs';
if (fs.existsSync('.env')) {
  const content = fs.readFileSync('.env', 'utf-8');
  console.log('--- .env content (keys only or non-sensitive) ---');
  content.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts[0]) {
      console.log(parts[0] + ' = ' + (parts[1] ? '(present)' : '(empty)'));
    }
  });
} else {
  console.log('.env does not exist');
}
