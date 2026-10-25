import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const DISABLED = [
  // Mermaid diagrams are buttons named "Diagram at full size": the text drawn inside them is the
  // diagram's content, not a visible label that the name should repeat.
  'label-content-name-mismatch',
];

/** Runs axe (WCAG 2.2 AA + best practices) on the current page and fails on any violation. */
export async function expectAccessible(page: Page, disableRules: string[] = []): Promise<void> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(TAGS)
    .disableRules([...DISABLED, ...disableRules])
    .analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}
