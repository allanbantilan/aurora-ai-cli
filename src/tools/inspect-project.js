import { inspectProject } from '../project-inspection.js';

export const definition = {
  type: 'function',
  function: {
    name: 'inspect_project',
    description: 'Detect the project stack and summarize confirmed Laravel, PHP, Vue, and canonical project areas.',
    parameters: {
      type: 'object',
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
