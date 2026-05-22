import { exec, execFile } from "child_process"
import { logger } from "../observability/logger.js"
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export const initIndexingCobase = async (repoPath: string) => {
    try {
        const { stdout, stderr } = await execFileAsync(
            'npx @colbymchenry/codegraph',
            ['init'],
            {
                cwd: repoPath, // folder codebase cần index
                timeout: 120_000,
            },
        );

        if (stdout) logger.info(stdout);
        if (stderr) logger.warn(stderr);

        return true;
    } catch (error: unknown) {
        if (error instanceof Error) {
            logger.error(error?.message)
        } else {
            logger.error("error index graph codebase")
        }
    }
    return false;
}