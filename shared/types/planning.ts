// Types du domaine. La base est en ANGLAIS (valeurs incluses) ; les identifiants et les
// fichiers de l'application sont en anglais, seuls les libellés affichés sont en français
// (AGENTS.md §1). Dates civiles 'YYYY-MM-DD' et heures 'HH:MM', jamais un `Date` (fuseau).
// Couleur en identifiant, jamais en hexadécimal.

import type { AssistantColor } from '~~/app/utils/colors'
import type { Status } from '~~/app/utils/status'

// Le type `Status` est DÉRIVÉ du tableau des valeurs dans `app/utils/status.ts`, où vivent
// aussi les libellés et les tonalités de badge : un statut ajouté sans libellé casse alors
// le typecheck, au lieu de produire un badge vide.
export type { Status }

export type Role = 'admin' | 'assistant' | 'viewer'

/** DTO de lecture renvoyé par l'API, dénormalisé pour l'affichage. */
export interface Appointment {
  id: string
  date: string
  start: string
  end: string
  /**
   * Tags du créneau, DANS L'ORDRE d'ajout. Le premier intitulé libre a disparu : un créneau
   * se décrit par son bénéficiaire (le titre affiché) et par ce vocabulaire partagé.
   */
  tags: TagOption[]
  status: Status
  beneficiary: string
  /** Identifiant du bénéficiaire, pour présélectionner le sélecteur d'édition. */
  beneficiaryId: string
  primaryAssistant: string
  /** Identifiant de l'aidant principal, pour la détection de conflit au déplacement. */
  primaryAssistantId: string
  /**
   * Couleur de l'AIDANT principal : rail gauche de la carte, et remplissage de la barre de
   * durée sur les cartes de liste. Le nom dit le rôle, pas la palette — deux couleurs vivent
   * désormais sur le même DTO.
   */
  assistantColor: AssistantColor
  /** Couleur du BÉNÉFICIAIRE : rail droit de la carte. `null` = aucun marquage. */
  beneficiaryColor: AssistantColor | null
  coAssistants: string[]
  /** Identifiants des co-assistants, pour la détection de conflit au déplacement. */
  coAssistantIds: string[]
}

/**
 * Kilomètres déclarés par un aidant pour une journée (`GET /api/mileage?date=…`).
 * Le nom de l'aidant voyage avec l'entrée : l'écran n'a ainsi aucune liste à charger en plus.
 */
export interface MileageEntry {
  date: string
  assistantId: string
  assistantName: string
  kilometers: number
}

/** Aidant (profil + compte de connexion lié). */
export interface Assistant {
  id: string
  firstName: string
  lastName: string
  color: AssistantColor
  contractedHours: number | null
  email: string
}

/** Bénéficiaire. */
export interface Beneficiary {
  id: string
  firstName: string
  lastName: string
  address: string | null
  hourlyRateCents: number | null
  authorizedMinutesMonth: number | null
  /**
   * Couleur FACULTATIVE, choisie par l'admin : une teinte de la palette partagée, ou `null`.
   * Elle ne sert qu'à lire le calendrier plus vite — jamais à porter une information seule,
   * puisque le nom du bénéficiaire est toujours écrit à côté du rail.
   */
  color: AssistantColor | null
}

/**
 * Option d'un sélecteur : identifiant technique et libellé affichable, rien de plus. Les
 * listes de l'écran de création ne transportent ni adresse, ni taux horaire, ni volume
 * d'heures autorisé.
 */
export interface PersonOption {
  id: string
  name: string
}

/**
 * Tag du vocabulaire partagé : identifiant technique et libellé affichable. Les écrans
 * d'écriture ne manipulent que le NOM (`tags: string[]`) : le serveur résout ou crée le tag.
 */
export interface TagOption {
  id: string
  name: string
}

/** Tag du catalogue avec son usage — écran de gestion (`GET /api/tags`). */
export interface Tag extends TagOption {
  /** Nombre de créneaux qui le portent : c'est lui qui explique un refus de suppression. */
  usageCount: number
}

/** Listes de référence de l'écran de création d'un créneau (`GET /api/appointments/options`). */
export interface AppointmentFormOptions {
  beneficiaries: PersonOption[]
  assistants: PersonOption[]
  /** Catalogue complet : l'autocomplete filtre côté client, sans requête par frappe. */
  tags: TagOption[]
}

/**
 * Un créneau ANNULÉ de la semaine source. Il sera recopié en « Planifié », donc l'écran le
 * signale avant l'écriture : une annulation peut être exceptionnelle (demande d'une famille)
 * et ne pas se reproduire la semaine suivante.
 *
 * Non exporté : il ne se lit qu'à travers l'aperçu, qui le porte.
 */
