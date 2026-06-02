import dotenv from 'dotenv';
dotenv.config();

const run = async () => {
    try {
        const res = await fetch(`http://localhost:3000/api/admin/run-test-classes`, { method: 'POST' });
        console.log(await res.json());
    } catch(e) {
        console.log(e);
    }
}
run();
