import { RISKY } from './tools/index.js';

/**
 * @param {(toolName: string, args: object) => Promise<{choice: 'yes'|'always'|'no', feedback?: string}>} ask
 * The asker renders its own preview from (toolName, args).
 * check() resolves to {allowed: boolean, feedback?: string}.
 */
export function createPermissions(ask) {
  const alwaysAllowed = new Set();
  return {
    async check(toolName, args) {
      if (!RISKY.has(toolName)) return { allowed: true };
      if (alwaysAllowed.has(toolName)) return { allowed: true };
      const answer = (await ask(toolName, args)) ?? {};
      if (answer.choice === 'always') {
        alwaysAllowed.add(toolName);
        return { allowed: true };
      }
      if (answer.choice === 'yes') return { allowed: true };
      return { allowed: false, ...(answer.feedback ? { feedback: answer.feedback } : {}) };
    },
  };
}
