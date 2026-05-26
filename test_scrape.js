async function test() {
    try {
        const url = 'https://www.gucci.com/pl/en_gb/pr/women/ready-to-wear-for-women/skirts-for-women/printed-silk-midi-skirt-p-865115ZAVJR7313';
        console.log(`Starting scrape for ${url}...`);
        const startRes = await fetch('http://localhost:3001/api/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        const startData = await startRes.json();
        const taskId = startData.taskId;
        console.log(`Task ID: ${taskId}`);

        const checkStatus = async () => {
            const statusRes = await fetch(`http://localhost:3001/api/tasks/${taskId}`);
            const task = await statusRes.data || await statusRes.json();
            console.log(`Status: ${task.status}, Results: ${task.results.length}`);
            if (task.status === 'COMPLETED' || task.status === 'FAILED') {
                console.log('Final Task Data:', JSON.stringify(task, null, 2));
                return;
            }
            setTimeout(checkStatus, 2000);
        };

        checkStatus();
    } catch (e) {
        console.error('Test failed:', e.message);
    }
}

test();
