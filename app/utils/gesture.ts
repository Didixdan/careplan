// Gestes de pointage.
//
// Un créneau partage le même `pointerdown` pour deux intentions : le DÉPLACER ou OUVRIR sa
// fiche. C'est le seuil qui les sépare, et rien d'autre. La règle est ici, pure et testée,
// plutôt qu'enfouie dans la gestion des événements du composable.

/** Distance, en pixels, au-delà de laquelle un appui devient un glisser. */
const DRAG_THRESHOLD_PX = 6

/**
 * L'appui est-il devenu un DÉPLACEMENT ? En deçà du seuil, c'est un tap : il sélectionne le
 * créneau au lieu de le déplacer. Sans cette distinction, aucune fiche ne pourrait
 * s'ouvrir, puisque `pointerdown` part au moindre contact.
 *
 * 6 px absorbent le tremblement d'un doigt posé, et restent très en deçà des 24 px d'un
 * créneau d'un quart d'heure.
 *
 * Le seuil est appliqué par AXE, et non en distance euclidienne : un doigt qui tremble
 * bouge des deux côtés à la fois, et une diagonale de 4 px sur chaque axe ne doit pas
 * compter comme un déplacement.
 */
export function isDragGesture(
  origin: { x: number, y: number },
  current: { x: number, y: number },
  threshold: number = DRAG_THRESHOLD_PX,
): boolean {
  return Math.abs(current.x - origin.x) > threshold || Math.abs(current.y - origin.y) > threshold
}
