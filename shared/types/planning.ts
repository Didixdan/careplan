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
  title: string
  status: Status
  beneficiary: string
  /** Identifiant du bénéficiaire, pour présélectionner le sélecteur d'édition. */
  beneficiaryId: string
  primaryAssistant: string
  /** Identifiant de l'aidant principal, pour la détection de conflit au déplacement. */
  primaryAssistantId: string
  color: AssistantColor
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

/** Listes de référence de l'écran de création d'un créneau (`GET /api/appointments/options`). */
export interface AppointmentFormOptions {
  beneficiaries: PersonOption[]
  assistants: PersonOption[]
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
  /** Absente pour un co-assistant : le DTO ne porte que la couleur de l'aidant principal. */
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
