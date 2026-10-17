import { test, expect } from '@playwright/test'
import { TutorialPage } from './pages/TutorialPage'
import { canonicalAnswers, lessons } from '../src/lessons'
import type { Page } from '@playwright/test'

function monitorExternalRequests(page: Page): () => void {
  const externalRequests: string[] = []
  const baseUrl = new URL(test.info().project.use.baseURL ?? 'http://localhost:4173').origin
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (/^https?:$/.test(url.protocol) && url.origin !== baseUrl) externalRequests.push(request.url())
  })
  return () => expect(externalRequests, 'No external requests during trace or walkthrough interactions').toEqual([])
}

test('happy path completes tutorial and runs simulation with no errors or external requests', async ({ page }) => {
  const tutorial = new TutorialPage(page)
  const errors: string[] = []
  const externalRequests: string[] = []
  const baseUrl = new URL(test.info().project.use.baseURL ?? 'http://localhost:4173').origin

  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))
  page.on('request', (req) => {
    const url = req.url()
    if (
      (url.startsWith('http://') || url.startsWith('https://')) &&
      !url.startsWith(baseUrl)
    ) {
      externalRequests.push(url)
    }
  })

  await test.step('Lesson 1: verify initial state and continue', async () => {
    await tutorial.goto()
    await tutorial.expectLessonVisible(1)
    await expect(tutorial.simulationLabel).toHaveText(
      'Simulation only — no code runs or API requests are sent',
    )
    await expect(tutorial.fixturePanel).toContainText('Patient/patient-001')
    await expect(tutorial.fixturePanel).toContainText('Influenza vaccine')
    await expect(tutorial.navButton(2)).toBeDisabled()
    await tutorial.continue()
  })

  await test.step('Complete lessons 2–5 with understanding checks', async () => {
    await tutorial.completeLesson(2)
    await tutorial.completeLesson(3)
    await tutorial.completeLesson(4)
    await tutorial.completeLesson(5, true)
  })

  await test.step('Run simulated test', async () => {
    await expect(tutorial.runSimulationButton).toBeEnabled()
    await tutorial.runSimulationButton.click()
    await expect(tutorial.simulationPanel).toBeVisible()
  })

  await test.step('Verify simulation tabs and results', async () => {
    await tutorial.tab('Request').click()
    await expect(tutorial.simulationTabContent).not.toContainText('"id":')

    await tutorial.tab('Response').click()
    await expect(tutorial.simulationTabContent).toContainText('"id": "imm-001"')
    await expect(tutorial.simulationTabContent).toContainText(
      'Location: https://fhir.example.test/Immunization/imm-001/_history/1',
    )

    await tutorial.tab('Step results').click()
    await expect(tutorial.passBadges).toHaveCount(4)
    await expect(tutorial.recap).toContainText('Gherkin describes setup')
    await expect(tutorial.tutorialCompleteBanner).toContainText('Tutorial complete!')
  })

  expect(errors).toEqual([])
  expect(externalRequests).toEqual([])
})

test('wrong-answer correction shows feedback and allows retry', async ({ page }) => {
  const tutorial = new TutorialPage(page)
  await tutorial.goto()
  await tutorial.continue()

  await tutorial.expectLessonVisible(2)

  // Fill one correct, one wrong, leave the rest empty
  await tutorial.fillGap('feature.given')
  await tutorial.gapInput('feature.patient').fill('WrongPatient')

  await tutorial.checkWork()

  await expect(tutorial.checkSummaryError).toBeVisible()
  // 4 gaps need correction (patient wrong, when/then/status empty)
  await expect(tutorial.feedbackItems).toHaveCount(4)

  // Focus moves to the first invalid input
  await expect(tutorial.gapInput('feature.patient')).toBeFocused()

  // Fix all gaps and recheck
  await tutorial.fillLessonGaps(2)
  await tutorial.checkWork()

  await expect(tutorial.checkSummarySuccess).toBeVisible()
  await expect(tutorial.checkSummaryError).not.toBeVisible()
})

test('understanding check wrong answer shows feedback and allows retry', async ({ page }) => {
  const tutorial = new TutorialPage(page)
  await tutorial.goto()
  await tutorial.continue()

  await tutorial.expectLessonVisible(2)
  await tutorial.fillLessonGaps(2)
  await tutorial.checkWork()
  await expect(tutorial.checkSummarySuccess).toBeVisible()

  // Select wrong answer for lesson2.binding
  await tutorial.answerQuestion('lesson2.binding', 'B')
  await tutorial.checkUnderstanding('lesson2.binding')

  const feedback = page.locator('div.question-item').filter({ hasText: 'How does Reqnroll connect' }).locator('.question-feedback')
  await expect(feedback).toBeVisible()
  await expect(feedback).toContainText('method name')
  await expect(page.locator('.sr-only')).toContainText('Not yet — try again.')

  // Select correct answer and recheck
  await tutorial.answerQuestion('lesson2.binding', 'A')
  await tutorial.checkUnderstanding('lesson2.binding')
  await expect(feedback).toContainText('Passed')
})

test('empty understanding submission asks for a choice without passing or erasing code', async ({ page }) => {
  const tutorial = new TutorialPage(page)
  await tutorial.goto()
  await tutorial.continue()
  await tutorial.fillLessonGaps(2)
  await tutorial.checkWork()
  await tutorial.checkUnderstanding('lesson2.binding')

  const question = page.locator('div.question-item:has(input[name="lesson2.binding"])')
  await expect(question.locator('.question-error')).toHaveText('Choose an answer before checking.')
  await expect(page.locator('.sr-only')).toContainText('How does Reqnroll connect this Gherkin step to a C# method? Choose an answer before checking.')
  const errorId = await question.locator('.question-error').getAttribute('id')
  expect(errorId).toBeTruthy()
  await expect(question.getByRole('group')).toHaveAttribute('aria-describedby', errorId!)
  await expect(question.getByRole('button', { name: 'Check understanding' })).toHaveAttribute('aria-describedby', errorId!)
  await tutorial.checkUnderstanding('lesson2.patient')
  const patientQuestion = page.locator('div.question-item:has(input[name="lesson2.patient"])')
  const patientErrorId = await patientQuestion.locator('.question-error').getAttribute('id')
  expect(patientErrorId).toBeTruthy()
  expect(patientErrorId).not.toBe(errorId)
  await expect(patientQuestion.getByRole('group')).toHaveAttribute('aria-describedby', patientErrorId!)
  await expect(patientQuestion.getByRole('button', { name: 'Check understanding' })).toHaveAttribute('aria-describedby', patientErrorId!)
  await expect(page.locator('.sr-only')).toContainText('Where does "Patient/patient-001" from the Given step end up in the request JSON? Choose an answer before checking.')
  await expect(question.locator('.question-feedback')).toHaveCount(0)
  await expect(tutorial.checkSummarySuccess).toContainText('All gaps are correct')
  await expect(tutorial.navButton(3)).toBeDisabled()
  await tutorial.answerQuestion('lesson2.binding', 'A')
  await expect(question.locator('.question-error')).toHaveCount(0)
  await expect(question.locator('.question-feedback')).toHaveCount(0)
  await expect(tutorial.lessonStatusBadge).toContainText('understanding pending')
})

