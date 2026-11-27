# Scoring model

Generated from server/src/config/scoringConfig.js. Run npm run docs:scoring after tuning those constants.

## Score formulas

- Content = {"keywordCoverage":0.5,"semanticSimilarity":0.3,"completeness":0.2}
- Delivery = {"pace":0.3,"fillers":0.3,"pauses":0.2,"length":0.1,"clarity":0.1}
- Final = round(100 x (0.6 x content + 0.4 x delivery))

## Delivery thresholds

- Pace bands (words/minute): [{"min":110,"max":150,"score":1},{"min":90,"max":110,"score":0.7},{"min":150,"max":175,"score":0.7}]; otherwise 0.4.
- Filler bands (fillers/minute): [{"below":3,"score":1},{"through":6,"score":0.7},{"through":10,"score":0.4}]; otherwise 0.2.
- Long-pause bands: [{"max":0,"score":1},{"max":2,"score":0.7},{"max":4,"score":0.4}]; otherwise 0.2.
- When word timestamps are available, a pause is a gap greater than 1.5 seconds between consecutive words.
- Length bands: {"standard":{"minSeconds":20,"maxSeconds":90,"longFalloffSeconds":90,"minScore":0.3},"rapid_fire":{"minSeconds":5,"maxSeconds":30,"longFalloffSeconds":30,"minScore":0.3}}. Scores decline linearly outside the ideal range and are clamped to the configured minimum.
- Clarity uses confidence clamped to 0..1, default 0.8.
- Clarity clamp range: {"min":0,"max":1}. Evaluation signals are rounded to 4 decimal places.

## Coaching thresholds

- {"goodCoverage":0.7,"goodCompleteness":0.67,"fastWpm":175,"slowWpm":90,"highFillersPerMin":3,"longPauses":1}
- Rapid-fire question types: ["rapid_fire"].

## Reactions and reports

- Strong: score >= 75. Partial: score >= 45 and below strong. Weak: below partial.
- Report follow-up answer weight: 0.5. Weak-topic cutoff: 0.65. History window: 90 days. Top issue count: 3.
