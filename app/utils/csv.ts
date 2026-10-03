// Sérialisation CSV des exports. Trois décisions, toutes dictées par Excel en français —
// le tableur est la cible, pas un lecteur de CSV générique :
//
// - **BOM UTF-8** en tête : sans lui, Excel lit le fichier en ANSI et affiche « Ã‰lise » ;
// - **point-virgule** comme séparateur : avec la virgule, Excel empile tout dans une colonne ;
// - **CRLF** : le format qu'attendent Excel et les outils Windows.
//
// Un champ qui contient un point-virgule, un guillemet ou un saut de ligne est mis entre
// guillemets, guillemets internes doublés. Sans cela, un intitulé du type « Courses ; retour »
// couperait la ligne en deux : le fichier s'ouvrirait, et serait faux.

const SEPARATOR = ';'
const BOM = '\uFEFF'
const NEWLINE = '\r\n'

export type CsvValue = string | number | null | undefined

function cell(value: CsvValue): string {
  const text = value === null || value === undefined ? '' : String(value)
  const needsQuotes = text.includes(SEPARATOR)
    || text.includes('"')
    || text.includes('\n')
    || text.includes('\r')

  return needsQuotes ? `"${text.replaceAll('"', '""')}"` : text
}

/** Tableau de lignes → texte CSV complet, BOM et fin de ligne compris. */
export function toCsv(rows: CsvValue[][]): string {
  return BOM + rows.map(row => row.map(cell).join(SEPARATOR)).join(NEWLINE) + NEWLINE
}
