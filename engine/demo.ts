import type { ResponseInput } from "./types";

/** Sample INPUTS only. Results are always produced by the real engine. */
export interface DemoScenario {
  id: string;
  title: string;
  focus: string;
  question: string;
  responses: Array<Pick<ResponseInput, "label" | "text">>;
  /** What a reviewer should look for (documentation, not hardcoded output). */
  expectation: string;
}

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "factual-contradiction",
    title: "Factual contradiction",
    focus: "Claim extraction & contradiction detection",
    question: "What is the capital of Australia? Explain your answer in 2–3 sentences.",
    responses: [
      { label: "Response A", text: "Canberra is the capital of Australia. It became the national capital in 1913." },
      { label: "Response B", text: "Sydney is the capital of Australia and is the country’s largest city." },
      { label: "Response C", text: "Canberra is Australia’s capital city. It was selected as the capital as a compromise between Sydney and Melbourne." },
      { label: "Response D", text: "Melbourne is the capital of Australia and is one of its largest cities." },
    ],
    expectation: "A and C agree; B and D conflict with A and C. (Canberra is the actual capital, but the tool only reports consistency.)",
  },
  {
    id: "semantic-consistency",
    title: "Semantic consistency",
    focus: "Different wording, same meaning",
    question: "Explain why regular physical exercise is beneficial for human health.",
    responses: [
      { label: "Response A", text: "Regular exercise improves cardiovascular health, strengthens muscles and supports mental well-being." },
      { label: "Response B", text: "Physical activity helps the heart, builds muscular strength and reduces stress." },
      { label: "Response C", text: "Exercising regularly improves heart function, increases physical strength and benefits mental health." },
      { label: "Response D", text: "Exercise is unnecessary for maintaining good health, and physical inactivity provides the same benefits." },
    ],
    expectation: "A, B and C express similar ideas with different vocabulary; D disagrees with the rest.",
  },
  {
    id: "structural-consistency",
    title: "Structural consistency",
    focus: "Requested elements & formatting",
    question: "Explain three major advantages of renewable energy.",
    responses: [
      { label: "Response A", text: "Renewable energy reduces pollution, decreases dependence on fossil fuels and provides sustainable energy sources." },
      { label: "Response B", text: "Three advantages:\n\n1. Less pollution.\n2. Reduced fossil fuel consumption.\n3. Sustainable energy production." },
      { label: "Response C", text: "Renewable energy is beneficial because it protects the environment." },
      { label: "Response D", text: "Renewable energy offers several advantages, including environmental protection, energy independence and long-term sustainability." },
    ],
    expectation: "A, B and D cover comparable advantages; C covers fewer than three; B is a numbered list while A and D are paragraphs.",
  },
];