interface CopyWeekCancelled {
  date: string
  start: string
  end: string
  beneficiary: string
}

/**
 * Ce que la copie FERA, lu AVANT d'écrire (`GET /api/appointments/copy`). L'écran n'a ainsi
 * aucun compte à deviner : les nombres affichés sont ceux du serveur, donc ceux qui seront
 * réellement copiés et supprimés.
 */
export interface CopyWeekPreview {
  /** Lundi de la semaine source. */
  sourceWeek: string
  /** Lundi de la semaine cible. */
  targetWeek: string
  /** Créneaux de la source dans le périmètre de copie. `0` = rien à copier. */
  sourceCount: number
  /** Créneaux déjà présents dans la cible, DANS LE PÉRIMÈTRE DE REMPLACEMENT. */
  targetCount: number
  /** Annulés de la source, dans l'ordre du calendrier. */
  cancelled: CopyWeekCancelled[]
}

/** Corps de `POST /api/appointments/copy`. Les deux dates désignent leur semaine. */
export interface CopyWeekRequest {
  source: string
  target: string
  /**
   * `true` = l'utilisateur a confirmé que la semaine cible sera remplacée. Sans ce drapeau,
   * le serveur refuse (409) une cible non vide : un écran périmé ne supprime rien tout seul.
   */
  replace?: boolean
}

/** Résultat de la copie : ce qui a été écrit, et ce qui a été supprimé pour l'écrire. */
export interface CopyWeekResult {
  copied: number
  deleted: number
}

/**
 * Cumuls d'heures d'un récapitulatif. Seul le RÉALISÉ (`completed`) se déclare ; « à
 * vérifier » (`to_validate`) a son propre cumul, hors total ; le prévisionnel (`planned`) est
 * affiché à part ; `cancelled` ne compte nulle part — la règle vit dans `app/utils/summary.ts`.
 */
export interface SummaryTotals {
  declaredMinutes: number
  /** Minutes à vérifier (`to_validate`) : durée ou réalité incertaine, donc hors déclaration. */
  toValidateMinutes: number
  plannedMinutes: number
  passages: number
  /** Passages à vérifier — jamais inclus dans `passages`. */
  toValidatePassages: number
}

/** Cumul d'une personne, aidant ou bénéficiaire. */
export interface PersonSummary extends SummaryTotals {
  id: string
  name: string
  /**
   * Couleur de la PERSONNE dont la ligne porte le cumul : celle de l'aidant sur une ligne
   * d'aidant, celle du bénéficiaire sur une ligne de bénéficiaire. Absente pour un co-assistant :
   * le DTO ne transporte la couleur que du participant principal, jamais celle d'un co-aidant.
   */
  color?: AssistantColor
}

/** Ligne du récapitulatif : le cumul, plus la référence contractuelle quand elle existe. */
export interface SummaryLine extends PersonSummary {
  /**
   * Référence à laquelle comparer : heures **hebdomadaires** du contrat pour un aidant,
   * heures **autorisées dans le mois** pour un bénéficiaire. `null` = aucune référence
   * saisie, auquel cas aucun ratio n'est affiché.
   */
  referenceMinutes: number | null
  /**
   * Heures DÉCLARÉES qui consomment le volume autorisé de ce bénéficiaire. Présent uniquement
   * quand la ligne n'est pas complète : un aidant ne voit que ses propres passages, alors que
   * le volume autorisé appartient au bénéficiaire. Sans ce nombre, son « Reste » serait faux
   * dès qu'un collègue travaille chez la même personne.
   *
   * Absent pour l'admin et pour la famille, dont la ligne EST le total : c'est alors
   * `declaredMinutes` qui consomme le volume.
   */
  referenceDeclaredMinutes?: number
  /** Idem, en prévisionnel : tout ce qui n'est pas annulé, tous aidants confondus. */
  referenceForecastMinutes?: number
  /**
   * Taux horaire du bénéficiaire, en centimes. `null` = pas encore saisi ; **absent** = non
   * communiqué à ce rôle (l'écran ne doit donc pas écrire « À saisir » à sa place).
   *
   * Rempli **uniquement sur les lignes de bénéficiaire**, pour qui a l'usage d'un montant :
   * l'admin, qui paie, et **l'aidant concerné** — c'est le taux qui compose sa rémunération,
   * il le lit déjà dans son export CESU. Un lecteur (bénéficiaire ou famille) ne le reçoit pas.
   */
  hourlyRateCents?: number | null
  /**
   * Kilomètres déclarés dans le mois. Rempli **uniquement pour les aidants** : un kilomètre
   * ne s'attribue à aucun bénéficiaire, c'est le principe même de la déclaration journalière.
   * Absent sur les lignes de bénéficiaire, et sur les aidants qui n'ont rien déclaré.
   */
  travelKilometers?: number
}

