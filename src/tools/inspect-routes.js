import fs from 'node:fs';
import path from 'node:path';

export const definition = {
  type: 'function',
  function: {
    name: 'inspect_routes',
    description: 'Parse routes/web.php and routes/api.php to show registered routes. Use when: checking what routes exist, verifying route registration, or debugging routing issues.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        file: {
          type: 'string',
          description: 'Route file to inspect (default: routes/web.php)',
        },
      },
      required: [],
    },
  },
};

export function execute(args = {}, cwd = process.cwd()) {
  const file = args.file || 'routes/web.php';
  const filePath = path.resolve(cwd, file);

  if (!fs.existsSync(filePath)) {
    return `Error: ${file} not found`;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const routes = parseRoutes(content, file);

  if (routes.length === 0) {
    return `No routes found in ${file}`;
  }

  const lines = [`Routes in ${file}:`, ''];
  for (const route of routes) {
    const method = route.method.padEnd(8);
    const uri = route.uri.padEnd(40);
    const name = route.name ? `  [${route.name}]` : '';
    const middleware = route.middleware ? `  (${route.middleware})` : '';
    lines.push(`  ${method} ${uri}${name}${middleware}`);
  }

  lines.push('');
  lines.push(`Total: ${routes.length} route(s)`);
  return lines.join('\n');
}

function parseRoutes(content, file) {
  const routes = [];
  const lines = content.split('\n');
  let currentMiddleware = '';

  for (const line of lines) {
    const trimmed = line.trim();

    // Match Route::get, Route::post, etc.
    const routeMatch = trimmed.match(/Route::(get|post|put|patch|delete|any|match)\(\s*['"]([^'"]+)['"]/);
    if (routeMatch) {
      const method = routeMatch[1].toUpperCase();
      const uri = routeMatch[2];
      const name = extractName(trimmed);
      const middleware = currentMiddleware || extractMiddleware(trimmed);
      routes.push({ method, uri, name, middleware });
      continue;
    }

    // Match Route::resource
    const resourceMatch = trimmed.match(/Route::resource\(\s*['"]([^'"]+)['"]/);
    if (resourceMatch) {
      const baseUri = resourceMatch[1];
      const name = extractName(trimmed);
      const methods = ['index', 'create', 'store', 'show', 'edit', 'update', 'destroy'];
      for (const method of methods) {
        const httpMethod = method === 'store' ? 'POST' : method === 'destroy' ? 'DELETE' : method === 'update' ? 'PUT' : 'GET';
        const uri = method === 'index' || method === 'create' || method === 'store'
          ? `/${baseUri}`
          : `/${baseUri}/{${baseUri.slice(0, -1)}}`;
        routes.push({ method: httpMethod, uri, name: name ? `${name}.${method}` : '', middleware: currentMiddleware });
      }
      continue;
    }

    // Match Route::middleware
    const middlewareMatch = trimmed.match(/Route::middleware\(\s*['"]([^'"]+)['"]/);
    if (middlewareMatch) {
      currentMiddleware = middlewareMatch[1];
      continue;
    }

    // Reset middleware on group close
    if (trimmed === '});') {
      currentMiddleware = '';
    }
  }

  return routes;
}

function extractName(line) {
  const match = line.match(/->name\(\s*['"]([^'"]+)['"]/);
  return match ? match[1] : '';
}

function extractMiddleware(line) {
  const match = line.match(/->middleware\(\s*['"]([^'"]+)['"]/);
  return match ? match[1] : '';
}
