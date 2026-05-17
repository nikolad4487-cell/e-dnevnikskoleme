export async function POST(req: Request) {
  return new Response(JSON.stringify({ error: "Seed API has been migrated to Vercel but needs implementation" }), {
    status: 501,
    headers: { 'Content-Type': 'application/json' },
  });
}
