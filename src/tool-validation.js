function typeMatches(type, value) {
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'array') return Array.isArray(value);
  return typeof value === type;
}

export function validateToolArguments(schema = {}, args) {
  if (!typeMatches('object', args)) return ['arguments must be an object'];
  const errors = [];
  const properties = schema.properties ?? {};
  for (const name of schema.required ?? []) {
    if (!Object.hasOwn(args, name)) errors.push(`missing required property "${name}"`);
  }
  for (const [name, value] of Object.entries(args)) {
    const property = properties[name];
    if (!property) {
      if (schema.additionalProperties === false) errors.push(`unexpected property "${name}"`);
      continue;
    }
    if (property.type && !typeMatches(property.type, value)) {
      errors.push(`property "${name}" must be ${property.type === 'integer' ? 'an integer' : `a ${property.type}`}`);
      continue;
    }
    if (property.enum && !property.enum.includes(value)) {
      errors.push(`property "${name}" must be one of: ${property.enum.join(', ')}`);
    }
  }
  return errors;
}
