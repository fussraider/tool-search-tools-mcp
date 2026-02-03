import { EmbeddingService, CACHE_DIR } from '../src/utils/embeddings.js';
import fs from 'fs/promises';
import path from 'path';

// Mock logger to avoid clutter
process.env.LOG_LEVEL = 'ERROR';

const SERVICE_HASH = 'benchmark_test';
const NUM_EMBEDDINGS = 10000; // Increased to make the blocking more obvious
const DIMENSIONS = 384;

async function runBenchmark() {
    console.log(`Preparing ${NUM_EMBEDDINGS} embeddings of dimension ${DIMENSIONS}...`);
    const embeddings: Record<string, Float32Array> = {};
    for (let i = 0; i < NUM_EMBEDDINGS; i++) {
        const vector = new Float32Array(DIMENSIONS);
        for (let j = 0; j < DIMENSIONS; j++) {
            vector[j] = Math.random();
        }
        embeddings[`key_${i}`] = vector;
    }

    const service = new EmbeddingService();

    // Measure event loop responsiveness
    // We schedule a timer every 10ms. If the event loop is blocked, the count of executions will be lower than expected.
    let ticks = 0;
    const intervalId = setInterval(() => {
        ticks++;
    }, 10);

    const start = Date.now();
    console.log('Starting saveEmbeddingsToCache...');
    await service.saveEmbeddingsToCache(SERVICE_HASH, embeddings);
    const duration = Date.now() - start;

    clearInterval(intervalId);

    const expectedTicks = duration / 10;
    const responsiveness = expectedTicks > 0 ? (ticks / expectedTicks) * 100 : 100;

    console.log(`Total duration: ${duration}ms`);
    console.log(`Event loop ticks: ${ticks}`);
    console.log(`Expected ticks (approx): ${expectedTicks.toFixed(0)}`);
    console.log(`Responsiveness: ${responsiveness.toFixed(2)}% (Lower means more blocking)`);

    // Verify JSON validity
    const cachePath = path.join(CACHE_DIR, `${SERVICE_HASH}.json`);
    try {
        const content = await fs.readFile(cachePath, 'utf-8');
        const parsed = JSON.parse(content);
        if (Object.keys(parsed).length !== NUM_EMBEDDINGS) {
            console.error('ERROR: Saved JSON has incorrect number of keys!');
        } else {
            console.log('SUCCESS: Saved JSON is valid and complete.');
        }
    } catch (e) {
        console.error('ERROR: Failed to parse saved JSON:', e);
    }

    // Cleanup
    try {
        await fs.unlink(cachePath);
    } catch (e) {}
}

runBenchmark().catch(console.error);
