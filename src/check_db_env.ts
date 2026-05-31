import dotenv from "dotenv";
dotenv.config();

console.log("Database connection keys found:");
for (const key of Object.keys(process.env)) {
  if (key.includes("DB") || key.includes("DATABASE") || key.includes("PG") || key.includes("POSTGRES") || key.includes("CONN")) {
    console.log(`- ${key}: ${process.env[key] ? 'exists (length ' + process.env[key]!.length + ')' : 'empty'}`);
  }
}
