console.log("Searching process.env for database variables...");
Object.keys(process.env).sort().forEach(key => {
  if (key.toLowerCase().includes("db") || key.toLowerCase().includes("postgres") || key.toLowerCase().includes("password") || key.toLowerCase().includes("connection") || key.toLowerCase().includes("secret") || key.toLowerCase().includes("role")) {
    const val = process.env[key];
    console.log(`${key}: length = ${val ? val.length : 0}, preview = ${val ? val.substring(0, 15) : 'N/A'}`);
  }
});
