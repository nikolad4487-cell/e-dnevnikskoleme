// Keep the Webmail adapter and the existing e-Dnevnik login on the same
// username-to-email lookup. Escape LIKE wildcards in literal usernames.
export async function resolveLoginEmail(database:any,identifier:string):Promise<string>{
 const email=identifier.trim().toLowerCase();
 const local=email.split('@')[0].replace(/[\\%_]/g,'\\$&');
 const {data,error}=await database.from('user_profiles').select('email').ilike('email',`${local}@%`).maybeSingle();
 if(error)throw new Error('Login identifier could not be resolved.');
 return data?.email||email;
}
