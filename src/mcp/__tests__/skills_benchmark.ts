import { performance } from 'perf_hooks';

// Simulate resolveValue environment
const VARIABLE_REGEX = /\{\{([^}]+)\}\}/g;

function resolveValueOriginal(value: any, context: Record<string, any>): any {
    if (typeof value === 'string') {
        if (value.startsWith('{{') && value.endsWith('}}') && value.indexOf('{{', 2) === -1) {
             const key = value.slice(2, -2).trim();
             return context[key] !== undefined ? context[key] : value;
        }

        return value.replace(VARIABLE_REGEX, (_, key) => {
            const trimmedKey = key.trim();
            const val = context[trimmedKey];
            return val !== undefined ? String(val) : `{{${trimmedKey}}}`;
        });
    } else if (Array.isArray(value)) {
        return value.map(v => resolveValueOriginal(v, context));
    } else if (typeof value === 'object' && value !== null) {
        const result: Record<string, any> = {};
        for (const [k, v] of Object.entries(value)) {
            result[k] = resolveValueOriginal(v, context);
        }
        return result;
    }
    return value;
}

function resolveValueOptimized(value: any, context: Record<string, any>): any {
    if (typeof value === 'string') {
        if (value.startsWith('{{') && value.endsWith('}}') && value.indexOf('{{', 2) === -1) {
             const key = value.slice(2, -2).trim();
             return context[key] !== undefined ? context[key] : value;
        }

        return value.replace(VARIABLE_REGEX, (_, key) => {
            const trimmedKey = key.trim();
            const val = context[trimmedKey];
            return val !== undefined ? String(val) : `{{${trimmedKey}}}`;
        });
    } else if (Array.isArray(value)) {
        return value.map(v => resolveValueOptimized(v, context));
    } else if (typeof value === 'object' && value !== null) {
        const result: Record<string, any> = {};
        for (const k in value) {
            if (Object.prototype.hasOwnProperty.call(value, k)) {
                result[k] = resolveValueOptimized(value[k], context);
            }
        }
        return result;
    }
    return value;
}

const testData = {
    a: '1',
    b: '2',
    c: {
        d: '3',
        e: '{{test}}',
        f: [1, 2, { g: '{{test}}' }]
    },
    h: { i: { j: { k: '{{test}}' } } },
    // adding lots of properties
};

for (let i = 0; i < 50; i++) {
    testData[`prop_${i}`] = `val_${i}`;
}

const context = { test: 'resolved' };

// Warmup
for (let i = 0; i < 10000; i++) {
    resolveValueOriginal(testData, context);
    resolveValueOptimized(testData, context);
}

const ITERATIONS = 100000;

console.log('Running Original...');
const start1 = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
    resolveValueOriginal(testData, context);
}
const end1 = performance.now();
const originalTime = end1 - start1;
console.log(`Original: ${originalTime.toFixed(2)}ms`);

console.log('Running Optimized...');
const start2 = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
    resolveValueOptimized(testData, context);
}
const end2 = performance.now();
const optimizedTime = end2 - start2;
console.log(`Optimized: ${optimizedTime.toFixed(2)}ms`);

const improvement = ((originalTime - optimizedTime) / originalTime) * 100;
console.log(`Improvement: ${improvement.toFixed(2)}%`);
