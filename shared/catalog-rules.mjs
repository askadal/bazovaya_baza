export const categoryAliases = {
  'Рукоход': 'Рукоходы',
  'Рукоход-змеевик': 'Рукоходы',
  'Рукоход-молоток': 'Рукоходы',
  'Наклонная скамья': 'Скамьи для упражнений',
  'Ограждения': 'Ограждение, болларды',
  'Ограждение': 'Ограждение, болларды'
};
export function canonicalCategory(value) { return categoryAliases[value] || value; }
export function ratingHearts(value = 50) { return Math.max(0, Math.min(5, Math.floor(Number(value) - 50) || 0)); }
