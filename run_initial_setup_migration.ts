const run = async () => {
    const res = await fetch(`http://localhost:3000/api/admin/run-initial-setup`, { method: 'POST' });
    console.log(await res.json());
}
run();
