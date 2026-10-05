// Contrat : seules les huit teintes `assistant-1` … `assistant-8` sont autorisées. La
// base stocke l'identifiant (« assistant-3 »), jamais un code hexadécimal : une couleur
// libre casserait le contraste garanti et la distinction en deutéranopie.
//
// La palette est PARTAGÉE avec les bénéficiaires : `assistant-N` nomme une TEINTE, pas un
// rôle. C'est la POSITION qui dit de qui il s'agit — rail gauche pour l'aidant, rail droit
// pour le bénéficiaire — jamais la teinte, qui ne peut donc pas porter deux significations.

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

/** Motif de refus d'une couleur de bénéficiaire ; `null` quand la valeur est acceptable. */
export type BeneficiaryColorProblem = 'invalid'

/**
 * Contrôle d'une couleur de bénéficiaire, qui est FACULTATIVE.
 *
 * Même forme que `checkTagNames` (`app/utils/tags.ts`) et `checkTimeRange`
 * (`app/utils/grid.ts`) : une règle PURE, appelée une seule fois — à l'écriture — et testée
 * sans base. Le message affiché vit dans le service, jamais ici.
 *
 * « Rien » est une réponse valide : `null`, `undefined` et la chaîne vide veulent tous dire
 * « aucune couleur », donc « aucun marquage ». Toute autre valeur doit être l'une des huit
 * teintes — une couleur libre casserait le contraste garanti.
 */
export function checkBeneficiaryColor(value: unknown): BeneficiaryColorProblem | null {
  if (value === null || value === undefined || value === '') return null
  return isAssistantColor(value) ? null : 'invalid'
}

/** Couleur normalisée : la teinte connue, ou `null` pour « rien ». À appeler après le contrôle. */
export function normalizeBeneficiaryColor(value: unknown): AssistantColor | null {
  return isAssistantColor(value) ? value : null
}

/** Référence CSS d'une teinte : `var(--color-assistant-3)`. Un seul endroit qui l'écrit. */
export function colorVariable(color: AssistantColor): string {
  return `var(--color-${color})`
}

/**
 * Style du rail DROIT d'une carte : `{}` quand le bénéficiaire n'a pas de couleur.
 *
 * C'est ce vide qui porte la règle « sans couleur, aucun marquage » : la carte ne pose alors
 * aucune variable, et le CSS laisse la bordure transparente. Rendre un repli gris inventerait
 * un marquage que personne n'a demandé.
 */
export function beneficiaryRailStyle(color: AssistantColor | null): Record<string, string> {
  return color ? { '--creneau-couleur-beneficiaire': colorVariable(color) } : {}
}
