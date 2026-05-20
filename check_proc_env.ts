console.log('--- process.env keys ---');
Object.keys(process.env).forEach(key => {
  if (key.includes('SUPABASE') || key.includes('KEY') || key.includes('DB') || key.includes('PASSWORD') || key.includes('URL')) {
    console.log(key + ': ' + (process.env[key] ? '(present)' : '(empty)'));
  } else {
    console.log(key);
  }
});
