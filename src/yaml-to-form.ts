import GoogleFormsGenerator, { FormConfig, FormItem, Question } from './index';
import * as fs from 'fs';
import * as yaml from 'yaml';

interface YamlQuestion {
  type: string;
  title: string;
  description?: string;
  required?: boolean;
  options?: (string | { value: string; isOther?: boolean; goToSection?: string })[];
  scale?: {
    min?: number;
    max?: number;
    minLabel?: string;
    maxLabel?: string;
  };
  rows?: string[];
  columns?: string[];
  includeTime?: boolean;
  validation?: {
    type?: string;
    min?: number;
    max?: number;
  };
}

interface YamlSection {
  title: string;
  description?: string;
  questions: YamlQuestion[];
}

interface YamlPage {
  title: string;
  description?: string;
  questions: YamlQuestion[];
}

interface YamlForm {
  title: string;
  description?: string;
  pages?: YamlPage[];      // Multi-page form with page breaks
  sections?: YamlSection[]; // Visual sections (no page breaks)
  questions?: YamlQuestion[]; // Flat list
}

function convertQuestion(q: YamlQuestion): Question | Question[] {
  const normalizeOptions = (opts: YamlQuestion['options']): string[] => {
    if (!opts) return [];
    return opts.map(o => typeof o === 'string' ? o : o.value);
  };

  switch (q.type) {
    case 'text':
      return {
        type: 'text',
        title: q.title,
        required: q.required,
        paragraph: false,
      };

    case 'paragraph':
      return {
        type: 'text',
        title: q.title,
        required: q.required,
        paragraph: true,
      };

    case 'multipleChoice':
      return {
        type: 'multipleChoice',
        title: q.title,
        required: q.required,
        options: normalizeOptions(q.options),
      };

    case 'checkbox':
      return {
        type: 'checkbox',
        title: q.title,
        required: q.required,
        options: normalizeOptions(q.options),
      };

    case 'dropdown':
      return {
        type: 'dropdown',
        title: q.title,
        required: q.required,
        options: normalizeOptions(q.options),
      };

    case 'scale':
      return {
        type: 'scale',
        title: q.title,
        required: q.required,
        low: q.scale?.min ?? 1,
        high: q.scale?.max ?? 5,
        lowLabel: q.scale?.minLabel,
        highLabel: q.scale?.maxLabel,
      };

    case 'date':
      return {
        type: 'date',
        title: q.title,
        required: q.required,
        includeTime: q.includeTime,
      };

    case 'grid':
    case 'checkboxGrid':
      // Google Forms API doesn't support grid directly in the same way
      // We'll convert to multiple scale or multiple choice questions
      if (!q.rows || !q.columns) {
        throw new Error(`Grid question "${q.title}" requires rows and columns`);
      }

      // Create a multiple choice question for each row
      return q.rows.map(row => ({
        type: 'multipleChoice' as const,
        title: `${q.title} - ${row}`,
        required: q.required,
        options: q.columns!,
      }));

    default:
      console.warn(`Unknown question type: ${q.type}, defaulting to text`);
      return {
        type: 'text',
        title: q.title,
        required: q.required,
        paragraph: false,
      };
  }
}

export async function yamlToForm(yamlPath: string): Promise<string> {
  const content = fs.readFileSync(yamlPath, 'utf8');
  const form: YamlForm = yaml.parse(content);

  const items: FormItem[] = [];

  // Helper to add questions from a list
  const addQuestions = (questions: YamlQuestion[]) => {
    for (const q of questions) {
      const converted = convertQuestion(q);
      if (Array.isArray(converted)) {
        items.push(...converted);
      } else {
        items.push(converted);
      }
    }
  };

  if (form.pages) {
    // Multi-page form with actual page breaks
    for (let i = 0; i < form.pages.length; i++) {
      const page = form.pages[i];

      // Add page break before each page (except the first one)
      if (i > 0) {
        items.push({
          type: 'pageBreak',
          title: page.title,
          description: page.description,
        });
      }

      addQuestions(page.questions);
    }
  } else if (form.sections) {
    // Visual sections (no page breaks, just headers)
    for (const section of form.sections) {
      items.push({
        type: 'text',
        title: `📋 ${section.title}`,
        paragraph: true,
        required: false,
      });

      addQuestions(section.questions);
    }
  } else if (form.questions) {
    // Flat list of questions
    addQuestions(form.questions);
  }

  const formConfig: FormConfig = {
    title: form.title,
    description: form.description,
    items,
  };

  const generator = new GoogleFormsGenerator();
  await generator.authenticate();

  console.log(`Creating form "${form.title}" with ${items.length} items...`);
  const formId = await generator.createForm(formConfig);

  return formId;
}

// CLI usage
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: npx ts-node src/yaml-to-form.ts <path-to-yaml>');
    console.log('Example: npx ts-node src/yaml-to-form.ts examples/monfort-questionnaire.yaml');
    process.exit(1);
  }

  const yamlPath = args[0];

  if (!fs.existsSync(yamlPath)) {
    console.error(`File not found: ${yamlPath}`);
    process.exit(1);
  }

  try {
    const formId = await yamlToForm(yamlPath);
    console.log(`\n✓ Form created successfully!`);
    console.log(`\nEdit URL: https://docs.google.com/forms/d/${formId}/edit`);
    console.log(`View URL: https://docs.google.com/forms/d/${formId}/viewform`);
  } catch (error) {
    console.error('Error creating form:', error);
    process.exit(1);
  }
}

main();