test('correct selection alone remains unchecked after refresh', async ({ page }) => {
  const tutorial = new TutorialPage(page)
  await tutorial.goto()
  await tutorial.continue()
  await tutorial.fillLessonGaps(2)
  await tutorial.checkWork()
  await tutorial.answerQuestion('lesson2.binding', 'A')
  await tutorial.answerQuestion('lesson2.patient', 'A')
  await tutorial.reload()

  await expect(tutorial.questionChoice('lesson2.binding', 'A')).toBeChecked()
  await expect(tutorial.questionChoice('lesson2.patient', 'A')).toBeChecked()
  await expect(page.locator('.question-feedback')).toHaveCount(0)
  await expect(page.getByTestId('understanding-summary')).toContainText('Understanding 0 of 2 passed')
  await expect(tutorial.checkSummarySuccess).toContainText('All gaps are correct')
  await expect(tutorial.navButton(3)).toBeDisabled()
  await tutorial.checkUnderstanding('lesson2.binding')
  await expect(page.getByTestId('understanding-summary')).toContainText('Understanding 1 of 2 passed')
  await expect(tutorial.navButton(3)).toBeDisabled()
  await tutorial.checkUnderstanding('lesson2.patient')
  await expect(tutorial.navButton(3)).toBeEnabled()
})

test('understanding-first unlocks only after code; selecting an answer again requires resubmission', async ({ page }) => {
  const tutorial = new TutorialPage(page)
  await tutorial.goto()
  await tutorial.continue()
  await tutorial.answerQuestion('lesson2.binding', 'A')
  await tutorial.checkUnderstanding('lesson2.binding')
  await tutorial.answerQuestion('lesson2.patient', 'A')
  await tutorial.checkUnderstanding('lesson2.patient')
  await expect(tutorial.navButton(3)).toBeDisabled()
  await tutorial.fillLessonGaps(2)
  await tutorial.checkWork()
  await expect(tutorial.navButton(3)).toBeEnabled()
  await tutorial.answerQuestion('lesson2.binding', 'B')
  await expect(tutorial.lessonStatusBadge).toContainText('Needs check')
  await expect(tutorial.navButton(3)).toBeEnabled() // previously unlocked navigation remains
  await tutorial.answerQuestion('lesson2.binding', 'A')
  await expect(tutorial.lessonStatusBadge).toContainText('Needs check')
  await tutorial.checkUnderstanding('lesson2.binding')
  await expect(tutorial.lessonStatusBadge).toContainText('Complete')
  await expect(tutorial.checkSummarySuccess).toContainText('Lesson complete. Continue is available.')
  await expect(page.locator('.sr-only')).toContainText('Lesson complete. Continue is available.')
})

test('lesson 5 completion announces the simulation action in either completion order', async ({ page }) => {
  const tutorial = new TutorialPage(page)
  await tutorial.goto()
  await tutorial.continue()
  for (const number of [2, 3, 4]) await tutorial.completeLesson(number)

  await tutorial.fillLessonGaps(5)
  await tutorial.checkWork()
  await expect(page.locator('.sr-only')).toContainText('Complete the understanding checks to run simulated test.')
  await expect(tutorial.checkSummarySuccess).toContainText('Complete 1 understanding check to run simulated test.')
  await expect(tutorial.checkSummarySuccess).not.toContainText('continue')
  await expect(tutorial.runSimulationButton).toBeDisabled()
  await tutorial.answerQuestion('lesson5.assertion', 'B')
  await tutorial.checkUnderstanding('lesson5.assertion')
  await expect(page.locator('.sr-only')).toContainText('Lesson complete. Run simulated test is available.')
  await expect(tutorial.checkSummarySuccess).toContainText('Run simulated test is available.')
  await expect(tutorial.runSimulationButton).toBeEnabled()

  await tutorial.answerQuestion('lesson5.assertion', 'A')
  await tutorial.answerQuestion('lesson5.assertion', 'B')
  await tutorial.checkUnderstanding('lesson5.assertion')
  await tutorial.gapInput('response.lot').fill('wrong')
  await tutorial.fillGap('response.lot')
  await tutorial.checkWork()
  await expect(page.locator('.sr-only')).toContainText('Lesson complete. Run simulated test is available.')
  await expect(tutorial.checkSummarySuccess).toContainText('Run simulated test is available.')
  await expect(tutorial.runSimulationButton).toBeEnabled()
})

test('checking two preselected lesson 2 answers retains both passes', async ({ page }) => {
  const tutorial = new TutorialPage(page)
  await tutorial.goto()
  await tutorial.continue()
  await tutorial.fillLessonGaps(2)
  await tutorial.checkWork()
  await tutorial.answerQuestion('lesson2.binding', 'A')
  await tutorial.answerQuestion('lesson2.patient', 'A')
  await tutorial.checkUnderstanding('lesson2.binding')
  await tutorial.checkUnderstanding('lesson2.patient')
  await expect(tutorial.lessonStatusBadge).toContainText('Complete')
  await expect(tutorial.navButton(3)).toBeEnabled()
})

test('trace round-trip without mutation', async ({ page }) => {
  const assertNoExternalRequests = monitorExternalRequests(page)
  const tutorial = new TutorialPage(page)
  await tutorial.goto()
  await tutorial.continue()

  await tutorial.expectLessonVisible(2)
  await tutorial.fillGap('feature.given', 'MyGiven')

  const trigger = tutorial.traceTrigger('Trace this step: Given')
  await trigger.click()

  const panel = tutorial.tracePanel('Given: from words to request data')
  await expect(panel).toBeVisible()

  // Navigate through connections
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(panel).toContainText('Connection 2')

  // Close and reopen should reset to first connection
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(panel).not.toBeVisible()

  await trigger.click()
  await expect(panel).toContainText('Connection 1')

  // Verify the gap value was not mutated
  await expect(tutorial.gapInput('feature.given')).toHaveValue('MyGiven')
  await expect(page.locator('.lesson-workspace')).not.toContainText('// region:')
  assertNoExternalRequests()
})

