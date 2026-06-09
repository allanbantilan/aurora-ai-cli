import { inspectProject } from '../project-inspection.js';

export const definition = {
  type: 'function',
  function: {
    name: 'inspect_project',
    description: 'Detect the confirmed project stack and major areas. Use when: starting work that depends on framework or project structure. Prefer this tool over guessing from paths or shell inspection. Example: inspect the current project before Laravel-specific edits.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {},
      required: [],
    },
  },
};

export function execute(_args = {}, cwd = process.cwd()) {
  const project = inspectProject(cwd);
  const lines = [
    `Project type: ${project.isLaravel ? 'Laravel' : 'Generic'}`,
    `PHP: ${project.php ?? '(not detected)'}`,
    `Laravel: ${project.laravel ?? '(not detected)'}`,
    `Vue: ${project.vue ?? '(not detected)'}`,
    `Inertia: ${project.inertia ?? '(not detected)'}`,
    `Pinia: ${project.pinia ?? '(not detected)'}`,
    `Vite: ${project.vite ?? '(not detected)'}`,
    `Pest: ${project.pest ?? '(not detected)'}`,
    `PHPUnit: ${project.phpunit ?? '(not detected)'}`,
    `Existing areas: ${project.areas.length ? project.areas.join(', ') : '(none detected)'}`,
  ];
  return lines.join('\n');
}
