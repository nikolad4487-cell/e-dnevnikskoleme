import dotenv from "dotenv";
dotenv.config();

const url = process.env.VITE_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

async function run() {
  try {
    const rDef = await fetch(`${url}/rest/v1/`, {
      headers: {
        "apikey": key,
        "Authorization": `Bearer ${key}`
      }
    });
    const schema = await rDef.json();
    console.log("student_subject_enrollments def:", JSON.stringify(schema.definitions.student_subject_enrollments?.properties, null, 2));

    const rRows = await fetch(`${url}/rest/v1/student_subject_enrollments?select=*`, {
      headers: {
        "apikey": key,
        "Authorization": `Bearer ${key}`
      }
    });
    const rows = await rRows.json();
    console.log("student_subject_enrollments rows count:", rows.length);
    console.log("student_subject_enrollments rows:", JSON.stringify(rows.slice(0, 10), null, 2));
  } catch (err: any) {
    console.error("Error:", err);
  }
}
run();
