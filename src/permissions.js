import { RISKY, previewTool } from './tools/index.js';

/**
 * @param {(preview: string) => Promise<string>} ask - shows the preview, returns 'y' | 'a' | 'n' (anything else = deny)
 */
export function createPermissions(ask) {
  const alwaysAllowed = new Set();
  return {
    async check(toolName, args) {
      if (!RISKY.has(toolName)) return true;
      if (alwaysAllowed.has(toolName)) return true;
      const answer = (await ask(previewTool(toolName, args))).trim().toLowerCase();
      if (answer === 'a') {
        alwaysAllowed.add(toolName);
        return true;
      }
      return answer === 'y';
    },
  };
}
