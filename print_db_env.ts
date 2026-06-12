import dotenv from 'dotenv';
dotenv.config();

console.log("DB KEYS:", Object.keys(process.env).filter(k => k.toLowerCase().includes("sql") || k.toLowerCase().includes("database") || k.toLowerCase().includes("port") || k.toLowerCase().includes("user")));
