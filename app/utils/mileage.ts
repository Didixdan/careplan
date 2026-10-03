/**
 * Kilomètres déclarés par un aidant, pour une journée.
 *
 * Un flottant, parce que c'est ce qu'affiche un compteur — mais **arrondi à deux décimales à
 * l'écriture et à l'affichage**. Une somme de flottants dérive : 12,1 + 12,2 vaut
 * 24,299999999999997. Sur des kilomètres, personne ne le remarque à l'œil, et le total part
 * faux dans un export. L'arrondi est donc la règle, et un test la porte.
 *
 * Aucun montant n'est calculé ici, ni ailleurs : c'est un relevé, pas une paie.
 */

/** Au-delà, c'est une faute de frappe (une journée de route ne fait pas 1000 km). */
const MAX_KILOMETERS = 1000

/**
 * La valeur est-elle plausible ? La règle vit ici, et le serveur l'applique AUSSI : une borne
 * qui n'existerait que dans le formulaire se contourne avec un `curl`, et une faute de frappe
 * finirait dans le récapitulatif du mois.
 */
export function isPlausibleKilometers(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= MAX_KILOMETERS
}

/** Deux décimales : la seule protection contre la dérive du flottant. */
export function roundKilometers(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Lit une saisie en kilomètres. Accepte la virgule française et le point.
 * Rend `null` sur tout ce qui n'est pas un nombre plausible — c'est à l'appelant de le dire.
 */
export function kilometersFromInput(input: string): number | null {
  const text = input.trim().replace(',', '.')
  if (text === '') return null

  const value = Number(text)
  if (!isPlausibleKilometers(value)) return null

  return roundKilometers(value)
}

/** « 12,5 » — virgule décimale, sans zéro inutile. Chaîne vide si la valeur manque. */
export function formatKilometers(kilometers: number | null | undefined): string {
  if (kilometers === null || kilometers === undefined || !Number.isFinite(kilometers)) return ''

  return String(roundKilometers(kilometers)).replace('.', ',')
}

/** Somme arrondie : additionner des flottants sans arrondir finit par dériver. */
export function sumKilometers(values: number[]): number {
  return roundKilometers(values.reduce((total, value) => total + value, 0))
}