test('every lesson trace preserves blank or incorrect answers and check states', async ({ page }) => {
  const assertNoExternalRequests = monitorExternalRequests(page)
  const tutorial = new TutorialPage(page)
  await tutorial.goto()
  await tutorial.continue()
  for (const [number, triggers, wrongGap] of [
    [2, ['Trace this step: Given', 'Trace this step: When', 'Trace this step: Then and And'], 'feature.patient'],
    [3, ['Trace this step: Model and JSON'], 'model.vaccine'],
    [4, ['Trace this step: Build and send request'], 'request.method'],
    [5, ['Trace this step: Verify response'], 'response.lot'],
  ] as const) {
    await tutorial.expectLessonVisible(number)
    // One wrong and at least one blank answer; a failed code check must remain failed.
    await tutorial.fillGap(wrongGap, 'IncorrectAnswer')
    await tutorial.checkWork()
    await expect(tutorial.checkSummaryError).toBeVisible()
    const before = await page.evaluate(() => localStorage.getItem('atft.iteration002.progress.v1'))
    const inputs = await page.locator('.lesson-workspace input[type="text"]').evaluateAll(
      nodes => nodes.map(node => (node as HTMLInputElement).value),
    )
    expect(inputs).toContain('')
    for (const label of triggers) {
      const trigger = tutorial.traceTrigger(label)
      await trigger.click()
      const panel = page.locator('.trace-panel')
      await expect(panel).toContainText('Correct example — your answers are unchanged')
      const next = panel.getByRole('button', { name: 'Next' })
      while (await next.isEnabled()) await next.click()
      await panel.getByRole('button', { name: 'Close' }).click()
      await expect(panel).not.toBeVisible()
      await expect(tutorial.gapInput(wrongGap)).toHaveValue('IncorrectAnswer')
      expect(await page.locator('.lesson-workspace input[type="text"]').evaluateAll(
        nodes => nodes.map(node => (node as HTMLInputElement).value),
      )).toEqual(inputs)
      await expect(tutorial.checkSummaryError).toBeVisible()
      await expect(tutorial.lessonStatusBadge).not.toContainText('Complete')
      expect(await page.evaluate(() => localStorage.getItem('atft.iteration002.progress.v1'))).toBe(before)
    }
    if (number < 5) await tutorial.completeLesson(number)
  }
  assertNoExternalRequests()
})

test('inline trace sits beside long lesson code, with the exercise still available', async ({ page }) => {
  const tutorial = new TutorialPage(page)
  await tutorial.goto()
  await tutorial.continue()
  await tutorial.completeLesson(2)
  await tutorial.completeLesson(3)
  await tutorial.completeLesson(4)
  await tutorial.traceTrigger('Trace this step: Verify response').click()
  const code = page.locator('.lesson-workspace > .code-panel')
  const panel = page.locator('.lesson-workspace .trace-panel')
  const codeBox = await code.boundingBox()
  const panelBox = await panel.boundingBox()
  expect(codeBox).not.toBeNull()
  expect(panelBox).not.toBeNull()
  expect(panelBox!.x).toBeGreaterThanOrEqual(codeBox!.x + codeBox!.width)
  expect(panelBox!.y).toBeLessThan(codeBox!.y + codeBox!.height)
  await expect(tutorial.gapInput('response.lot')).toBeVisible()
})

test('narrow viewport keeps trace excerpts and question controls usable', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  const tutorial = new TutorialPage(page)
  await tutorial.goto()
  await tutorial.continue()
  await tutorial.fillGap('feature.given', 'Not yet')

  const trigger = tutorial.traceTrigger('Trace this step: Given')
  await trigger.click()
  const panel = tutorial.tracePanel('Given: from words to request data')
  await expect(panel).toContainText('Correct example — your answers are unchanged')
  // Compare document positions in one layout read, independent of smooth scrolling.
  const triggerHandle = await trigger.elementHandle()
  expect(triggerHandle).not.toBeNull()
  const placement = await panel.evaluate((element, triggerElement) => {
    const triggerRect = (triggerElement as HTMLElement).getBoundingClientRect()
    const panelRect = element.getBoundingClientRect()
    return { triggerBottom: triggerRect.bottom + window.scrollY, panelTop: panelRect.top + window.scrollY }
  }, triggerHandle)
  expect(placement.panelTop).toBeGreaterThanOrEqual(placement.triggerBottom)
  for (let connection = 1; connection <= 2; connection++) {
    await expect(panel).toContainText(`Connection ${connection} of 2`)
    const excerpt = panel.locator('.trace-pre').first()
    await expect(excerpt).toBeVisible()
    await expect(excerpt.locator('mark').first()).toBeVisible()
    const width = await excerpt.evaluate(el => ({ client: el.clientWidth, scroll: el.scrollWidth }))
    expect(width.client).toBeGreaterThan(0)
    // Long code can scroll within its excerpt; it must not widen the entire page.
    const excerptBox = await excerpt.boundingBox()
    expect(excerptBox).not.toBeNull()
    expect(excerptBox!.x + excerptBox!.width).toBeLessThanOrEqual(375)
    if (width.scroll > width.client) {
      await excerpt.evaluate(el => { el.scrollLeft = el.scrollWidth })
      expect(await excerpt.evaluate(el => el.scrollLeft)).toBeGreaterThan(0)
    }
    for (const label of ['Back', 'Next', 'Close']) {
      const button = panel.getByRole('button', { name: label })
      await button.scrollIntoViewIfNeeded()
      const box = await button.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(375)
    }
    if (connection < 2) await panel.getByRole('button', { name: 'Next' }).click()
  }
  await panel.getByRole('button', { name: 'Close' }).click()
  await expect(tutorial.gapInput('feature.given')).toHaveValue('Not yet')

  for (const id of ['lesson2.binding', 'lesson2.patient'] as const) {
    const question = page.locator(`div.question-item:has(input[name="${id}"])`)
    await expect(question.getByRole('group')).toBeVisible()
    await expect(question.getByRole('radio')).toHaveCount(3)
    const check = question.getByRole('button', { name: 'Check understanding' })
    await check.scrollIntoViewIfNeeded()
    const box = await check.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x + box!.width).toBeLessThanOrEqual(375)
    await tutorial.answerQuestion(id, 'A')
    await check.click()
    await expect(question.locator('.question-feedback')).toContainText('Passed')
  }

  await tutorial.fillLessonGaps(2)
  await tutorial.checkWork()
  await tutorial.continue()
  for (const [number, traceLabel, choice] of [
    [3, 'Trace this step: Model and JSON', 'B'],
    [4, 'Trace this step: Build and send request', 'C'],
    [5, 'Trace this step: Verify response', 'B'],
  ] as const) {
    await tutorial.expectLessonVisible(number)
    await tutorial.traceTrigger(traceLabel).click()
    if (number === 5) {
      const code = page.locator('.lesson-workspace > .code-panel')
      expect(await code.evaluate(el => el.scrollHeight)).toBeGreaterThan(await code.evaluate(el => el.clientHeight))
    }
    const lessonPanel = page.locator('.trace-panel')
    await expect(lessonPanel.locator('.trace-pre').first()).toBeVisible()
    await expect(lessonPanel.locator('mark').first()).toBeVisible()
    const excerptBox = await lessonPanel.locator('.trace-pre').first().boundingBox()
    expect(excerptBox).not.toBeNull()
    expect(excerptBox!.x + excerptBox!.width).toBeLessThanOrEqual(375)
    await lessonPanel.getByRole('button', { name: 'Next' }).click()
    await expect(lessonPanel).toContainText('Connection 2')
    await lessonPanel.getByRole('button', { name: 'Close' }).click()
    const questionId = number === 3 ? 'lesson3.json-name' : number === 4 ? 'lesson4.send' : 'lesson5.assertion'
    await expect(tutorial.questionChoice(questionId, choice)).toBeVisible()
    await tutorial.answerQuestion(questionId, choice)
    await tutorial.checkUnderstanding(questionId)
    await expect(page.locator(`div.question-item:has(input[name="${questionId}"]) .question-feedback`)).toContainText('Passed')
    if (number < 5) {
      await tutorial.fillLessonGaps(number)
      await tutorial.checkWork()
      await tutorial.continue()
    }
  }
})

