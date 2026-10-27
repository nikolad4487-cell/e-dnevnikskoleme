export async function dossierFetch(input:RequestInfo|URL,init?:RequestInit):Promise<Response>{
 const response=await window.fetch(input,init);
 if(!response.ok){const data=await response.clone().json().catch(()=>null);throw new Error(data?.error||'Evidenciju nije moguće učitati ili spremiti. Pokušajte ponovno.');}
 return response;
}
