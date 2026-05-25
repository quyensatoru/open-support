import { z } from 'zod';

export const CodeRepoReferenceSchema = z.object({
    name: z.string().trim().min(1).optional(),
    url: z.string().trim().min(1),
    branch: z.string().trim().min(1).optional(),
});

export const CodeRepoSchema = CodeRepoReferenceSchema.extend({
    name: z.string().trim().min(1),
    localPath: z.string().trim().min(1),
    safeUrl: z.string().trim().min(1),
});

export const CodeCloneInputSchema = z.object({
    app: z.string().trim().min(1),
    repos: z.array(CodeRepoReferenceSchema).optional(),
    repoName: z.string().trim().min(1).optional(),
    repoNames: z.array(z.string().trim().min(1)).optional(),
    workspace: z.string().trim().min(1).optional(),
});

export const CodeCloneResultSchema = z.object({
    ok: z.boolean(),
    app: z.string(),
    workspacePath: z.string(),
    repos: z.array(CodeRepoSchema),
    cloned: z.array(z.string()),
    pulled: z.array(z.string()),
    skipped: z.array(z.string()),
    warnings: z.array(z.string()),
});

export const CodeSearchPlanSchema = z.object({
    ok: z.boolean(),
    issue: z.string(),
    fileGlobs: z.array(z.string()).min(1),
    fileRegexes: z.array(z.string()),
    contentRegexes: z.array(z.string()).min(1),
    contextHints: z.array(z.string()),
    wantsFix: z.boolean(),
    rationale: z.string(),
});

export const CodeGrepMatchSchema = z.object({
    repo: z.string(),
    filePath: z.string(),
    absolutePath: z.string(),
    line: z.number().int().positive(),
    column: z.number().int().positive().optional(),
    pattern: z.string(),
    preview: z.string(),
});

export const CodeGrepResultSchema = z.object({
    ok: z.boolean(),
    workspacePath: z.string(),
    searchedFiles: z.number().int().nonnegative(),
    matches: z.array(CodeGrepMatchSchema),
    warnings: z.array(z.string()),
});

export const CodeContextSnippetSchema = z.object({
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    content: z.string(),
});

export const CodeContextFileSchema = z.object({
    repo: z.string(),
    filePath: z.string(),
    absolutePath: z.string(),
    snippets: z.array(CodeContextSnippetSchema),
});

export const CodeContextResultSchema = z.object({
    ok: z.boolean(),
    files: z.array(CodeContextFileSchema),
    warnings: z.array(z.string()),
});

export const CodeInsightResultSchema = z.object({
    ok: z.boolean(),
    summary: z.string(),
    likelyFiles: z.array(z.string()),
    findings: z.array(z.string()),
    suggestedFix: z.string().optional(),
    confidence: z.enum(['low', 'medium', 'high']),
});

export const CodeGraphInputSchema = z.object({
    app: z.string().trim().min(1),
    issue: z.string().trim().min(1),
    mode: z.enum(['search', 'fix']).default('search'),
    repos: z.array(CodeRepoReferenceSchema).optional(),
    repoName: z.string().trim().min(1).optional(),
    repoNames: z.array(z.string().trim().min(1)).optional(),
    workspace: z.string().trim().min(1).optional(),
    threadId: z.string().trim().min(1).optional(),
    maxMatches: z.number().int().positive().max(500).optional(),
});

export const CodeGraphOutputSchema = z.object({
    app: z.string(),
    issue: z.string(),
    mode: z.enum(['search', 'fix']),
    summary: z.string(),
    clone: CodeCloneResultSchema.optional(),
    thinking: CodeSearchPlanSchema.optional(),
    grep: CodeGrepResultSchema.optional(),
    context: CodeContextResultSchema.optional(),
    insight: CodeInsightResultSchema.optional(),
    errors: z.array(z.string()),
});

export type CodeRepoReference = z.infer<typeof CodeRepoReferenceSchema>;
export type CodeRepo = z.infer<typeof CodeRepoSchema>;
export type CodeCloneInput = z.infer<typeof CodeCloneInputSchema>;
export type CodeCloneResult = z.infer<typeof CodeCloneResultSchema>;
export type CodeSearchPlan = z.infer<typeof CodeSearchPlanSchema>;
export type CodeGrepMatch = z.infer<typeof CodeGrepMatchSchema>;
export type CodeGrepResult = z.infer<typeof CodeGrepResultSchema>;
export type CodeContextSnippet = z.infer<typeof CodeContextSnippetSchema>;
export type CodeContextFile = z.infer<typeof CodeContextFileSchema>;
export type CodeContextResult = z.infer<typeof CodeContextResultSchema>;
export type CodeInsightResult = z.infer<typeof CodeInsightResultSchema>;
export type CodeGraphInput = z.infer<typeof CodeGraphInputSchema>;
export type CodeGraphOutput = z.infer<typeof CodeGraphOutputSchema>;

export type CodeRepoInterrupt = {
    reason: 'repo_not_found';
    app: string;
    question: string;
    expected: {
        repoName: string;
    };
};

export type CodeRepoResume = {
    repoName?: string;
    repoNames?: string[];
};

export type CodeGraphRunCompleted = {
    status: 'completed';
    threadId: string;
    output: CodeGraphOutput;
};

export type CodeGraphRunInterrupted = {
    status: 'interrupted';
    threadId: string;
    interrupts: Array<{
        id?: string;
        value?: CodeRepoInterrupt | unknown;
    }>;
};

export type CodeGraphRunResult = CodeGraphRunCompleted | CodeGraphRunInterrupted;
