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
    const classId = url.searchParams.get('classId');
    const schoolYearId = url.searchParams.get('schoolYearId');

    if (!studentId || !classId || !schoolYearId) {
      return new Response(JSON.stringify({ error: 'studentId, classId and schoolYearId are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (supabaseAdmin) {
      try {
        const { data, error } = await supabaseAdmin
          .from('student_pedagogical_year_notes')
          .select('*')
          .eq('student_id', studentId)
          .eq('class_id', classId)
          .eq('school_year_id', schoolYearId)
          .maybeSingle();
        if (!error && data) {
          return new Response(JSON.stringify(data), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      } catch (dbErr) {
        console.warn('student_pedagogical_year_notes query failed:', dbErr);
      }
    }

    // JSON Fallback
    let list = readJsonFile('student_pedagogical_year_notes.json');
    let note = list.find(p => p.student_id === studentId && p.class_id === classId && p.school_year_id === schoolYearId);
    if (!note) {
      note = {
        student_id: studentId,
        class_id: classId,
        school_year_id: schoolYearId,
        recommendations: '',
        counselor_notes: '',
        yearly_observations: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    }

    return new Response(JSON.stringify(note), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('[PEDAGOGICAL_YEAR_NOTES_GET] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const { studentId, classId, schoolYearId } = payload;
    if (!studentId || !classId || !schoolYearId) {
      return new Response(JSON.stringify({ error: 'studentId, classId and schoolYearId are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const dbPayload = {
      student_id: studentId,
      class_id: classId,
      school_year_id: schoolYearId,
      recommendations: payload.recommendations || '',
      counselor_notes: payload.counselor_notes || '',
      yearly_observations: Array.isArray(payload.yearly_observations) ? payload.yearly_observations : [],
      updated_at: new Date().toISOString()
    };

    if (supabaseAdmin) {
      try {
        const { data, error } = await supabaseAdmin
          .from('student_pedagogical_year_notes')
          .upsert(dbPayload, { onConflict: 'student_id,school_year_id,class_id' })
          .select('*')
          .maybeSingle();
        if (!error && data) {
          return new Response(JSON.stringify(data), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        } else {
          console.log('[INFO] Synchronization fallback for notes: using local JSON storage.', error);
        }
      } catch (dbErr) {
        console.warn('student_pedagogical_year_notes upsert failed:', dbErr);
      }
    }

    // JSON Fallback
    let list = readJsonFile('student_pedagogical_year_notes.json');
    const idx = list.findIndex(p => p.student_id === studentId && p.class_id === classId && p.school_year_id === schoolYearId);
    const newNote = {
      id: idx >= 0 ? list[idx].id : Math.random().toString(36).substring(2, 9) + '-' + Date.now(),
      ...dbPayload,
      created_at: idx >= 0 ? list[idx].created_at : new Date().toISOString()
    };

    if (idx >= 0) {
      list[idx] = newNote;
    } else {
      list.push(newNote);
    }
    writeJsonFile('student_pedagogical_year_notes.json', list);

    return new Response(JSON.stringify(newNote), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error('[PEDAGOGICAL_YEAR_NOTES_POST] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
