import { describe, it, expect } from 'vitest';
import {
  numberTitle,
  numberSections,
  numberFlatQuestions,
  ALREADY_NUMBERED_RE,
} from './numbering';

describe('ALREADY_NUMBERED_RE', () => {
  it('matches "Section 1 — ..."', () => {
    expect(ALREADY_NUMBERED_RE.test('Section 1 — The Deal Pipeline')).toBe(true);
  });

  it('matches "Q 1.1 — ..."', () => {
    expect(ALREADY_NUMBERED_RE.test('Q 1.1 — Walk us through')).toBe(true);
  });

  it('matches "Q 2 — ..."', () => {
    expect(ALREADY_NUMBERED_RE.test('Q 2 — Your name')).toBe(true);
  });

  it('matches "1. Some title"', () => {
    expect(ALREADY_NUMBERED_RE.test('1. Some title')).toBe(true);
  });

  it('matches "2) Some title"', () => {
    expect(ALREADY_NUMBERED_RE.test('2) Some title')).toBe(true);
  });

  it('does not match plain titles', () => {
    expect(ALREADY_NUMBERED_RE.test('Walk us through your pipeline')).toBe(false);
  });

  it('does not match mid-text numbers', () => {
    expect(ALREADY_NUMBERED_RE.test('How many Q 1 items')).toBe(false);
  });
});

describe('numberTitle', () => {
  it('prepends prefix to a plain title', () => {
    expect(numberTitle('Q 1 \u2014 ', 'Your name')).toBe('Q 1 \u2014 Your name');
  });

  it('skips already-numbered titles', () => {
    expect(numberTitle('Q 1 \u2014 ', 'Q 3.2 \u2014 Existing')).toBe('Q 3.2 \u2014 Existing');
  });

  it('skips titles starting with "Section N"', () => {
    expect(numberTitle('Section 1 \u2014 ', 'Section 2 \u2014 Old')).toBe('Section 2 \u2014 Old');
  });

  it('skips titles starting with "1."', () => {
    expect(numberTitle('Q 1 \u2014 ', '1. First question')).toBe('1. First question');
  });
});

describe('numberSections', () => {
  it('numbers sections and questions', () => {
    const sections = [
      {
        title: 'The Deal Pipeline',
        questions: [
          { type: 'paragraph', title: 'Walk us through your pipeline' },
          { type: 'text', title: 'Average deal size' },
        ],
      },
      {
        title: 'Team',
        questions: [
          { type: 'text', title: 'Team size' },
        ],
      },
    ];

    const result = numberSections(sections);

    expect(result[0].sectionTitle).toBe('Section 1 \u2014 The Deal Pipeline');
    expect(result[0].questions).toEqual([
      'Q 1.1 \u2014 Walk us through your pipeline',
      'Q 1.2 \u2014 Average deal size',
    ]);
    expect(result[1].sectionTitle).toBe('Section 2 \u2014 Team');
    expect(result[1].questions).toEqual([
      'Q 2.1 \u2014 Team size',
    ]);
  });

  it('skips numbering for title-type items', () => {
    const sections = [
      {
        title: 'Info',
        questions: [
          { type: 'title', title: 'Sub-header' },
          { type: 'text', title: 'First question' },
          { type: 'text', title: 'Second question' },
        ],
      },
    ];

    const result = numberSections(sections);

    expect(result[0].questions).toEqual([
      'Sub-header',
      'Q 1.1 \u2014 First question',
      'Q 1.2 \u2014 Second question',
    ]);
  });

  it('does not double-number already-numbered titles', () => {
    const sections = [
      {
        title: 'Section 1 \u2014 Existing',
        questions: [
          { type: 'text', title: 'Q 1.1 \u2014 Already numbered' },
          { type: 'text', title: 'New question' },
        ],
      },
    ];

    const result = numberSections(sections);

    expect(result[0].sectionTitle).toBe('Section 1 \u2014 Existing');
    expect(result[0].questions[0]).toBe('Q 1.1 \u2014 Already numbered');
    expect(result[0].questions[1]).toBe('Q 1.2 \u2014 New question');
  });
});

describe('numberFlatQuestions', () => {
  it('numbers questions without section prefix', () => {
    const questions = [
      { type: 'text', title: 'Your name' },
      { type: 'paragraph', title: 'Your bio' },
    ];

    const result = numberFlatQuestions(questions);

    expect(result).toEqual([
      'Q 1 \u2014 Your name',
      'Q 2 \u2014 Your bio',
    ]);
  });

  it('skips title-type items and does not count them', () => {
    const questions = [
      { type: 'title', title: 'About You' },
      { type: 'text', title: 'Your name' },
      { type: 'text', title: 'Your email' },
    ];

    const result = numberFlatQuestions(questions);

    expect(result).toEqual([
      'About You',
      'Q 1 \u2014 Your name',
      'Q 2 \u2014 Your email',
    ]);
  });

  it('handles empty list', () => {
    expect(numberFlatQuestions([])).toEqual([]);
  });
});
