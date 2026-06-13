async function run() {
    const res = await fetch(`http://localhost:3000/api/admin/run-pin-hash-migration`);
    console.log(await res.json());
}
run();
