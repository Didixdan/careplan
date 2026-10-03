#!/usr/bin/env node
/**
 * Mesure la densité de commentaires du code.
 *
 * Un ratio élevé n'est pas un défaut en soi : un commentaire qui explique un
 * contournement d'outil vaut mieux que dix qui paraphrasent le code. Cet outil
 * sert à repérer les fichiers où le commentaire a pris le dessus, pas à imposer
 * un seuil.
 *
 * Usage : node scripts/comment-report.mjs
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()

/** Dossiers ignorés : artefacts de build et dépendances. */
const IGNORED_DIRS = new Set(['node_modules', '.nuxt', '.output', '.git', 'dist'])

/** Extensions analysées, avec le préfixe de commentaire qui les concerne. */
const EXTENSIONS = ['.ts', '.vue', '.scss', '.mjs', '.sh', '.yml', '.yaml']

/**
 * Un `.vue` mélange template, script et style : les commentaires HTML `<!-- -->`
 * comptent aussi. On les détecte donc en plus des préfixes de ligne.
 */
function isComment(line, extension) {
  const t = line.trim()
  if (t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) return true
  if (extension === '.vue' && t.startsWith('<!--')) return true
  return false
}

function walk(directory, results = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue
    const full = join(directory, entry.name)
    if (entry.isDirectory()) {
      walk(full, results)
    }
    else if (EXTENSIONS.some(ext => entry.name.endsWith(ext))) {
      results.push(full)
    }
  }
  return results
}

function main() {
  const files = walk(ROOT)
  const lines = []

  for (const file of files) {
    const extension = EXTENSIONS.find(ext => file.endsWith(ext)) ?? ''
    const content = readFileSync(file, 'utf8').split('\n')
    const meaningful = content.filter(l => l.trim().length > 0)
    const comments = meaningful.filter(l => isComment(l, extension))
    if (comments.length === 0) continue

    lines.push({
      path: relative(ROOT, file),
      comments: comments.length,
      total: meaningful.length,
      percentage: Math.round((100 * comments.length) / Math.max(meaningful.length, 1)),
    })
  }

  lines.sort((a, b) => b.percentage - a.percentage || b.comments - a.comments)

  console.log('\n  Densité de commentaires\n')
  for (const l of lines) {
    console.log(`  ${String(l.percentage).padStart(3)}%  ${String(l.comments).padStart(4)} / ${String(l.total).padStart(4)}  ${l.path}`)
  }

  const totalComments = lines.reduce((s, l) => s + l.comments, 0)
  const totalLines = lines.reduce((s, l) => s + l.total, 0)
  const average = Math.round((100 * totalComments) / Math.max(totalLines, 1))

  console.log(`\n  TOTAL : ${totalComments} commentaires sur ${totalLines} lignes (${average}%)`)
  console.log(`  Fichiers concernés : ${lines.length}\n`)
}

main()