test('lesson 3 understanding gates lesson 4; checked request and revealed solution hide mapping metadata', async ({ page }) => {
  const tutorial = new TutorialPage(page)
  await tutorial.goto()
  await tutorial.continue()
  await tutorial.completeLesson(2)
  await tutorial.fillLessonGaps(3)
  await tutorial.checkWork()
  await expect(tutorial.checkSummarySuccess).toContainText('All gaps are correct')
  await expect(tutorial.continueButton).toBeDisabled()
  await expect(page.locator('.lesson-workspace')).not.toContainText(/\/\/ (?:end)?region:/)

  await tutorial.answerQuestion('lesson3.json-name', 'B')
  await tutorial.checkUnderstanding('lesson3.json-name')
  await expect(tutorial.continueButton).toBeEnabled()
  await tutorial.continue()
  await tutorial.expectLessonVisible(4)
  await tutorial.fillLessonGaps(4)
  await tutorial.checkWork()
  await expect(tutorial.checkSummarySuccess).toContainText('All gaps are correct')
  await expect(tutorial.continueButton).toBeDisabled()
  await expect(page.locator('.lesson-workspace')).not.toContainText(/\/\/ (?:end)?region:/)
  await tutorial.showSolutionButton.click()
  await expect(tutorial.solutionPanel).toBeVisible()
  await expect(tutorial.solutionPanel).toContainText('PatientReference')
  await expect(tutorial.solutionPanel).not.toContainText(/\/\/ (?:end)?region:/)
  await expect(tutorial.continueButton).toBeDisabled()
})

test('solution reveal shows correct code without mutating inputs', async ({ page }) => {
  const tutorial = new TutorialPage(page)
  await tutorial.goto()
  await tutorial.continue()
  await tutorial.completeLesson(2)

  await tutorial.expectLessonVisible(3)

  // Enter a wrong answer
  await tutorial.gapInput('model.vaccine').fill('MyWrongAnswer')

  // Show solution
  await tutorial.showSolutionButton.click()
  await expect(tutorial.solutionPanel).toBeVisible()
  await expect(tutorial.solutionPanel.locator('code')).toContainText('CodeableConcept')
  await expect(tutorial.solutionPanel).not.toContainText('// region:')
  await expect(page.locator('.side-panel').last()).not.toContainText('// region:')

  // Input value must not change
  await expect(tutorial.gapInput('model.vaccine')).toHaveValue('MyWrongAnswer')

  // Hide solution
  await tutorial.hideSolutionButton.click()
  await expect(tutorial.solutionPanel).not.toBeVisible()
})

test('learner code, examples, simulation and every trace excerpt hide mapping metadata', async ({ page }) => {
  const tutorial = new TutorialPage(page)
  await tutorial.goto()
  await tutorial.continue()
  for (const [lessonNumber, triggers] of [
    [2, ['Trace this step: Given', 'Trace this step: When', 'Trace this step: Then and And']],
    [3, ['Trace this step: Model and JSON']],
    [4, ['Trace this step: Build and send request']],
    [5, ['Trace this step: Verify response']],
  ] as const) {
    await tutorial.expectLessonVisible(lessonNumber)
    await expect(page.locator('.lesson-workspace')).not.toContainText(/\/\/ (?:end)?region:/)
    await tutorial.showSolutionButton.click()
    await expect(tutorial.solutionPanel).not.toContainText(/\/\/ (?:end)?region:/)
    await expect(page.locator('.side-panel').last()).not.toContainText(/\/\/ (?:end)?region:/)
    await tutorial.hideSolutionButton.click()
    for (const label of triggers) {
      await tutorial.traceTrigger(label).click()
      const panel = page.locator('.trace-panel')
      const next = panel.getByRole('button', { name: 'Next' })
      while (true) {
        await expect(panel).not.toContainText(/\/\/ (?:end)?region:/)
        if (await next.isDisabled()) break
        await next.click()
      }
      await panel.getByRole('button', { name: 'Close' }).click()
    }
    await tutorial.completeLesson(lessonNumber, lessonNumber === 5)
  }
  await tutorial.runSimulationButton.click()
  for (const name of ['Feature', 'Immunization.cs', 'Steps.cs', 'Request', 'Response']) {
    await tutorial.tab(name).click()
    await expect(tutorial.simulationTabContent).not.toContainText(/\/\/ (?:end)?region:/)
  }
  await tutorial.tab('Immunization.cs').click()
  await expect(tutorial.simulationTabContent).toContainText(
    'public sealed class PatientReference\n{\n    [JsonPropertyName("reference")]\n    public string Reference { get; set; } = "";\n}',
  )
  await tutorial.walkthroughButton.click()
  const walkthrough = tutorial.walkthroughPanel
  for (let stage = 1; stage <= 5; stage++) {
    await expect(walkthrough).toContainText(`Stage ${stage} of 5`)
    await expect(walkthrough).not.toContainText(/\/\/ (?:end)?region:/)
    if (stage < 5) await walkthrough.getByRole('button', { name: 'Next' }).click()
  }
})

