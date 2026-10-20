import {supabase} from './supabase';
// Existing application API calls share the authenticated session. Never send it off-origin.
export function installApiSessionFetch(){
 const original=window.fetch.bind(window);
 window.fetch=async(input,init)=>{
  const raw=typeof input==='string'?input:input instanceof URL?input.href:input.url;
  const url=new URL(raw,window.location.href);
  if(url.origin!==window.location.origin||!url.pathname.startsWith('/api/')||url.pathname==='/api/auth/login')return original(input,init);
  const headers=new Headers(init?.headers||(input instanceof Request?input.headers:undefined));
  if(!headers.has('Authorization')){const {data}=await supabase.auth.getSession();if(data.session)headers.set('Authorization',`Bearer ${data.session.access_token}`);}
  return original(input,{...init,headers});
 };
}
