import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoringConfig } from './scoringConfig.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../');
const format = (value) => JSON.stringify(value);
const content = `# Scoring model

Generated from server/src/config/scoringConfig.js. Run npm run docs:scoring after tuning those constants.

## Score formulas

- Content = ${format(scoringConfig.contentWeights)}
- Delivery = ${format(scoringConfig.deliveryWeights)}
- Final = round(100 x (${scoringConfig.finalWeights.content} x content + ${scoringConfig.finalWeights.delivery} x delivery))

## Delivery thresholds

- Pace bands (words/minute): ${format(scoringConfig.paceBands)}; otherwise ${scoringConfig.paceDefaultScore}.
- Filler bands (fillers/minute): ${format(scoringConfig.fillerBands)}; otherwise ${scoringConfig.fillerDefaultScore}.
- Long-pause bands: ${format(scoringConfig.pauseBands)}; otherwise ${scoringConfig.pauseDefaultScore}.
- When word timestamps are available, a pause is a gap greater than ${scoringConfig.longPauseThresholdSeconds} seconds between consecutive words.
- Length bands: ${format(scoringConfig.lengthBands)}. Scores decline linearly outside the ideal range and are clamped to the configured minimum.
- Clarity uses confidence clamped to 0..1, default ${scoringConfig.clarityDefault}.
- Clarity clamp range: ${format(scoringConfig.clarityRange)}. Evaluation signals are rounded to ${scoringConfig.signalDecimals} decimal places.

## Coaching thresholds

- ${format(scoringConfig.coachingThresholds)}
- Rapid-fire question types: ${format(scoringConfig.rapidFireTypes)}.

## Reactions and reports

- Strong: score >= ${scoringConfig.reactionBands.strongMin}. Partial: score >= ${scoringConfig.reactionBands.partialMin} and below strong. Weak: below partial.
- Report follow-up answer weight: ${scoringConfig.report.followUpWeight}. Weak-topic cutoff: ${scoringConfig.report.weakTopicMaxScore}. History window: ${scoringConfig.report.historyDays} days. Top issue count: ${scoringConfig.report.topIssues}.
`;

await mkdir(path.join(root, 'docs'), { recursive: true });
await writeFile(path.join(root, 'docs', 'scoring.md'), content, 'utf8');
