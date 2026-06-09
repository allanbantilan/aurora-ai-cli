import { RISKY } from './tools/index.js';
import { normalizeMode } from './modes.js';

/**
 * @param {(toolName: string, args: object) => Promise<{choice: 'yes'|'always'|'no', feedback?: string}>} ask
 * The asker renders its own preview from (toolName, args).
 * check() resolves to {allowed: boolean, feedback?: string}.
 */
const FILE_TOOLS = new Set(['write_file', 'edit_file']);

export function createPermissions(ask, getMode = () => 'permission') {
  let allowAllSession = false; // "allow for this session" stops all later prompts this session
  const allowedPaths = new Set(); // an "allow once" on a file covers later writes to that same file
  return {
    async check(toolName, args) {
      if (!RISKY.has(toolName)) return { allowed: true };
      const mode = normalizeMode(getMode());
      if (mode === 'auto') return { allowed: true };
      if (mode === 'plan') {
        return {
          allowed: false,
          feedback: 'Plan mode is read-only. Switch to Permission or Auto mode before implementation.',
        };
      }
      if (allowAllSession) return { allowed: true };
      const filePath = FILE_TOOLS.has(toolName) && typeof args?.path === 'string' ? args.path : null;
      if (filePath && allowedPaths.has(filePath)) return { allowed: true };
      const answer = (await ask(toolName, args)) ?? {};
      if (answer.choice === 'always') {
        allowAllSession = true;
        return { allowed: true };
      }
      if (answer.choice === 'yes') {
        if (filePath) allowedPaths.add(filePath);
        return { allowed: true };
      }
      return { allowed: false, ...(answer.feedback ? { feedback: answer.feedback } : {}) };
    },
  };
}
