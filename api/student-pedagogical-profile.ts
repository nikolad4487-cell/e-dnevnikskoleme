import { supabaseAdmin } from './_supabase.js';
import fs from 'fs';
import path from 'path';

function readJsonFile(filename: string): any[] {
  try {
    const filePath = path.join(process.cwd(), 'data', filename);
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content || '[]');
  } catch (error) {
    console.error(`Error reading flat JSON file ${filename}:`, error);
    return [];
  }
}

function writeJsonFile(filename: string, data: any[]) {
  try {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const filePath = path.join(dataDir, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error(`Error writing flat JSON file ${filename}:`, error);
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const studentId = url.searchParams.get('studentId');
    if (!studentId) {
      return new Response(JSON.stringify({ error: 'studentId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fetch the real, current program_adjustment directly from the user_profiles table if database is online
    let dbProgramAdjustment = 'NONE';
    if (supabaseAdmin) {
      try {
        const { data: userProf, error: userProfErr } = await supabaseAdmin
          .from('user_profiles')
          .select('program_adjustment')
          .eq('id', studentId)
          .maybeSingle();
        if (!userProfErr && userProf) {
          dbProgramAdjustment = userProf.program_adjustment || 'NONE';
        }
      } catch (dbErr) {
        console.warn('Failed to query program_adjustment from user_profiles in GET:', dbErr);
      }
    }

    let profile: any = null;

    if (supabaseAdmin) {
      try {
        const { data, error } = await supabaseAdmin
          .from('student_pedagogical_profiles')
          .select('*')
          .eq('student_id', studentId)
          .maybeSingle();
        if (!error && data) {
          profile = data;
        }
      } catch (dbErr) {
        console.warn('student_pedagogical_profiles query failed or table doesn\'t exist:', dbErr);
      }
    }

    if (!profile) {
      // JSON Fallback
      let list = readJsonFile('student_pedagogical_profiles.json');
      profile = list.find(p => p.student_id === studentId || p.studentId === studentId);
      if (!profile) {
        profile = {
          student_id: studentId,
          education_program: '',
          visit_reason: '',
          disabilities: '',
          accommodations: '',
          support_types: '',
          practical_training: '',
          documentation: '',
          program_adjustment: 'NONE',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      }
    }

    // ALWAYS override program_adjustment with the real value from user_profiles
    profile.program_adjustment = dbProgramAdjustment;

    console.log('LOAD PEDAGOGICAL PROFILE', profile);
    return new Response(JSON.stringify(profile), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('[PEDAGOGICAL_PROFILE_GET] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleSave(req: Request) {
  try {
    const payload = await req.json();
    const { studentId } = payload;
    if (!studentId) {
      return new Response(JSON.stringify({ error: 'studentId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const dbPayload = {
      student_id: studentId,
      education_program: payload.education_program || payload.educationProgram || '',
      visit_reason: payload.visit_reason || payload.visitReason || '',
      disabilities: payload.disabilities || '',
      accommodations: payload.accommodations || '',
      support_types: payload.support_types || payload.supportTypes || '',
      practical_training: payload.practical_training || payload.practicalTraining || '',
      documentation: payload.documentation || '',
      program_adjustment: payload.program_adjustment || payload.programAdjustment || 'NONE',
      updated_at: new Date().toISOString()
    };

    if (supabaseAdmin) {
      try {
        const adjValue = payload.program_adjustment || payload.programAdjustment || 'NONE';
        const { error: updErr } = await supabaseAdmin
          .from('user_profiles')
          .update({ program_adjustment: adjValue })
          .eq('id', studentId);
        if (updErr) {
          console.warn('Error updating program_adjustment in user_profiles on Supabase:', updErr);
        }
      } catch (dbErr) {
        console.warn('Could not update program_adjustment in user_profiles on Supabase:', dbErr);
      }

      try {
        const { data, error } = await supabaseAdmin
          .from('student_pedagogical_profiles')
          .upsert(dbPayload, { onConflict: 'student_id' })
          .select('*')
          .maybeSingle();
        if (!error && data) {
          return new Response(JSON.stringify(data), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        } else {
          console.log('[INFO] Synchronization fallback: using local JSON storage.', error);
        }
      } catch (dbErr) {
        console.warn('student_pedagogical_profiles upsert failed:', dbErr);
      }
    }

    // JSON Fallback
    let list = readJsonFile('student_pedagogical_profiles.json');
    const idx = list.findIndex(p => p.student_id === studentId);
    const newProfile = {
      id: idx >= 0 ? list[idx].id : Math.random().toString(36).substring(2, 9) + '-' + Date.now(),
      ...dbPayload,
      created_at: idx >= 0 ? list[idx].created_at : new Date().toISOString()
    };

    if (idx >= 0) {
      list[idx] = newProfile;
    } else {
      list.push(newProfile);
    }
    writeJsonFile('student_pedagogical_profiles.json', list);

    return new Response(JSON.stringify(newProfile), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('[PEDAGOGICAL_PROFILE_SAVE] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function POST(req: Request) {
  return handleSave(req);
}

export async function PUT(req: Request) {
  return handleSave(req);
}

export async function PATCH(req: Request) {
  return handleSave(req);
}
