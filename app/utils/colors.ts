// Contrat : seules les huit teintes `assistant-1` … `assistant-8` sont autorisées. La
// base stocke l'identifiant (« assistant-3 »), jamais un code hexadécimal : une couleur
// libre casserait le contraste garanti et la distinction en deutéranopie.

/** Identifiants valides, dans l'ordre d'attribution. */
export const ASSISTANT_COLORS = [
  'assistant-1',
  'assistant-2',
  'assistant-3',
  'assistant-4',
  'assistant-5',
  'assistant-6',
  'assistant-7',
  'assistant-8',
] as const

export type AssistantColor = (typeof ASSISTANT_COLORS)[number]

/**
 * Libellés affichables. La couleur n'est jamais le seul porteur d'information : le nom
 * de l'aidant est toujours écrit à côté.
 */
export const ASSISTANT_COLOR_LABELS: Record<AssistantColor, string> = {
  'assistant-1': 'Rouge sourd',
  'assistant-2': 'Ocre',
  'assistant-3': 'Olive',
  'assistant-4': 'Sarcelle',
  'assistant-5': 'Bleu ardoise',
  'assistant-6': 'Indigo',
  'assistant-7': 'Prune',
  'assistant-8': 'Vieux rose',
}

export function isAssistantColor(value: unknown): value is AssistantColor {
  return typeof value === 'string' && (ASSISTANT_COLORS as readonly string[]).includes(value)
}

/**
 * Couleur par défaut, déterministe : un même nom retombe toujours sur la même teinte,
 * y compris après rechargement.
 */
export function defaultAssistantColor(lastName: string): AssistantColor {
  let hash = 0
  for (let i = 0; i < lastName.length; i += 1) {
    hash = (hash * 31 + lastName.charCodeAt(i)) % 100000
  }
  return ASSISTANT_COLORS[hash % ASSISTANT_COLORS.length] as AssistantColor
}
