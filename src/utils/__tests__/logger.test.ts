import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger, LogLevel } from '../logger.js';
import fs from 'fs';
import path from 'path';

describe('Logger', () => {
    let stderrSpy: any;

    beforeEach(() => {
        stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        vi.stubEnv('LOG_LEVEL', 'INFO');
        vi.stubEnv('LOG_FILE_PATH', '');
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    it('should log messages with correct level', () => {
        const logger = new Logger('test');
        logger.info('info message');
        expect(stderrSpy).toHaveBeenCalled();
        const output = stderrSpy.mock.calls[0][0];
        expect(output).toContain('[INFO]');
        expect(output).toContain('[test]');
        expect(output).toContain('info message');
    });

    it('should not log messages below current level', () => {
        const logger = new Logger();
        // Level is INFO by default
        logger.debug('debug message');
        expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('should respect LOG_LEVEL environment variable', () => {
        vi.stubEnv('LOG_LEVEL', 'DEBUG');
        const logger = new Logger();
        logger.debug('debug message');
        expect(stderrSpy).toHaveBeenCalled();
    });

    it('should format objects correctly', () => {
        const logger = new Logger();
        const obj = { key: 'value' };
        logger.info('object:', obj);
        const output = stderrSpy.mock.calls[0][0];
        expect(output).toContain('{\n  "key": "value"\n}');
    });

    it('should format errors correctly', () => {
        const logger = new Logger();
        const error = new Error('test error');
        logger.error('occurred:', error);
        const output = stderrSpy.mock.calls[0][0];
        expect(output).toContain('test error');
        expect(output).toContain('Error: test error');
    });

    it('should create child logger with same level and scope', () => {
        const logger = new Logger('parent');
        const child = logger.child('child');
        child.info('child message');
        const output = stderrSpy.mock.calls[0][0];
        expect(output).toContain('[child]');
    });

    it('should write to file if LOG_FILE_PATH is set', () => {
        const logFile = 'test.log';
        const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => '');
        const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(false);
        const writeStreamMock = {
            write: vi.fn(),
            on: vi.fn()
        };
        const createStreamSpy = vi.spyOn(fs, 'createWriteStream').mockReturnValue(writeStreamMock as any);
        
        vi.stubEnv('LOG_FILE_PATH', logFile);
        
        const logger = new Logger('file-test');
        logger.info('test message');
        
        expect(mkdirSpy).toHaveBeenCalled();
        expect(createStreamSpy).toHaveBeenCalledWith(logFile, { flags: 'a' });
        expect(writeStreamMock.write).toHaveBeenCalled();
        expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('should handle log stream creation failure', () => {
        vi.stubEnv('LOG_FILE_PATH', '/invalid/path/log.txt');
        vi.spyOn(fs, 'createWriteStream').mockImplementation(() => {
            throw new Error('Permission denied');
        });
        
        new Logger('fail-test');
        
        expect(stderrSpy).toHaveBeenCalled();
        expect(stderrSpy.mock.calls[0][0]).toContain('Failed to create log stream');
    });

    it('should handle unserializable objects in logs', () => {
        const logger = new Logger();
        const circular: any = {};
        circular.self = circular;
        
        logger.info('circular:', circular);
        
        const output = stderrSpy.mock.calls[0][0];
        expect(output).toContain('[Unserializable Object]');
    });

    describe('LOG_SHOW_TIMESTAMP', () => {
        it('should not show timestamp by default', () => {
            const logger = new Logger();
            logger.info('no timestamp');
            const output = stderrSpy.mock.calls[0][0];
            // ISO date starts with year like 202, so checking for [ followed by 2
            expect(output).not.toMatch(/\[\d{4}-\d{2}-\d{2}T/);
        });

        it('should show timestamp when LOG_SHOW_TIMESTAMP is true', () => {
            vi.stubEnv('LOG_SHOW_TIMESTAMP', 'true');
            const logger = new Logger();
            logger.info('with timestamp');
            const output = stderrSpy.mock.calls[0][0];
            expect(output).toMatch(/\[\d{4}-\d{2}-\d{2}T/);
        });

        it('should show timestamp when LOG_SHOW_TIMESTAMP is 1', () => {
            vi.stubEnv('LOG_SHOW_TIMESTAMP', '1');
            const logger = new Logger();
            logger.info('with timestamp 1');
            const output = stderrSpy.mock.calls[0][0];
            expect(output).toMatch(/\[\d{4}-\d{2}-\d{2}T/);
        });

        it('should show timestamp when LOG_SHOW_TIMESTAMP is yes', () => {
            vi.stubEnv('LOG_SHOW_TIMESTAMP', 'yes');
            const logger = new Logger();
            logger.info('with timestamp yes');
            const output = stderrSpy.mock.calls[0][0];
            expect(output).toMatch(/\[\d{4}-\d{2}-\d{2}T/);
        });

        it('should be case-insensitive for LOG_SHOW_TIMESTAMP', () => {
            vi.stubEnv('LOG_SHOW_TIMESTAMP', 'TRUE');
            const logger = new Logger();
            logger.info('with timestamp TRUE');
            const output = stderrSpy.mock.calls[0][0];
            expect(output).toMatch(/\[\d{4}-\d{2}-\d{2}T/);
        });

        it('should pass showTimestamp to child logger', () => {
            vi.stubEnv('LOG_SHOW_TIMESTAMP', 'true');
            const logger = new Logger('parent');
            const child = logger.child('child');
            child.info('child with timestamp');
            const output = stderrSpy.mock.calls[0][0];
            expect(output).toMatch(/\[\d{4}-\d{2}-\d{2}T/);
        });
    });
});