test('refresh restores current lesson, answers, and check states', async ({ page }) => {
  const tutorial = new TutorialPage(page)
  await tutorial.goto()
  await tutorial.continue()

  // Lesson 2: fill and check
  await tutorial.fillLessonGaps(2)
  await tutorial.checkWork()
  await expect(tutorial.checkSummarySuccess).toBeVisible()

  // Answer understanding question
  await tutorial.answerQuestion('lesson2.binding', 'A')
  await tutorial.checkUnderstanding('lesson2.binding')

  // Refresh
  await tutorial.reload()

  // Restored to lesson 2 with values and check state
  await tutorial.expectLessonVisible(2)
  await expect(tutorial.checkSummarySuccess).toBeVisible()
  await expect(tutorial.gapInput('feature.given')).toHaveValue('Given')
  await expect(tutorial.gapInput('feature.patient')).toHaveValue('Patient/patient-001')

  // One of two checks passed: code is retained, but lesson 3 stays locked.
  await expect(tutorial.navButton(3)).toBeDisabled()
  await tutorial.answerQuestion('lesson2.patient', 'A')
  await tutorial.checkUnderstanding('lesson2.patient')
  await expect(tutorial.navButton(3)).toBeEnabled()
  await tutorial.gotoLesson(3)
  await tutorial.expectLessonVisible(3)
})

test('editing an earlier answer invalidates completion and disables simulation', async ({ page }) => {
  const tutorial = new TutorialPage(page)
  await tutorial.goto()
  await tutorial.continue()
  await tutorial.completeLesson(2)
  await tutorial.completeLesson(3)
  await tutorial.completeLesson(4)
  await tutorial.completeLesson(5, true)

  // Run simulation
  await tutorial.runSimulationButton.click()
  await expect(tutorial.simulationPanel).toBeVisible()
  await expect(tutorial.tutorialCompleteBanner).toContainText('Tutorial complete!')

  // Navigate to lesson 3 and change a value
  await tutorial.gotoLesson(3)
  await tutorial.gapInput('model.vaccine').fill('WrongValue')

  // Status becomes Needs check
  await expect(tutorial.lessonStatusBadge).toContainText('code check needed')

  // Go back to lesson 5: simulation disabled and completion cleared
  await tutorial.gotoLesson(5)
  await expect(tutorial.runSimulationButton).toBeDisabled()
  await expect(tutorial.tutorialCompleteBanner).not.toBeVisible()
})

test('restoring an edited passed code answer still requires a new code check', async ({ page }) => {
  const tutorial = new TutorialPage(page)
  await tutorial.goto()
  await tutorial.continue()
  await tutorial.completeLesson(2)
  await tutorial.completeLesson(3)
  await tutorial.completeLesson(4)
  await tutorial.completeLesson(5, true)
  await tutorial.runSimulationButton.click()
  await expect(tutorial.simulationPanel).toBeVisible()

  await tutorial.gotoLesson(3)
  const input = tutorial.gapInput('model.vaccine')
  const original = await input.inputValue()
  await input.fill('WrongValue')
  await input.fill(original)
  await expect(input).toHaveValue(original)
  await expect(tutorial.lessonStatusBadge).toContainText('code check needed')
  await expect(page.getByTestId('understanding-summary')).toContainText('Understanding 1 of 1 passed')
  await expect(tutorial.navButton(5)).toBeEnabled()
  await tutorial.reload()
  await expect(input).toHaveValue(original)
  await expect(tutorial.lessonStatusBadge).toContainText('code check needed')
  await tutorial.gotoLesson(5)
  await expect(tutorial.runSimulationButton).toBeDisabled()
  await expect(tutorial.simulationPanel).not.toBeVisible()
  await expect(tutorial.walkthroughButton).not.toBeVisible()
  await tutorial.gotoLesson(3)
  await tutorial.checkWork()
  await expect(tutorial.lessonStatusBadge).toContainText('Complete')
  await tutorial.gotoLesson(5)
  await expect(tutorial.runSimulationButton).toBeEnabled()
  await expect(tutorial.simulationPanel).not.toBeVisible()
  await tutorial.runSimulationButton.click()
  await expect(tutorial.simulationPanel).toBeVisible()
})

test('editing a passed question after simulation preserves code and navigation but requires resubmission and rerun', async ({ page }) => {
  const tutorial = new TutorialPage(page)
  await tutorial.goto()
  await tutorial.continue()
  await tutorial.completeLesson(2)
  await tutorial.completeLesson(3)
  await tutorial.completeLesson(4)
  await tutorial.completeLesson(5, true)
  await tutorial.runSimulationButton.click()
  await tutorial.walkthroughButton.click()
  await expect(tutorial.walkthroughPanel).toBeVisible()
  await expect(tutorial.simulationPanel).toBeVisible()

  await tutorial.gotoLesson(2)
  await tutorial.answerQuestion('lesson2.binding', 'B')
  await expect(tutorial.checkSummarySuccess).toContainText('All gaps are correct')
  await expect(tutorial.lessonStatusBadge).toContainText('understanding pending')
  await expect(tutorial.navButton(5)).toBeEnabled()
  await expect(tutorial.walkthroughPanel).not.toBeVisible()
  await expect(tutorial.walkthroughButton).not.toBeVisible()
  await expect(tutorial.simulationPanel).not.toBeVisible()
  await expect(tutorial.tutorialCompleteBanner).not.toBeVisible()
  await tutorial.gotoLesson(5)
  await expect(tutorial.runSimulationButton).toBeDisabled()

  // Restoring the prior selection alone cannot pass an unchecked question.
  await tutorial.gotoLesson(2)
  await tutorial.answerQuestion('lesson2.binding', 'A')
  await expect(tutorial.lessonStatusBadge).toContainText('understanding pending')
  await expect(tutorial.checkSummarySuccess).toContainText('All gaps are correct')
  await tutorial.gotoLesson(5)
  await expect(tutorial.runSimulationButton).toBeDisabled()
  await tutorial.gotoLesson(2)
  await tutorial.checkUnderstanding('lesson2.binding')
  await expect(tutorial.lessonStatusBadge).toContainText('Complete')
  await expect(tutorial.navButton(5)).toBeEnabled()
  await tutorial.gotoLesson(5)
  await expect(tutorial.runSimulationButton).toBeEnabled()
  await expect(tutorial.simulationPanel).not.toBeVisible()
  await expect(tutorial.walkthroughButton).not.toBeVisible()
  await tutorial.runSimulationButton.click()
  await expect(tutorial.simulationPanel).toBeVisible()
  await expect(tutorial.walkthroughButton).toBeVisible()
  await tutorial.walkthroughButton.click()
  await expect(tutorial.walkthroughPanel).toBeVisible()
})

test('navigating away closes the final walkthrough and focuses the destination', async ({ page }) => {
  const tutorial = new TutorialPage(page)
  await tutorial.goto()
  await tutorial.continue()
  for (const lesson of [2, 3, 4]) await tutorial.completeLesson(lesson)
  await tutorial.completeLesson(5, true)
  await tutorial.runSimulationButton.click()
  await tutorial.walkthroughButton.click()
  await expect(tutorial.walkthroughPanel).toBeVisible()
  await tutorial.navButton(3).click()
  await expect(tutorial.walkthroughPanel).not.toBeVisible()
  await expect(page.getByRole('heading', { name: /Lesson 3:/ })).toBeFocused()
  await tutorial.gotoLesson(5)
  await tutorial.walkthroughButton.click()
  await page.getByRole('button', { name: 'Review lessons' }).click()
  await expect(tutorial.walkthroughPanel).not.toBeVisible()
  await expect(page.getByRole('heading', { name: /Lesson 1:/ })).toBeFocused()
})

