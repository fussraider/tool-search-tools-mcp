import fs from 'fs';
import path from 'path';

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
}

const LogEmoji: Record<LogLevel, string> = {
    [LogLevel.DEBUG]: '🟪',
    [LogLevel.INFO]: '🟦',
    [LogLevel.WARN]: '🟧',
    [LogLevel.ERROR]: '🟥',
};

export class Logger {
    private level: LogLevel = LogLevel.INFO;
    private scope?: string;
    private logFilePath?: string;
    private logStream?: fs.WriteStream;
    private showTimestamp: boolean = false;

    constructor(scope?: string) {
        this.scope = scope;
        const envLevel = process.env.LOG_LEVEL?.toUpperCase();
        if (envLevel && envLevel in LogLevel) {
            this.level = LogLevel[envLevel as keyof typeof LogLevel];
        }

        const envShowTimestamp = process.env.LOG_SHOW_TIMESTAMP?.toLowerCase();
        this.showTimestamp = envShowTimestamp === 'true' || envShowTimestamp === '1' || envShowTimestamp === 'yes';

        this.logFilePath = process.env.LOG_FILE_PATH;
        if (this.logFilePath) {
            try {
                const logDir = path.dirname(this.logFilePath);
                if (!fs.existsSync(logDir)) {
                    fs.mkdirSync(logDir, {recursive: true});
                }
                this.logStream = fs.createWriteStream(this.logFilePath, {flags: 'a'});
            } catch (error) {
                process.stderr.write(`Failed to create log stream for ${this.logFilePath}: ${error}\n`);
            }
        }
    }

    public isDebugEnabled(): boolean {
        return this.level <= LogLevel.DEBUG;
    }

    public child(scope: string): Logger {
        const child = new Logger(scope);
        child.level = this.level;
        child.showTimestamp = this.showTimestamp;
        // Передаем тот же поток дочернему логгеру, если он есть
        if (this.logStream) {
            child.logStream = this.logStream;
        }
        return child;
    }

    private formatMessage(level: LogLevel, message: string, ...args: any[]): string {
        const timestampPart = this.showTimestamp ? ` [${new Date().toISOString()}]` : '';
        const emoji = LogEmoji[level] || '';
        const scopePart = this.scope ? ` [${this.scope}]` : '';

        const formattedArgs = args.length > 0 ? ' ' + args.map(arg => {
            if (arg instanceof Error) {
                return arg.stack || arg.message;
            }
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg, null, 2);
                } catch (e) {
                    return '[Unserializable Object]';
                }
            }
            return String(arg);
        }).join(' ') : '';

        return `${emoji}${timestampPart} [${LogLevel[level]}]${scopePart} ${message}${formattedArgs}\n`;
    }

    private write(level: LogLevel, message: string, ...args: any[]) {
        if (level >= this.level) {
            const formatted = this.formatMessage(level, message, ...args);
            if (this.logStream) {
                this.logStream.write(formatted);
            } else {
                process.stderr.write(formatted);
            }
        }
    }

    debug(message: string, ...args: any[]) {
        this.write(LogLevel.DEBUG, message, ...args);
    }

    info(message: string, ...args: any[]) {
        this.write(LogLevel.INFO, message, ...args);
    }

    warn(message: string, ...args: any[]) {
        this.write(LogLevel.WARN, message, ...args);
    }

    error(message: string, ...args: any[]) {
        this.write(LogLevel.ERROR, message, ...args);
    }
}

export const logger = new Logger();
