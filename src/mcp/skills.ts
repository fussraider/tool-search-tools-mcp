import fs from 'fs/promises';
import yaml from 'js-yaml';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import { MCPRegistry, MCPTool } from './registry.js';
import { executeTool } from './executor.js';

const skillsLogger = logger.child('Skills');

export interface SkillStep {
    tool: string;
    server?: string; // Optional, if unique across all tools
    args: Record<string, any>;
    result_var?: string;
    description?: string;
}

export interface Skill {
    name: string;
    description: string;
    parameters: Record<string, any>; // JSON Schema compatible
    steps: SkillStep[];
}

export interface SkillsConfig {
    skills: Skill[];
}

const SkillSchema = z.object({
    name: z.string(),
    description: z.string(),
    parameters: z.record(z.any()),
    steps: z.array(z.object({
        tool: z.string(),
        server: z.string().optional(),
        args: z.record(z.any()),
        result_var: z.string().optional(),
        description: z.string().optional()
    }))
});

const SkillsConfigSchema = z.object({
    skills: z.array(SkillSchema)
});

export async function loadSkillsConfig(path: string): Promise<Skill[]> {
    skillsLogger.info(`Loading skills from ${path}`);
    try {
        const content = await fs.readFile(path, 'utf-8');
        const parsed = yaml.load(content);
        const config = SkillsConfigSchema.parse(parsed);
        skillsLogger.info(`Loaded ${config.skills.length} skills`);
        return config.skills;
    } catch (error) {
        skillsLogger.error(`Failed to load skills from ${path}:`, error);
        throw error;
    }
}

const VARIABLE_REGEX = /\{\{([^}]+)\}\}/g;

function resolveValue(value: any, context: Record<string, any>): any {
    if (typeof value === 'string') {
        // Simple regex to replace {{variable}}
        // Handles full string replacement: "{{var}}" -> value
        // And partial: "prefix {{var}} suffix" -> "prefix value suffix"
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
        return value.map(v => resolveValue(v, context));
    } else if (typeof value === 'object' && value !== null) {
        const result: Record<string, any> = {};
        for (const [k, v] of Object.entries(value)) {
            result[k] = resolveValue(v, context);
        }
        return result;
    }
    return value;
}

export async function executeSkill(skill: MCPTool, args: any, registry: MCPRegistry): Promise<any> {
    const context: Record<string, any> = { ...args };
    skillsLogger.info(`Executing skill ${skill.name} with args:`, args);

    if (!skill.steps) {
        throw new Error(`Skill ${skill.name} has no steps`);
    }

    let lastResult: any = null;

    for (const [index, step] of skill.steps.entries()) {
        skillsLogger.debug(`Step ${index + 1}: ${step.description || step.tool}`);

        // Resolve arguments
        const stepArgs = resolveValue(step.args, context);

        // Find tool
        // If server is specified, look for exact match
        // If not, look for tool with that name (warn if duplicates)
        let tool: MCPTool | undefined;
        if (step.server) {
            tool = registry.getTool(step.server, step.tool);
        } else {
            const candidates = registry.tools.filter(t => t.name === step.tool);
            if (candidates.length === 0) {
                 throw new Error(`Tool ${step.tool} not found`);
            }
            if (candidates.length > 1) {
                skillsLogger.warn(`Multiple tools found for ${step.tool}, using the first one from server ${candidates[0].server}`);
            }
            tool = candidates[0];
        }

        if (!tool) {
             throw new Error(`Tool ${step.tool} not found${step.server ? ` on server ${step.server}` : ''}`);
        }

        try {
            // Execute tool
            // We need to be careful not to create infinite loops if a skill calls another skill
            // But since executeTool handles both, it should be fine as long as there is no recursion
            const result = await executeTool(tool, stepArgs, registry);

            // Store result
            if (step.result_var) {
                // If the result is a standard MCP result (content array), we might want to extract text?
                // Or just store the whole object.
                // Usually for variables we want simple values.
                // Let's store the whole result object for now, users can access properties if we implement dot notation later.
                // But for now, let's try to extract text if it's a text result.

                let val = result;
                // Helper to extract text from standard MCP response
                if (result && typeof result === 'object' && Array.isArray(result.content)) {
                     const textContent = result.content.find((c: any) => c.type === 'text');
                     if (textContent) {
                         val = textContent.text;
                     }
                }

                context[step.result_var] = val;
            }

            lastResult = result;

        } catch (error) {
            skillsLogger.error(`Step ${index + 1} failed:`, error);
            throw error;
        }
    }

    return lastResult;
}
