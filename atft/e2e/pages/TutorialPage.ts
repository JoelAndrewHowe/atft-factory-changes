import { type Page, type Locator, expect } from '@playwright/test'
import {
  lessons,
  gapDefinitions,
  canonicalAnswers,
  type GapId,
} from '../../src/lessons'
import { type QuestionId } from '../../src/questions'

// Independent acceptance answers: never consult the lesson's correctChoiceId here.
const requiredAnswers: Record<QuestionId, 'A' | 'B' | 'C'> = {
  'lesson2.binding': 'A',
  'lesson2.patient': 'A',
  'lesson3.json-name': 'B',
  'lesson4.send': 'C',
  'lesson5.assertion': 'B',
}

// The acceptance suite defines the required lesson/question assignment itself.
// Never ask production content which questions the test should submit.
const requiredQuestionIds: Record<number, readonly QuestionId[]> = {
  1: [],
  2: ['lesson2.binding', 'lesson2.patient'],
  3: ['lesson3.json-name'],
  4: ['lesson4.send'],
  5: ['lesson5.assertion'],
}

export class TutorialPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async goto(): Promise<void> {
    await this.page.goto('/')
    await this.page.evaluate(() => localStorage.clear())
    await this.page.reload()
  }

  async reload(): Promise<void> {
    await this.page.reload()
  }

  private lessonData(lessonNumber: number) {
    const lesson = lessons.find((l) => l.number === lessonNumber)
    if (!lesson) throw new Error(`Unknown lesson number: ${lessonNumber}`)
    return lesson
  }

  heading(lessonNumber: number): Locator {
    const lesson = this.lessonData(lessonNumber)
    return this.page.getByRole('heading', {
      level: 2,
      name: `Lesson ${lesson.number}: ${lesson.title}`,
    })
  }

  async expectLessonVisible(lessonNumber: number): Promise<void> {
    await expect(this.heading(lessonNumber)).toBeVisible()
  }

  get continueButton(): Locator {
    return this.page.getByRole('button', { name: 'Continue' })
  }

  get checkButton(): Locator {
    return this.page.getByRole('button', { name: 'Check my work' })
  }

  get showSolutionButton(): Locator {
    return this.page.getByRole('button', { name: 'Show solution' })
  }

  get hideSolutionButton(): Locator {
    return this.page.getByRole('button', { name: 'Hide solution' })
  }

  get runSimulationButton(): Locator {
    return this.page.getByRole('button', { name: 'Run simulated test' })
  }

  get resetButton(): Locator {
    return this.page.getByRole('button', { name: 'Start over' })
  }

  get cancelResetButton(): Locator {
    return this.page.getByRole('button', { name: 'Cancel' })
  }

  get confirmResetButton(): Locator {
    return this.page.getByRole('button', { name: 'Confirm' })
  }

  get checkSummarySuccess(): Locator {
    return this.page.getByTestId('check-summary-success')
  }

  get checkSummaryError(): Locator {
    return this.page.getByTestId('check-summary-error')
  }

  get feedbackItems(): Locator {
    return this.page.locator('[data-testid="feedback-area"] [data-testid="feedback-item"]')
  }

  get simulationPanel(): Locator {
    return this.page.getByTestId('simulation-panel')
  }

  get simulationTabContent(): Locator {
    return this.page.getByTestId('simulation-tab-content')
  }

  get tutorialCompleteBanner(): Locator {
    return this.page.getByTestId('tutorial-complete')
  }

  get solutionPanel(): Locator {
    return this.page.getByTestId('solution-panel')
  }

  get lessonStatusBadge(): Locator {
    return this.page.getByTestId('lesson-status-badge')
  }

  get fixturePanel(): Locator {
    return this.page.getByTestId('fixture-panel')
  }

  get simulationLabel(): Locator {
    return this.page.getByTestId('simulation-label')
  }

  get passBadges(): Locator {
    return this.simulationPanel.getByTestId('pass-badge')
  }

  get recap(): Locator {
    return this.simulationPanel.getByTestId('recap')
  }

  get dialog(): Locator {
    return this.page.locator('[role="dialog"]')
  }

  get walkthroughButton(): Locator {
    return this.page.getByTestId('walkthrough-button')
  }

  get walkthroughPanel(): Locator {
    return this.page.getByRole('region', { name: 'Your completed test — simulated walkthrough' })
  }

  tab(name: string): Locator {
    return this.page.getByRole('tab', { name })
  }

  navButton(lessonNumber: number): Locator {
    const lesson = this.lessonData(lessonNumber)
    return this.page.getByRole('button', {
      name: `Lesson ${lesson.number}: ${lesson.title}`,
    })
  }

  gapInput(gapId: GapId): Locator {
    const def = gapDefinitions[gapId]
    return this.page.getByLabel(def.label)
  }

  traceTrigger(name: string): Locator {
    return this.page.getByRole('button', { name })
  }

  tracePanel(name: string): Locator {
    return this.page.getByRole('region', { name: new RegExp(name, 'i') })
  }

  questionChoice(questionId: QuestionId, choiceId: string): Locator {
    return this.page.locator(`input[name="${questionId}"][value="${choiceId}"]`)
  }

  understandingCheckButton(): Locator {
    return this.page.getByRole('button', { name: 'Check understanding' })
  }

  async fillGap(gapId: GapId, value?: string): Promise<void> {
    const input = this.gapInput(gapId)
    const text = value ?? canonicalAnswers[gapId]
    await input.fill(text)
  }

  async fillLessonGaps(lessonNumber: number): Promise<void> {
    const lesson = this.lessonData(lessonNumber)
    for (const gapId of lesson.editableGaps) {
      await this.fillGap(gapId)
    }
  }

  async answerQuestion(questionId: QuestionId, choiceId: 'A' | 'B' | 'C'): Promise<void> {
    await this.questionChoice(questionId, choiceId).check()
  }

  async checkUnderstanding(questionId: QuestionId): Promise<void> {
    await this.page.locator(`div.question-item:has(input[name="${questionId}"])`).getByRole('button', { name: 'Check understanding' }).click()
  }

  async checkWork(): Promise<void> {
    await this.checkButton.click()
  }

  async continue(): Promise<void> {
    await this.continueButton.click()
  }

  async completeLesson(lessonNumber: number, isLast = false): Promise<void> {
    await this.expectLessonVisible(lessonNumber)
    const lesson = this.lessonData(lessonNumber)
    if (lesson.editableGaps.length > 0) {
      await this.fillLessonGaps(lessonNumber)
      await this.checkWork()
      await expect(this.checkSummarySuccess).toBeVisible()
    }
    // Answer understanding questions
    const ids = requiredQuestionIds[lessonNumber]
    const renderedIds = await this.page.locator('.questions-panel input[type="radio"][value="A"]')
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLInputElement).name))
    expect(renderedIds).toEqual(ids)
    for (const id of ids) {
      await this.answerQuestion(id, requiredAnswers[id])
      await this.checkUnderstanding(id)
      await expect(this.page.locator(`div.question-item:has(input[name="${id}"]) .question-feedback`)).toContainText('Passed')
    }
    if (!isLast) {
      await this.continue()
    }
  }

  async openResetDialog(): Promise<void> {
    await this.resetButton.click()
    await expect(this.dialog).toBeVisible()
  }

  async cancelReset(): Promise<void> {
    await this.cancelResetButton.click()
    await expect(this.dialog).not.toBeVisible()
  }

  async confirmReset(): Promise<void> {
    await this.confirmResetButton.click()
    await expect(this.dialog).not.toBeVisible()
  }

  async gotoLesson(lessonNumber: number): Promise<void> {
    await this.navButton(lessonNumber).click()
  }
}