test('final walkthrough appears after successful simulation', async ({ page }) => {
  const assertNoExternalRequests = monitorExternalRequests(page)
  const tutorial = new TutorialPage(page)
  await tutorial.goto()
  await tutorial.continue()
  await tutorial.completeLesson(2)
  await tutorial.completeLesson(3)
  await tutorial.completeLesson(4)
  await tutorial.completeLesson(5, true)

  await tutorial.runSimulationButton.click()
  await expect(tutorial.simulationPanel).toBeVisible()
  await tutorial.tab('Steps.cs').click()
  await expect(tutorial.simulationTabContent).not.toContainText(/\/\/ (?:end)?region:/)

  await tutorial.walkthroughButton.click()
  await expect(tutorial.walkthroughPanel).toBeVisible()
  await expect(tutorial.walkthroughPanel).toContainText('Stage 1 of 5')
  await expect(tutorial.walkthroughPanel).not.toContainText('// region:')
  // This must highlight the captured argument assignment, not just display it nearby.
  await expect(tutorial.walkthroughPanel.locator('mark').filter({ hasText: 'Reference = patientReference' })).toHaveCount(1)
  await expect(tutorial.walkthroughPanel.locator('.trace-pre').filter({ hasText: 'Patient = new PatientReference {' })).toHaveCount(1)

  const panel = tutorial.walkthroughPanel
  const next = panel.getByRole('button', { name: 'Next' })
  await next.click()
  await expect(panel).toContainText('Stage 2 of 5')
  await expect(panel).toContainText('occurrenceDateTime')
  for (const [number, fragments] of [
    [3, ['When I submit the vaccination', 'HttpMethod.Post', 'Client.SendAsync(message)', '_response']],
    [4, ['Then the response status is 201', 'expectedStatus', '_response.StatusCode']],
    [5, ['And the recorded vaccination matches the request', 'Deserialize<Immunization>', 'actual.Patient.Reference', 'actual.LotNumber', 'TRAINING-FLU-001']],
  ] as const) {
    await next.click()
    await expect(panel).toContainText(`Stage ${number} of 5`)
    for (const fragment of fragments) await expect(panel).toContainText(fragment)
  }
  await expect(next).toBeDisabled()
  await panel.getByRole('button', { name: 'Back' }).click()
  await expect(panel).toContainText('Stage 4 of 5')
  await panel.getByRole('button', { name: 'Close' }).click()
  await expect(panel).not.toBeVisible()
  await expect(tutorial.tutorialCompleteBanner).toBeVisible()

  // A new code edit removes the old simulation and its walkthrough until rechecked and rerun.
  await tutorial.walkthroughButton.click()
  await tutorial.gotoLesson(5)
  await tutorial.gapInput('response.lot').fill('_request . LotNumber')
  await expect(panel).not.toBeVisible()
  await expect(tutorial.walkthroughButton).not.toBeVisible()
  await expect(tutorial.runSimulationButton).toBeDisabled()
  await expect(tutorial.tutorialCompleteBanner).not.toBeVisible()
  assertNoExternalRequests()
})

test('walkthrough retains accepted learner formatting rather than substituting canonical code', async ({ page }) => {
  const tutorial = new TutorialPage(page)
  await tutorial.goto()
  await tutorial.continue()
  await tutorial.completeLesson(2)
  await tutorial.completeLesson(3)
  await tutorial.completeLesson(4)
  await tutorial.fillLessonGaps(5)
  await tutorial.gapInput('response.lot').fill('_request . LotNumber')
  await tutorial.checkWork()
  await tutorial.answerQuestion('lesson5.assertion', 'B')
  await tutorial.checkUnderstanding('lesson5.assertion')
  await tutorial.runSimulationButton.click()
  await tutorial.walkthroughButton.click()
  for (let i = 1; i < 5; i++) await tutorial.walkthroughPanel.getByRole('button', { name: 'Next' }).click()
  await expect(tutorial.walkthroughPanel).toContainText('Is.EqualTo(_request . LotNumber)')
  await expect(tutorial.walkthroughPanel.locator('mark').filter({ hasText: '_request . LotNumber' })).toHaveCount(1)
})

test('keyboard focus follows trace and walkthrough navigation and returns to triggers', async ({ page }) => {
  const tutorial = new TutorialPage(page)
  await tutorial.goto()
  await tutorial.continue()
  const trigger = tutorial.traceTrigger('Trace this step: Given')
  await trigger.focus()
  await page.keyboard.press('Enter')
  const panel = tutorial.tracePanel('Given: from words to request data')
  await expect(panel.locator('h4')).toBeFocused()
  await expect(panel.getByRole('button', { name: 'Back' })).toBeDisabled()
  const next = panel.getByRole('button', { name: 'Next' })
  await next.focus()
  await page.keyboard.press('Enter')
  await expect(panel).toContainText('Connection 2 of 2')
  await expect(panel.locator('h4')).toBeFocused()
  await expect(next).toBeDisabled()
  const back = panel.getByRole('button', { name: 'Back' })
  await back.focus()
  await back.press('Enter')
  await expect(panel.locator('h4')).toBeFocused()
  await panel.getByRole('button', { name: 'Close' }).focus()
  await page.keyboard.press('Enter')
  await expect(trigger).toBeFocused()
  await trigger.press('Enter')
  await expect(panel).toContainText('Connection 1 of 2')
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()

  await tutorial.completeLesson(2)
  await tutorial.completeLesson(3)
  await tutorial.completeLesson(4)
  await tutorial.completeLesson(5, true)
  const longTrigger = tutorial.traceTrigger('Trace this step: Verify response')
  await longTrigger.focus()
  await longTrigger.press('Enter')
  const longPanel = tutorial.tracePanel('Verify the response')
  await expect(longPanel).toContainText('Connection 1 of 4')
  await expect(longPanel.locator('h4')).toBeFocused()
  const longNext = longPanel.getByRole('button', { name: 'Next' })
  const longBack = longPanel.getByRole('button', { name: 'Back' })
  await expect(longBack).toBeDisabled()
  await longNext.focus()
  await longNext.press('Enter')
  await expect(longPanel).toContainText('Connection 2 of 4')
  await expect(longNext).toBeFocused()
  await expect(longNext).toBeEnabled()
  await expect(longBack).toBeEnabled()
  await longBack.focus()
  await longBack.press('Enter')
  await expect(longPanel).toContainText('Connection 1 of 4')
  await expect(longPanel.locator('h4')).toBeFocused()
  await longNext.focus()
  for (let i = 2; i <= 4; i++) {
    await longNext.press('Enter')
    await expect(longPanel).toContainText(`Connection ${i} of 4`)
    if (i < 4) {
      await expect(longNext).toBeEnabled()
      await expect(longNext).toBeFocused()
    } else {
      await expect(longPanel.locator('h4')).toBeFocused()
    }
  }
  await expect(longNext).toBeDisabled()
  await longPanel.getByRole('button', { name: 'Close' }).click()
  await expect(longTrigger).toBeFocused()
  await tutorial.runSimulationButton.click()
  await tutorial.walkthroughButton.focus()
  await page.keyboard.press('Enter')
  const walkthrough = tutorial.walkthroughPanel
  await expect(walkthrough.locator('h4')).toBeFocused()
  const forward = walkthrough.getByRole('button', { name: 'Next' })
  await forward.focus()
  await forward.press('Enter')
  await expect(walkthrough).toContainText('Stage 2 of 5')
  await expect(forward).toBeFocused()
  for (let i = 0; i < 3; i++) await forward.press('Enter')
  await expect(walkthrough).toContainText('Stage 5 of 5')
  await expect(walkthrough.locator('h4')).toBeFocused()
  const reverse = walkthrough.getByRole('button', { name: 'Back' })
  await reverse.focus()
  await reverse.press('Enter')
  await expect(reverse).toBeFocused()
  await walkthrough.getByRole('button', { name: 'Close' }).focus()
  await page.keyboard.press('Enter')
  await expect(tutorial.walkthroughButton).toBeFocused()
  await tutorial.walkthroughButton.press('Enter')
  await page.keyboard.press('Escape')
  await expect(tutorial.walkthroughButton).toBeFocused()
})

