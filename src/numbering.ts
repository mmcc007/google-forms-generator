// Regex to detect titles that already have numbering
export const ALREADY_NUMBERED_RE = /^(Section\s+\d|Q\s+\d|\d+[\.\)]\s)/i;

export function numberTitle(prefix: string, title: string): string {
  if (ALREADY_NUMBERED_RE.test(title)) {
    return title;
  }
  return `${prefix}${title}`;
}

export interface NumberableQuestion {
  type: string;
  title: string;
}

export interface NumberableSection {
  title: string;
  questions: NumberableQuestion[];
}

/**
 * Apply auto-numbering to a list of sections (pages or sections).
 * Returns new titles — does not mutate inputs.
 */
export function numberSections(
  sections: NumberableSection[],
): { sectionTitle: string; questions: string[] }[] {
  return sections.map((section, i) => {
    const sectionNum = i + 1;
    const sectionTitle = numberTitle(`Section ${sectionNum} \u2014 `, section.title);
    const questions = numberQuestions(section.questions, sectionNum);
    return { sectionTitle, questions };
  });
}

/**
 * Apply auto-numbering to a flat list of questions (no section prefix).
 */
export function numberFlatQuestions(questions: NumberableQuestion[]): string[] {
  return numberQuestions(questions, undefined);
}

function numberQuestions(questions: NumberableQuestion[], sectionIndex?: number): string[] {
  let questionIndex = 1;
  return questions.map((q) => {
    if (q.type === 'title') {
      return q.title; // title items are not numbered
    }
    const prefix = sectionIndex != null
      ? `Q ${sectionIndex}.${questionIndex} \u2014 `
      : `Q ${questionIndex} \u2014 `;
    const result = numberTitle(prefix, q.title);
    questionIndex++;
    return result;
  });
}
