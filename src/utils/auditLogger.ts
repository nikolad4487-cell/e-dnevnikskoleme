import { supabase } from '../lib/supabase';

export interface AuditLogPayload {
  executor_id?: string;
  school_id: string;
  action_type: string;
  entity_type: string;
  entity_id: string;
  old_value?: any;
  new_value?: any;
}

export async function logSystemAction(payload: AuditLogPayload) {
  try {
    // 1. Log to DB via Supabase
    if (payload.executor_id) {
      try {
        const { error } = await supabase.from('system_audit_logs').insert({
          executor_id: payload.executor_id,
          school_id: payload.school_id,
          action_type: payload.action_type,
          entity_type: payload.entity_type,
          entity_id: payload.entity_id,
          old_value: payload.old_value || null,
          new_value: payload.new_value || null
        });
        if (error) {
          console.warn("Supabase audit log warning (falling back to JSON endpoint):", error);
        }
      } catch (dbErr) {
        console.warn("DB write warning for audit log:", dbErr);
      }
    }

    // 2. Log to file-backed JSON fallback API to guarantee resilience
    await fetch('/api/audit-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        created_at: new Date().toISOString()
      })
    });
  } catch (err) {
    console.error("System audit log write failed:", err);
  }
}