test('reset cancel preserves state; confirm removes both tutorial versions but keeps unrelated storage', async ({ page }) => {
  const tutorial = new TutorialPage(page)
  await tutorial.goto()
  await tutorial.continue()
  await tutorial.completeLesson(2)
  await tutorial.expectLessonVisible(3)

  // A valid old save must not revive progress if the current version is cleared.
  const oldSave = {
    schemaVersion: 'atft.iteration001.progress.v1', contentVersion: '1',
    currentLessonId: 'lesson2', highestUnlockedLesson: 3, readingComplete: true,
    gapValues: {}, lastCheckedValues: {}, simulationComplete: false,
  }
  await page.evaluate((save) => {
    localStorage.setItem('atft.iteration001.progress.v1', JSON.stringify(save))
    localStorage.setItem('another.application.preference', 'keep me')
  }, oldSave)
  const before = await page.evaluate(() => ({
    current: localStorage.getItem('atft.iteration002.progress.v1'),
    old: localStorage.getItem('atft.iteration001.progress.v1'),
    unrelated: localStorage.getItem('another.application.preference'),
  }))
  expect(before.current).not.toBeNull()

  await tutorial.openResetDialog()
  await expect(tutorial.dialog.locator('h3')).toBeFocused()
  await tutorial.cancelReset()
  await expect(tutorial.resetButton).toBeFocused()
  expect(await page.evaluate(() => ({
    current: localStorage.getItem('atft.iteration002.progress.v1'),
    old: localStorage.getItem('atft.iteration001.progress.v1'),
    unrelated: localStorage.getItem('another.application.preference'),
  }))).toEqual(before)
  await tutorial.gotoLesson(2)
  await expect(tutorial.gapInput('feature.given')).toHaveValue('Given')

  await tutorial.openResetDialog()
  await tutorial.confirmReset()
  await tutorial.expectLessonVisible(1)
  await expect(tutorial.navButton(2)).toBeDisabled()
  await expect.poll(() => page.evaluate(() => ({
    current: JSON.parse(localStorage.getItem('atft.iteration002.progress.v1') ?? 'null'),
    old: localStorage.getItem('atft.iteration001.progress.v1'),
    unrelated: localStorage.getItem('another.application.preference'),
  }))).toMatchObject({
    current: { currentLessonId: 'lesson1', readingComplete: false, gapValues: {}, simulationComplete: false },
    old: null, unrelated: 'keep me',
  })
  await tutorial.reload()
  await tutorial.expectLessonVisible(1)
  await expect(tutorial.navButton(2)).toBeDisabled()
  await expect(page.getByText('Your work is saved.')).not.toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('atft.iteration001.progress.v1'))).toBeNull()
  expect(await page.evaluate(() => localStorage.getItem('another.application.preference'))).toBe('keep me')
})

test('migration from iteration 001 preserves code and resets understanding', async ({ page }) => {
  const tutorial = new TutorialPage(page)
  await tutorial.goto()

  // Clear the fresh iteration 002 state that the app saved on first load
  await page.evaluate(() => localStorage.clear())

  // Seed iteration 001 state with completed lesson 2
  const iteration001State = {
    schemaVersion: 'atft.iteration001.progress.v1',
    contentVersion: '1',
    currentLessonId: 'lesson2',
    highestUnlockedLesson: 3,
    readingComplete: true,
    gapValues: {
      lesson2: {
        'feature.given': 'Given',
        'feature.patient': 'Patient/patient-001',
        'feature.when': 'When',
        'feature.then': 'Then',
        'feature.status': '201',
      },
    },
    lastCheckedValues: {
      lesson2: {
        'feature.given': 'Given',
        'feature.patient': 'Patient/patient-001',
        'feature.when': 'When',
        'feature.then': 'Then',
        'feature.status': '201',
      },
    },
    simulationComplete: true,
  }

  await page.evaluate((state) => {
    localStorage.setItem('atft.iteration001.progress.v1', state)
  }, JSON.stringify(iteration001State))

  await page.reload()
  await page.waitForLoadState('networkidle')

  // Should show migration notice
  await expect(page.getByText('added checks')).toBeVisible()

  // Lesson 2 should be available but needs understanding checks
  await expect(tutorial.lessonStatusBadge).toContainText('understanding pending')
  await expect(tutorial.gapInput('feature.given')).toHaveValue('Given')

  // Dismiss notice
  await page.getByRole('button', { name: 'Dismiss' }).click()

  // Complete understanding checks
  await tutorial.answerQuestion('lesson2.binding', 'A')
  await tutorial.checkUnderstanding('lesson2.binding')
  await tutorial.answerQuestion('lesson2.patient', 'A')
  await tutorial.checkUnderstanding('lesson2.patient')

  // Now complete
  await expect(tutorial.lessonStatusBadge).toContainText('Complete')
})

