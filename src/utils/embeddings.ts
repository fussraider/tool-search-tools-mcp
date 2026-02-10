import {type FeatureExtractionPipeline, pipeline} from '@xenova/transformers';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import {logger} from './logger.js';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CACHE_DIR = process.env.MCP_CACHE_DIR || path.resolve(__dirname, '../../.cache/embeddings');
const DEFAULT_MODEL = 'Xenova/all-MiniLM-L6-v2';

export class EmbeddingService {
    private pipeline: FeatureExtractionPipeline | null = null;
    private pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;
    private modelName: string;
    private logger = logger.child('EmbeddingService');

    constructor() {
        this.modelName = process.env.MCP_EMBEDDING_MODEL || DEFAULT_MODEL;
    }

    private async getPipeline(): Promise<FeatureExtractionPipeline> {
        if (this.pipeline) return this.pipeline;

        if (!this.pipelinePromise) {
            this.pipelinePromise = (async () => {
                try {
                    this.logger.info(`Loading embedding model: ${this.modelName}`);
                    const p = await pipeline('feature-extraction', this.modelName);
                    this.logger.debug(`Embedding model ${this.modelName} loaded successfully`);
                    this.pipeline = p;
                    return p;
                } catch (error) {
                    this.pipelinePromise = null;
                    throw error;
                }
            })();
        }
        return this.pipelinePromise;
    }

    async generateEmbedding(text: string): Promise<Float32Array> {
        this.logger.debug(`Generating embedding for text: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
        const extractor = await this.getPipeline();
        const output = await extractor(text, {pooling: 'mean', normalize: true});
        const result = output.data as Float32Array;
        this.logger.debug(`Generated embedding of length ${result.length}`);
        return result;
    }

    async getCachedEmbeddings(serverHash: string): Promise<Record<string, Float32Array> | null> {
        const cachePath = path.join(CACHE_DIR, `${serverHash}.json`);
        this.logger.debug(`Checking cache for server hash: ${serverHash}`);
        try {
            const data = await fs.readFile(cachePath, 'utf-8');
            const embeddings = JSON.parse(data);
            // Преобразуем обычные массивы из JSON обратно в Float32Array
            const typedEmbeddings: Record<string, Float32Array> = {};
            for (const [key, value] of Object.entries(embeddings)) {
                typedEmbeddings[key] = new Float32Array(value as number[]);
            }
            this.logger.debug(`Cache hit for ${serverHash}: found ${Object.keys(typedEmbeddings).length} tools`);
            return typedEmbeddings;
        } catch (error) {
            this.logger.debug(`Cache miss for ${serverHash}`);
            return null;
        }
    }

    async saveEmbeddingsToCache(serverHash: string, embeddings: Record<string, Float32Array | number[]>) {
        let fileHandle;
        try {
            await fs.mkdir(CACHE_DIR, {recursive: true});
            const cachePath = path.join(CACHE_DIR, `${serverHash}.json`);
            this.logger.debug(`Saving ${Object.keys(embeddings).length} embeddings to cache: ${cachePath}`);

            fileHandle = await fs.open(cachePath, 'w');
            await fileHandle.write('{');

            const keys = Object.keys(embeddings);
            const chunks: string[] = [];
            let currentChunkSize = 0;
            const BUFFER_SIZE = 1024 * 1024; // 1MB

            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                const value = embeddings[key];
                // Преобразуем Float32Array в обычные массивы перед сериализацией
                const arrayValue = Array.from(value);

                const entry = `${JSON.stringify(key)}:${JSON.stringify(arrayValue)}`;
                chunks.push(entry);
                currentChunkSize += entry.length;

                if (currentChunkSize >= BUFFER_SIZE) {
                    await fileHandle.write(chunks.join(','));
                    chunks.length = 0;
                    currentChunkSize = 0;

                    if (i < keys.length - 1) {
                        await fileHandle.write(',');
                    }
                }
            }

            if (chunks.length > 0) {
                await fileHandle.write(chunks.join(','));
            }

            await fileHandle.write('}');
        } catch (error) {
            this.logger.error(`Failed to save embeddings cache: ${error}`);
        } finally {
            if (fileHandle) {
                await fileHandle.close();
            }
        }
    }

    async cleanupUnusedCache(activeHashes: Set<string>) {
        try {
            const files = await fs.readdir(CACHE_DIR);
            const cleanupPromises = files
                .filter(file => file.endsWith('.json'))
                .filter(file => !activeHashes.has(path.basename(file, '.json')))
                .map(async file => {
                    const filePath = path.join(CACHE_DIR, file);
                    this.logger.info(`Deleting unused cache file: ${file}`);
                    await fs.unlink(filePath);
                });

            await Promise.all(cleanupPromises);
        } catch (error) {
            // Ignore error if directory doesn't exist
            if ((error as any).code !== 'ENOENT') {
                this.logger.error(`Failed to cleanup cache: ${error}`);
            }
        }
    }

    static calculateMemoryUsage(embeddings: Record<string, Float32Array | number[]>): number {
        let totalBytes = 0;
        for (const [key, vector] of Object.entries(embeddings)) {
            // String key (approx 2 bytes per char) + Object/Array overhead
            totalBytes += key.length * 2;
            if (vector instanceof Float32Array) {
                totalBytes += vector.byteLength;
            } else {
                totalBytes += vector.length * 8; // 8 bytes per number (double)
            }
        }
        return totalBytes;
    }

    static formatBytes(bytes: number): string {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    static generateServerHash(serverName: string, config: any): string {
        const configStr = JSON.stringify({serverName, config});
        return crypto.createHash('sha256').update(configStr).digest('hex');
    }
}

export const embeddingService = new EmbeddingService();
