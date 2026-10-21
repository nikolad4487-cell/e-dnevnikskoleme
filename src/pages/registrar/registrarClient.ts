import { supabase } from "../../lib/supabase";
export async function registrarRpc<T = any>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const proof = await supabase.rpc("registrar_touch_session");
  if (proof.error)
    throw new Error("Prijavite se PIN-om i kodom autentifikatora.");
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}
export async function documentRequest(
  body: Record<string, unknown>,
  asBlob = false,
) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Prijava je istekla.");
  const response = await fetch("/api/registrar/documents", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session.access_token}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const e = await response
      .json()
      .catch(() => ({ error: "Usluga dokumenata nije dostupna." }));
    throw new Error(e.error);
  }
  return asBlob ? response.blob() : response.json();
}