/** Cumul d'une journée du mois. La date est celle du DÉBUT du créneau. */
export interface DaySummary extends SummaryTotals {
  date: string
}

/**
 * Réponse de `GET /api/appointments/summary?month=YYYY-MM` : le mois est une chaîne civile,
 * comme partout ailleurs. Les lignes sont filtrées par rôle à la source (voir
 * `listAppointments`), donc un aidant ne reçoit que ses heures et une famille que les siennes.
 */
export interface MonthSummary {
  month: string
  totals: SummaryTotals
  byAssistant: SummaryLine[]
  byBeneficiary: SummaryLine[]
  byDay: DaySummary[]
}

/**
 * Cumul d'un couple aidant × bénéficiaire, AVANT le taux : c'est la maille d'un montant, car un
 * aidant peut travailler chez deux bénéficiaires à deux taux différents. Produit par
 * `summariseByPair` (`app/utils/summary.ts`).
 *
 * Les deux couleurs voyagent avec le cumul, comme dans `PersonSummary` : la ligne parle d'une
 * personne, elle porte « sa » couleur. Celle d'un co-aidant reste absente — le DTO ne transporte
 * jamais la couleur d'un co-aidant.
 */
export interface PairSummary extends SummaryTotals {
  assistantId: string
  assistantName: string
  assistantColor?: AssistantColor
  beneficiaryId: string
  beneficiaryName: string
  /** Couleur du bénéficiaire : celle du rail de la ligne. Absente = aucun marquage. */
  beneficiaryColor?: AssistantColor
}

/**
 * Ligne de revenu : le cumul d'un couple, plus son taux et ses montants.
 *
 * `hourlyRateCents` **absent** veut dire « non communiqué à ce rôle » (un lecteur ne reçoit pas
 * le coût employeur) ; `null` veut dire « pas encore saisi ». L'écran ne doit donc jamais écrire
 * « À saisir » à la place d'un montant qu'il n'a pas le droit de montrer.
 */
export interface WeekIncomeLine extends PairSummary {
  /** Heures prévisionnelles du couple : réalisé + à vérifier + prévu, annulés exclus. */
  minutes: number
  hourlyRateCents?: number | null
  /** Montant prévisionnel, en centimes. `null` dès qu'un taux manque. */
  amountCents: number | null
  /** Montant réalisé (`completed`), en centimes. `null` dès qu'un taux manque. */
  declaredAmountCents: number | null
}

/** Agrégat de revenus : `null` dès qu'un total serait partiel. */
export interface IncomeTotals {
  amountCents: number | null
  declaredAmountCents: number | null
  /** Lignes dont le taux n'est pas saisi — explique un montant absent, sans le justifier. */
  missingRateCount: number
}

/** Les revenus d'UN aidant sur la semaine : ses lignes par bénéficiaire, et son sous-total. */
export interface IncomeGroup {
  assistantId: string
  assistantName: string
  assistantColor?: AssistantColor
  lines: WeekIncomeLine[]
  minutes: number
  declaredMinutes: number
  /** Sous-total de l'aidant : `null` dès qu'une de ses lignes manque un taux. */
  amountCents: number | null
  declaredAmountCents: number | null
  missingRateCount: number
}

/** Kilomètres déclarés par un aidant sur une semaine. */
export interface MileageSummary {
  assistantId: string
  assistantName: string
  kilometers: number
}

/**
 * Réponse de `GET /api/appointments/summary?week=YYYY-MM-DD` : le tableau de bord hebdomadaire.
 * Le paramètre accepte n'importe quel jour de la semaine ; `week` porte le **lundi résolu**.
 *
 * Comme pour le mois, les lignes viennent du serveur : l'écran met en forme, il ne recompte pas.
 */
export interface WeekSummary {
  week: string
  /** Les sept dates civiles de la semaine, du lundi au dimanche. */
  dates: string[]
  totals: SummaryTotals
  byDay: DaySummary[]
  byPair: WeekIncomeLine[]
  income: IncomeTotals
  /** Vide pour un lecteur : les kilomètres appartiennent aux aidants. */
  mileage: MileageSummary[]
}
