import dotenv from 'dotenv';
dotenv.config();

console.log("KEYS:", Object.keys(process.env).filter(k => k.includes("SUPABASE") || k.includes("KEY")));
