import * as readFile from './read-file.js';
import * as listFiles from './list-files.js';
import * as grep from './grep.js';
import * as writeFile from './write-file.js';
import * as editFile from './edit-file.js';
import * as runCommand from './run-command.js';

const tools = {
  read_file: readFile,
  list_files: listFiles,
  grep,
  write_file: writeFile,
  edit_file: editFile,
  run_command: runCommand,
};

export const definitions = Object.values(tools).map((t) => t.definition);
export const RISKY = new Set(['write_file', 'edit_file', 'run_command']);

const MAX_RESULT_CHARS = 8_000;

export async function executeTool(name, args, cwdOrOptions = process.cwd(), options = {}) {
  const tool = tools[name];
  if (!tool) return `Error: unknown tool "${name}"`;
  const cwd = typeof cwdOrOptions === 'string' ? cwdOrOptions : process.cwd();
  const executionOptions = typeof cwdOrOptions === 'string' ? options : cwdOrOptions;
  try {
    const result = await tool.execute(args, cwd, executionOptions);
    return truncate(String(result));
  } catch (err) {
    return `Error: ${err.message}`;
  }
}

export function previewTool(name, args) {
  switch (name) {
    case 'write_file':
      return `write_file → ${args.path}\n---\n${truncate(args.content ?? '')}`;
    case 'edit_file':
      return `edit_file → ${args.path}\n--- remove ---\n${args.old_string}\n--- insert ---\n${args.new_string}`;
    case 'run_command':
      return `run_command → ${args.command}`;
    default:
      return `${name} ${JSON.stringify(args)}`;
  }
}

function truncate(text, max = MAX_RESULT_CHARS) {
  return text.length > max
    ? `${text.slice(0, max)}\n...[truncated ${text.length - max} chars]`
    : text;
}
