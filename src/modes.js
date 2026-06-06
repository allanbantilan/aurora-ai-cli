export const DEFAULT_MODE = 'permission';
export const MODES = ['permission', 'auto', 'plan'];

const LABELS = {
  permission: 'Default',
  auto: 'Auto',
  plan: 'Plan',
};

export function normalizeMode(mode) {
  return MODES.includes(mode) ? mode : DEFAULT_MODE;
}

export function modeLabel(mode) {
  return LABELS[normalizeMode(mode)];
}