for (const [caseName, checkedPatient] of [
  ['stale', 'Patient/patient-002'],
  ['incorrect', 'WrongPatient'],
] as const) {
  test(`${caseName} iteration 001 code check preserves answers but does not pass on migration`, async ({ page }) => {
    const tutorial = new TutorialPage(page)
    await tutorial.goto()
    const patient = caseName === 'incorrect' ? checkedPatient : 'Patient/patient-001'
    const gaps = Object.fromEntries(lessons.find(lesson => lesson.id === 'lesson2')!.editableGaps.map(id => [id, canonicalAnswers[id]]))
    await page.evaluate(({ gaps, patient, checkedPatient }) => {
      localStorage.removeItem('atft.iteration002.progress.v1')
      localStorage.setItem('atft.iteration001.progress.v1', JSON.stringify({
        schemaVersion: 'atft.iteration001.progress.v1', contentVersion: '1',
        currentLessonId: 'lesson2', highestUnlockedLesson: 3, readingComplete: true,
        gapValues: { lesson2: { ...gaps, 'feature.patient': patient } },
        lastCheckedValues: { lesson2: { ...gaps, 'feature.patient': checkedPatient } },
        simulationComplete: false,
      }))
    }, { gaps, patient, checkedPatient })
    await tutorial.reload()
    await expect(page.getByText('Your work is saved.')).toBeVisible()
    await expect(tutorial.gapInput('feature.patient')).toHaveValue(patient)
    await expect(tutorial.checkSummarySuccess).not.toBeVisible()
    await expect(tutorial.lessonStatusBadge).toContainText('code check needed')
    await expect(tutorial.navButton(3)).toBeEnabled() // retain earlier unlock, not a new pass
    const migrated = await page.evaluate(() => JSON.parse(localStorage.getItem('atft.iteration002.progress.v1')!))
    expect(migrated.lastCheckedValues.lesson2).toBeUndefined()
    expect(migrated.gapValues.lesson2['feature.patient']).toBe(patient)
    await tutorial.reload()
    await expect(tutorial.checkSummarySuccess).not.toBeVisible()
    await expect(tutorial.gapInput('feature.patient')).toHaveValue(patient)
  })
}

test('completed iteration 001 save migrates every code check and keeps unlocked navigation in browser', async ({ page }) => {
  const tutorial = new TutorialPage(page)
  await tutorial.goto()
  const values = Object.fromEntries(lessons.filter(lesson => lesson.type === 'coding').map(lesson => [
    lesson.id, Object.fromEntries(lesson.editableGaps.map(id => [id, canonicalAnswers[id]])),
  ]))
  await page.evaluate((gapValues) => {
    localStorage.removeItem('atft.iteration002.progress.v1')
    localStorage.setItem('atft.iteration001.progress.v1', JSON.stringify({
      schemaVersion: 'atft.iteration001.progress.v1', contentVersion: '1',
      currentLessonId: 'lesson5', highestUnlockedLesson: 5, readingComplete: true,
      gapValues, lastCheckedValues: gapValues, simulationComplete: true,
    }))
  }, values)
  await tutorial.reload()
  await tutorial.expectLessonVisible(5)
  await expect(page.getByText('Your work is saved.')).toBeVisible()
  await expect(tutorial.runSimulationButton).toBeDisabled()
  await expect(tutorial.tutorialCompleteBanner).not.toBeVisible()
  for (const lesson of lessons.filter(lesson => lesson.type === 'coding')) {
    await expect(tutorial.navButton(lesson.number)).toBeEnabled()
    await tutorial.gotoLesson(lesson.number)
    await expect(tutorial.lessonStatusBadge).toContainText('understanding pending')
    for (const id of lesson.editableGaps) await expect(tutorial.gapInput(id)).toHaveValue(canonicalAnswers[id])
    await expect(tutorial.checkSummarySuccess).toContainText('All gaps are correct')
  }
  await tutorial.reload()
  await tutorial.expectLessonVisible(5)
  await expect(tutorial.navButton(2)).toBeEnabled()
  await expect(tutorial.runSimulationButton).toBeDisabled()
  await expect(page.evaluate(() => localStorage.getItem('atft.iteration001.progress.v1'))).resolves.toBeNull()
})

test('missing iteration 002 question maps recover without crashing the UI', async ({ page }) => {
  const tutorial = new TutorialPage(page)
  await tutorial.goto()
  for (const field of ['questionSelections', 'checkedQuestionSelections']) {
    await page.evaluate((missingField) => {
      const state = JSON.parse(localStorage.getItem('atft.iteration002.progress.v1')!)
      delete state[missingField]
      localStorage.setItem('atft.iteration002.progress.v1', JSON.stringify(state))
    }, field)
    await tutorial.reload()
    await tutorial.expectLessonVisible(1)
    await expect(page.getByText('Saved progress is from an incompatible version and has been reset.')).toBeVisible()
  }
})

test('failed migration write shows storage warning and retains old progress', async ({ page }) => {
  const tutorial = new TutorialPage(page)
  await tutorial.goto()
  await page.evaluate(() => {
    localStorage.removeItem('atft.iteration002.progress.v1')
    localStorage.setItem('atft.iteration001.progress.v1', JSON.stringify({
      schemaVersion: 'atft.iteration001.progress.v1', contentVersion: '1',
      currentLessonId: 'lesson2', highestUnlockedLesson: 2, readingComplete: true,
      gapValues: { lesson2: { 'feature.given': 'Given' } },
      lastCheckedValues: {}, simulationComplete: false,
    }))
  })
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'atft.iteration002.progress.v1') throw new Error('storage denied')
      return original.call(this, key, value)
    }
  })
  await tutorial.reload()
  await tutorial.expectLessonVisible(2)
  await expect(tutorial.gapInput('feature.given')).toHaveValue('Given')
  await expect(page.getByText('Progress cannot be saved in this browser session.')).toBeVisible()
  await expect(page.getByText(/Your earlier work remains in its old save, but changes in this session cannot currently be saved/)).toBeVisible()
  await expect(page.getByText('Your work is saved.')).not.toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('atft.iteration001.progress.v1'))).not.toBeNull()
})

test('reset clears migration notice without showing stale saved-work claims', async ({ page }) => {
  const tutorial = new TutorialPage(page)
  await tutorial.goto()
  await page.evaluate(() => {
    localStorage.removeItem('atft.iteration002.progress.v1')
    localStorage.setItem('atft.iteration001.progress.v1', JSON.stringify({
      schemaVersion: 'atft.iteration001.progress.v1', contentVersion: '1',
      currentLessonId: 'lesson1', highestUnlockedLesson: 1, readingComplete: false,
      gapValues: {}, lastCheckedValues: {}, simulationComplete: false,
    }))
  })
  await tutorial.reload()
  await expect(page.getByText('Your work is saved.')).toBeVisible()
  await tutorial.openResetDialog()
  await tutorial.confirmReset()
  await expect(page.getByText('Your work is saved.')).not.toBeVisible()
  await tutorial.reload()
  await expect(page.getByText('Your work is saved.')).not.toBeVisible()
})
