import type { Appointment } from '~~/shared/types/planning'
import type { CivilDate } from './date'
import { longDate } from './date'
import { durationInMinutes, formatDuration } from './duration'
import { tagLine } from './tags'

/**
 * Message hebdomadaire d'un bénéficiaire, prêt à coller dans un SMS, un mail ou une
 * messagerie. Texte pur : pas de tableau, pas de mise en forme — des caractères qui passent
 * partout, et qui se lisent sur un téléphone.
 *
 * Il ne liste que les passages NON annulés : annoncer une visite annulée serait pire que de
 * ne rien annoncer. Un passage qui franchit minuit est signalé « (lendemain) », sinon une
 * veille « 22:00 – 01:00 » ressemble à une erreur de saisie.
 */
const GREETING = 'Bonjour,'

/**
 * Une ligne par passage, prête à envoyer.
 *
 * Les tags remplacent l'ancien intitulé, à la même place : c'est ce qui dit à la famille ce
 * qu'on vient faire. Le séparateur interne est celui de `tagLine` (« , »), pour ne pas se
 * confondre avec le « · » qui sépare les champs.
 */
function passageLine(appointment: Appointment): string {
  const nextDay = appointment.end <= appointment.start ? ' (lendemain)' : ''
  return `• ${longDate(appointment.date)} · ${appointment.start} – ${appointment.end}${nextDay}`
    + ` · ${tagLine(appointment.tags.map(tag => tag.name))} (${firstName(appointment.primaryAssistant)})`
}

/** Prénom seul : la famille connaît son aidant, et le message se lit plus vite. */
function firstName(fullName: string): string {
  return fullName.trim().split(' ')[0] || fullName
}

/**
 * Renvoie le message, ou une chaîne vide quand la semaine ne contient aucun passage :
 * un message vide ne doit pas être envoyé, c'est à l'appelant de ne rien afficher.
 */
export function beneficiaryWeekMessage(input: {
  beneficiaryName: string
  dates: CivilDate[]
  appointments: Appointment[]
}): string {
  const passages = input.appointments
    .filter(appointment => appointment.status !== 'cancelled')
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))

  if (passages.length === 0) return ''

  const minutes = passages.reduce((total, appointment) => {
    return total + (durationInMinutes(appointment.start, appointment.end) ?? 0)
  }, 0)

  const start = input.dates[0]
  const end = input.dates[input.dates.length - 1]

  return [
    GREETING,
    '',
    `🗓️ Planning de la semaine du ${start ? longDate(start) : '?'} au ${end ? longDate(end) : '?'}`,
    input.beneficiaryName,
    '',
    ...passages.map(passageLine),
    '',
    `⏱️ Total de la semaine : ${formatDuration(minutes)}`,
  ].join('\n')
}
