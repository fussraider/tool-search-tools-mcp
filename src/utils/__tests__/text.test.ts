import {describe, expect, it} from 'vitest';
import {extractKeywords, normalizeText, tokenize} from '../text.js';

describe('text utilities', () => {
    describe('normalizeText', () => {
        it('should lowercase text', () => {
            expect(normalizeText('Hello World')).toBe('hello world');
        });

        it('should remove special characters but keep cyrillic', () => {
            expect(normalizeText('Hello, Мир! #2026')).toBe('hello мир 2026');
        });

        it('should collapse multiple spaces', () => {
            expect(normalizeText('  hello    world  ')).toBe('hello world');
        });
    });

    describe('tokenize', () => {
        it('should split text into words', () => {
            expect(tokenize('hello world')).toEqual(['hello', 'world']);
        });

        it('should filter short words by default', () => {
            expect(tokenize('a quick brown fox')).toEqual(['quick', 'brown']);
        });

        it('should use custom minLength', () => {
            expect(tokenize('a quick brown fox', 2)).toEqual(['quick', 'brown', 'fox']);
        });
    });

    describe('extractKeywords', () => {
        it('should extract keywords from name and description', () => {
            const keywords = extractKeywords('read_file', 'Reads a file from the disk');
            expect(keywords).toContain('read_file');
            expect(keywords).toContain('read');
            expect(keywords).toContain('file');
            expect(keywords).toContain('reads');
            expect(keywords).toContain('disk');
        });

        it('should handle name with dashes', () => {
            const keywords = extractKeywords('my-tool');
            expect(keywords).toContain('my-tool');
            expect(keywords).toContain('my');
            expect(keywords).toContain('tool');
        });

        it('should return unique keywords', () => {
            const keywords = extractKeywords('read_read', 'read');
            const counts = keywords.filter(k => k === 'read').length;
            expect(counts).toBe(1);
        });
    });
});
