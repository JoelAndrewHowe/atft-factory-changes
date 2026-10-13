import { test, expect } from '@playwright/test'
import { TutorialPage } from './pages/TutorialPage'

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

  await test.step('Complete lessons 2–5', async () => {
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

  // Input value must not change
  await expect(tutorial.gapInput('model.vaccine')).toHaveValue('MyWrongAnswer')

  // Hide solution
  await tutorial.hideSolutionButton.click()
  await expect(tutorial.solutionPanel).not.toBeVisible()
})

test('refresh restores current lesson, answers, and check states', async ({ page }) => {
  const tutorial = new TutorialPage(page)
  await tutorial.goto()
  await tutorial.continue()

  // Lesson 2: fill and check
  await tutorial.fillLessonGaps(2)
  await tutorial.checkWork()
  await expect(tutorial.checkSummarySuccess).toBeVisible()

  // Refresh
  await tutorial.reload()

  // Restored to lesson 2 with values and check state
  await tutorial.expectLessonVisible(2)
  await expect(tutorial.checkSummarySuccess).toBeVisible()
  await expect(tutorial.gapInput('feature.given')).toHaveValue('Given')
  await expect(tutorial.gapInput('feature.patient')).toHaveValue('Patient/patient-001')

  // Lesson 3 should be unlocked
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
  await expect(tutorial.lessonStatusBadge).toContainText('Needs check')

  // Go back to lesson 5: simulation disabled and completion cleared
  await tutorial.gotoLesson(5)
  await expect(tutorial.runSimulationButton).toBeDisabled()
  await expect(tutorial.tutorialCompleteBanner).not.toBeVisible()
})

test('reset cancel preserves state and confirm resets to lesson 1', async ({ page }) => {
  const tutorial = new TutorialPage(page)
  await tutorial.goto()
  await tutorial.continue()
  await tutorial.completeLesson(2)

  // Now on lesson 3
  await tutorial.expectLessonVisible(3)

  // Open reset dialog and cancel
  await tutorial.openResetDialog()

  // Focus moves to dialog heading
  await expect(tutorial.dialog.locator('h3')).toBeFocused()

  await tutorial.cancelReset()
  await expect(tutorial.resetButton).toBeFocused()

  // Still on lesson 3; navigate back to lesson 2 to verify values
  await tutorial.gotoLesson(2)
  await tutorial.expectLessonVisible(2)
  await expect(tutorial.gapInput('feature.given')).toHaveValue('Given')

  // Open reset dialog and confirm
  await tutorial.openResetDialog()
  await tutorial.confirmReset()

  // Back to lesson 1, lesson 2 locked
  await tutorial.expectLessonVisible(1)
  await expect(tutorial.navButton(2)).toBeDisabled()
})
