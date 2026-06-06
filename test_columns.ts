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

    // Fetch assignments for the specific class
    let res = await fetch(`${url}/rest/v1/class_subject_teachers?class_id=eq.05971197-cf5a-4fed-bb1e-2a76a476e2ce&select=*`, {
      headers: {
        "apikey": key,
        "Authorization": `Bearer ${key}`
      }
    });
    const assignments = await res.json();
    console.log("assignments in class:", JSON.stringify(assignments, null, 2));

    // Fetch user profiles for the teachers in those assignments
    const teacherIds = assignments.map((a: any) => a.teacher_id);
    const idQuery = teacherIds.map((id: string) => `id.eq.${id}`).join(",");
    res = await fetch(`${url}/rest/v1/user_profiles?or=(${idQuery})&select=*`, {
      headers: {
        "apikey": key,
        "Authorization": `Bearer ${key}`
      }
    });
    const profiles = await res.json();
    console.log("profiles found:", JSON.stringify(profiles, null, 2));
  } catch (err: any) {
    console.error("Error:", err);
  }
}
run();
