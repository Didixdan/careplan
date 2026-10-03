// Montants en centimes. Le modèle stocke des ENTIERS de centimes (`hourly_rate_cents`) :
// jamais de flottant pour de l'argent, donc jamais d'arrondi qui se promène.

/** Centimes → « 38,75 » (virgule décimale, sans symbole). `null` → chaîne vide. */
export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return ''
  return (Math.round(cents) / 100).toFixed(2).replace('.', ',')
}

/** Centimes → « 38,75 € », pour l'affichage à l'écran. */
export function formatEuros(cents: number | null | undefined): string {
  const value = formatCents(cents)
  return value === '' ? '' : `${value} €`
}

/** Euros saisis (nombre à virgule ou point) → centimes entiers ; `null` si négatif ou vide. */
export function centsFromEuros(euros: number | null | undefined): number | null {
  if (euros === null || euros === undefined || !Number.isFinite(euros) || euros <= 0) return null
  return Math.round(euros * 100)
}

/**
 * Montant d'une durée à un taux horaire, arrondi au centime.
 * `null` dès qu'une des deux données manque : on n'invente pas un prix.
 */
export function amountCents(minutes: number | null, hourlyRateCents: number | null): number | null {
  if (minutes === null || hourlyRateCents === null) return null
  if (!Number.isFinite(minutes) || !Number.isFinite(hourlyRateCents)) return null
  return Math.round((minutes / 60) * hourlyRateCents)
}

/** Heures décimales d'une durée : 150 min → « 2,50 ». */
export function formatHoursDecimal(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return ''
  return (Math.round(minutes) / 60).toFixed(2).replace('.', ',')
}
