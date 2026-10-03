// Statuts d'un créneau. Le code et la base sont en ANGLAIS ; les libellés affichés sont
// en français.
//
// Le tableau est la SOURCE du type, comme `ASSISTANT_COLORS` l'est pour `AssistantColor` :
// un statut ajouté ici sans libellé ni tonalité casse le typecheck, au lieu de produire un
// badge vide au premier affichage — une panne que ni le build ni les tests ne verraient.

/** Valeurs stockées en base, dans l'ordre du cycle de vie d'un passage. */
export const STATUSES = ['planned', 'completed', 'to_validate', 'cancelled'] as const

export type Status = (typeof STATUSES)[number]

/**
 * `satisfies` plutôt qu'une annotation : les valeurs restent des littéraux, donc
 * assignables à la prop `tone` du badge, tout en exigeant que chaque statut soit couvert.
 */
export const STATUS_LABELS = {
  planned: 'Planifié',
  completed: 'Réalisé',
  to_validate: 'À vérifier',
  cancelled: 'Annulé',
} as const satisfies Record<Status, string>

/** Le badge porte le STATUT ; le rail porte l'AIDANT — jamais deux fois la même information. */
export const STATUS_TONES = {
  planned: 'primary',
  completed: 'success',
  to_validate: 'warning',
  cancelled: 'danger',
} as const satisfies Record<Status, string>

/**
 * Transitions offertes en ACTION RAPIDE, depuis la carte.
 *
 * `completed` et `cancelled` sont des états FINAUX : en sortir demande la modale, où l'on
 * voit ce que l'on change. Partout ailleurs, les deux seules transitions utiles sont
 * « le passage a eu lieu » (ou « il n'a pas eu lieu, en fait ») et « on l'annule ».
 *
 * Cette table est la seule source de la règle : le serveur refuse une transition qui n'y est
 * pas, l'interface n'affiche que celles qui y sont, et un test verrouille les deux.
 */
export const QUICK_TRANSITIONS = {
  planned: ['completed', 'cancelled'],
  to_validate: ['planned', 'cancelled'],
  completed: [],
  cancelled: [],
} as const satisfies Record<Status, readonly Status[]>

/** Statuts atteignables en action rapide depuis `status` ; liste vide = état final. */
export function quickTransitions(status: Status): readonly Status[] {
  return QUICK_TRANSITIONS[status]
}

/**
 * Libellé d'un bouton d'action rapide, écrit du point de vue de l'utilisateur : ce que le
 * clic VA faire, pas le nom du statut visé (« Remettre en planifié », et non « Planifié »).
 */
export const QUICK_ACTION_LABELS = {
  planned: 'Remettre en planifié',
  completed: 'Marquer comme réalisé',
  to_validate: 'Marquer à vérifier',
  cancelled: 'Annuler le créneau',
} as const satisfies Record<Status, string>

export function isStatus(value: unknown): value is Status {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value)
}
