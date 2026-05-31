import dotenv from "dotenv";
dotenv.config();

console.log("All environment variable keys:");
console.log(Object.keys(process.env).sort());
