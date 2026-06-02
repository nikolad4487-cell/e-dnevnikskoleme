const run = async () => {
    const res = await fetch(`http://localhost:3000/api/admin/run-thesis-migration2`, { method: 'POST' });
    console.log(await res.json());
}
run();
