import { type Page, type Locator, expect } from '@playwright/test'
import {
  lessons,
  gapDefinitions,
  canonicalAnswers,
  type GapId,
} from '../../src/lessons'

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
