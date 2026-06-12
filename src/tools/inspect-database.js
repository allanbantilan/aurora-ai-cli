import fs from 'node:fs';
import path from 'node:path';

export const definition = {
  type: 'function',
  function: {
    name: 'inspect_database',
    description: 'Read migration files to show database schema. Use when: checking table structure, verifying migrations, or understanding data model.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        table: {
          type: 'string',
          description: 'Specific table to inspect (optional, shows all if not specified)',
        },
      },
      required: [],
    },
  },
};

export function execute(args = {}, cwd = process.cwd()) {
  const migrationDir = path.join(cwd, 'database', 'migrations');

  if (!fs.existsSync(migrationDir)) {
    return 'Error: database/migrations directory not found';
  }

  const files = fs.readdirSync(migrationDir)
    .filter((f) => f.endsWith('.php'))
    .sort();

  if (files.length === 0) {
    return 'No migration files found';
  }

  const tables = parseMigrations(migrationDir, files);
  const targetTable = args.table?.toLowerCase();

  const lines = ['Database Schema:', ''];

  for (const [tableName, columns] of Object.entries(tables)) {
    if (targetTable && !tableName.includes(targetTable)) continue;

    lines.push(`Table: ${tableName}`);
    lines.push('─'.repeat(40));

    for (const col of columns) {
      const nullable = col.nullable ? ' (nullable)' : '';
      const defaultVal = col.default ? ` default: ${col.default}` : '';
      const foreign = col.foreign ? ` → ${col.foreign}` : '';
      const primary = col.primary ? ' [PK]' : '';
      const indexed = col.indexed ? ' [INDEX]' : '';
      lines.push(`  ${col.name.padEnd(25)} ${col.type}${primary}${indexed}${nullable}${defaultVal}${foreign}`);
    }
    lines.push('');
  }

  const tableCount = Object.keys(tables).length;
  const filteredCount = targetTable ? Object.keys(tables).filter((t) => t.includes(targetTable)).length : tableCount;
  lines.push(`Total: ${filteredCount} table(s)`);
  return lines.join('\n');
}

function parseMigrations(dir, files) {
  const tables = {};

  for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), 'utf8');

    // Match Schema::create or Schema::table
    const createMatch = content.match(/Schema::create\(\s*['"](\w+)['"]/);
    const tableMatch = content.match(/Schema::table\(\s*['"](\w+)['"]/);
    const tableName = createMatch?.[1] || tableMatch?.[1];

    if (!tableName) continue;

    if (!tables[tableName]) tables[tableName] = [];

    // Parse column definitions
    const columns = parseColumns(content);
    tables[tableName].push(...columns);
  }

  return tables;
}

function parseColumns(content) {
  const columns = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Match $table->type('name')
    const colMatch = trimmed.match(/\$table->(\w+)\(\s*['"](\w+)['"]/);
    if (colMatch) {
      const type = colMatch[1];
      const name = colMatch[2];
      const column = { name, type, nullable: false, default: null, foreign: null, primary: false, indexed: false };

      // Check modifiers
      if (trimmed.includes('->nullable()')) column.nullable = true;
      if (trimmed.includes('->primary()')) column.primary = true;
      if (trimmed.includes('->index()')) column.indexed = true;

      const defaultMatch = trimmed.match(/->default\(\s*['"]?([^'")]+)['"]?\s*\)/);
      if (defaultMatch) column.default = defaultMatch[1];

      const foreignMatch = trimmed.match(/->constrained\(\s*['"]?(\w+)['"]?\s*\)/);
      if (foreignMatch) column.foreign = foreignMatch[1];

      columns.push(column);
      continue;
    }

    // Match $table->id()
    if (trimmed.match(/\$table->id\(\)/)) {
      columns.push({ name: 'id', type: 'bigIncrements', nullable: false, default: null, foreign: null, primary: true, indexed: false });
      continue;
    }

    // Match $table->timestamps()
    if (trimmed.match(/\$table->timestamps\(\)/)) {
      columns.push({ name: 'created_at', type: 'timestamp', nullable: false, default: null, foreign: null, primary: false, indexed: false });
      columns.push({ name: 'updated_at', type: 'timestamp', nullable: false, default: null, foreign: null, primary: false, indexed: false });
      continue;
    }

    // Match $table->softDeletes()
    if (trimmed.match(/\$table->softDeletes\(\)/)) {
      columns.push({ name: 'deleted_at', type: 'timestamp', nullable: true, default: null, foreign: null, primary: false, indexed: false });
    }
  }

  return columns;
}
