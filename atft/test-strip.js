// Run with `node test-strip.js` (Node 22+).
import assert from 'node:assert/strict'
import {
  assembleCode,
  stripRegionMarkers,
  extractRegion,
  learnerImmunizationFile,
  learnerStepsFile,
  canonicalAnswers,
} from './src/lessons.ts'

const model = assembleCode(learnerImmunizationFile.segments, canonicalAnswers)
const steps = assembleCode(learnerStepsFile.segments, canonicalAnswers)
const marker = /^[ \t]*\/\/ (?:end)?region:[\w-]+/m

for (const code of [model, steps]) {
  assert.match(code, marker, 'canonical templates contain internal mapping markers')
  assert.doesNotMatch(stripRegionMarkers(code), marker, 'displayed code hides internal markers')
}

const patientClass = extractRegion(model, 'patientReference')
assert.ok(patientClass, 'patient reference region exists')
assert.match(patientClass, /public sealed class PatientReference\n\{\n    \[JsonPropertyName\("reference"\)\]/)
assert.doesNotMatch(patientClass, marker)
assert.match(extractRegion(steps, 'given-body') ?? '', /Reference = patientReference/)
assert.doesNotMatch(extractRegion(steps, 'given-body') ?? '', marker)

console.log('Region stripping and extraction assertions passed')
