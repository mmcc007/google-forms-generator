import GoogleFormsGenerator, {
  FormConfig,
  FormItem,
  Question,
  FormSettings,
} from './index';
import * as fs from 'fs';
import * as path from 'path';
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
  duration?: boolean;
  ratingScale?: number;
  icon?: 'star' | 'heart' | 'thumbUp';
}

interface YamlSettings {
  collectEmail?: boolean | 'verified' | 'input';
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
  settings?: YamlSettings;
  pages?: YamlPage[];      // Multi-page form with page breaks
  sections?: YamlSection[]; // Visual sections (no page breaks)
  questions?: YamlQuestion[]; // Flat list
}

function convertQuestion(q: YamlQuestion): Question | Question[] {
  const normalizeOptions = (opts: YamlQuestion['options']) => {
    if (!opts) return [];
    return opts.map(o => {
      if (typeof o === 'string') return o;
      if (o.isOther) return { value: o.value, isOther: true };
      return o.value;
    });
  };

  switch (q.type) {
    case 'text':
      return {
        type: 'text',
        title: q.title,
        description: q.description,
        required: q.required,
        paragraph: false,
      };

    case 'paragraph':
      return {
        type: 'text',
        title: q.title,
        description: q.description,
        required: q.required,
        paragraph: true,
      };

    case 'multipleChoice':
      return {
        type: 'multipleChoice',
        title: q.title,
        description: q.description,
        required: q.required,
        options: normalizeOptions(q.options),
      };

    case 'checkbox':
      return {
        type: 'checkbox',
        title: q.title,
        description: q.description,
        required: q.required,
        options: normalizeOptions(q.options),
      };

    case 'dropdown':
      return {
        type: 'dropdown',
        title: q.title,
        description: q.description,
        required: q.required,
        options: normalizeOptions(q.options),
      };

    case 'scale':
      return {
        type: 'scale',
        title: q.title,
        description: q.description,
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
        description: q.description,
        required: q.required,
        includeTime: q.includeTime,
      };

    case 'time':
      return {
        type: 'time',
        title: q.title,
        description: q.description,
        required: q.required,
        duration: q.duration,
      };

    case 'rating':
      return {
        type: 'rating',
        title: q.title,
        description: q.description,
        required: q.required,
        ratingScale: q.ratingScale ?? 5,
        icon: q.icon ?? 'star',
      };

    case 'grid':
      if (!q.rows || !q.columns) {
        throw new Error(`Grid question "${q.title}" requires rows and columns`);
      }
      return {
        type: 'grid',
        title: q.title,
        description: q.description,
        required: q.required,
        rows: q.rows,
        columns: q.columns,
      };

    case 'checkboxGrid':
      if (!q.rows || !q.columns) {
        throw new Error(`Checkbox grid question "${q.title}" requires rows and columns`);
      }
      return {
        type: 'checkboxGrid',
        title: q.title,
        description: q.description,
        required: q.required,
        rows: q.rows,
        columns: q.columns,
      };

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

interface GenerateOptions {
  useFilename?: boolean;
  prefix?: string;
  formId?: string;
  force?: boolean;
  saveResponses?: boolean;
}

export async function yamlToForm(yamlPath: string, options: GenerateOptions = {}): Promise<string> {
  const content = fs.readFileSync(yamlPath, 'utf8');
  const form: YamlForm = yaml.parse(content);

  // Apply default settings
  const defaultSettings: YamlSettings = {
    collectEmail: false,
  };
  form.settings = { ...defaultSettings, ...form.settings };

  // Determine form title
  let title = form.title;
  if (options.useFilename) {
    title = path.basename(yamlPath, path.extname(yamlPath))
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase()); // Title case
  }
  if (options.prefix) {
    title = `${options.prefix}${title}`;
  }
  form.title = title;

  const items: FormItem[] = [];

  // Helper to add questions from a list
  const addQuestions = (questions: YamlQuestion[]) => {
    for (const q of questions) {
      if (q.type === 'title') {
        // Section header (textItem) - no input field, no page break
        items.push({
          type: 'title',
          title: q.title,
          description: q.description,
        } as FormItem);
      } else {
        const converted = convertQuestion(q);
        if (Array.isArray(converted)) {
          items.push(...converted);
        } else {
          items.push(converted);
        }
      }
    }
  };

  if (form.pages) {
    // Multi-page form with actual page breaks
    for (let i = 0; i < form.pages.length; i++) {
      const page = form.pages[i];

      if (i === 0) {
        // First page: add questions directly (same page as form title/description)
        // Optionally add a section header if the page has a title
        if (page.title) {
          items.push({
            type: 'title',
            title: page.title,
            description: page.description,
          } as FormItem);
        }
      } else {
        // Subsequent pages: add page break
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

  // Convert settings if provided
  let settings: FormSettings | undefined;
  if (form.settings) {
    settings = {};
    if (form.settings.collectEmail === true || form.settings.collectEmail === 'verified') {
      settings.collectEmail = 'verified';
    } else if (form.settings.collectEmail === 'input') {
      settings.collectEmail = 'input';
    }
  }

  const formConfig: FormConfig = {
    title: form.title,
    description: form.description,
    settings,
    items,
  };

  const generator = new GoogleFormsGenerator();
  await generator.authenticate();

  if (options.formId) {
    // Check for existing responses before updating
    const responseCount = await generator.getResponseCount(options.formId);

    if (responseCount > 0) {
      console.log(`\nWARNING: Form has ${responseCount} existing response(s).`);
      console.log('Updating will replace all questions, which may make existing responses unreadable.\n');

      if (options.saveResponses) {
        const csvPath = `${path.basename(yamlPath, path.extname(yamlPath))}-responses-${Date.now()}.csv`;
        const saved = await generator.exportResponsesCsv(options.formId, csvPath);
        console.log(`Saved ${saved} response(s) to ${csvPath}`);
      }

      if (!options.force && !options.saveResponses) {
        console.error('Aborting. Use --force to update anyway, or --save-responses to export responses first.');
        process.exit(1);
      }

      if (!options.force) {
        console.error('Responses saved. Use --force to proceed with the update, or re-run with both --save-responses --force.');
        process.exit(1);
      }
    }

    console.log(`Updating form "${form.title}" (${options.formId}) with ${items.length} items...`);
    await generator.updateForm(options.formId, formConfig);
    return options.formId;
  }

  console.log(`Creating form "${form.title}" with ${items.length} items...`);
  const formId = await generator.createForm(formConfig);

  return formId;
}

// CLI usage
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: npm run generate -- <path-to-yaml> [options]');
    console.log('');
    console.log('Options:');
    console.log('  --form-id <id>      Update an existing form instead of creating a new one');
    console.log('  --force             Skip the response warning and update anyway');
    console.log('  --save-responses    Export existing responses to CSV before updating');
    console.log('  --use-filename      Use the YAML filename as the form title');
    console.log('  --prefix <text>     Prefix the form title (e.g., --prefix "Test: ")');
    console.log('  --test              Shorthand for --prefix "Test: "');
    console.log('');
    console.log('Examples:');
    console.log('  npm run generate -- form.yaml --test');
    console.log('  npm run generate -- form.yaml --form-id <id> --force');
    console.log('  npm run generate -- form.yaml --form-id <id> --save-responses --force');
    process.exit(1);
  }

  // Parse arguments
  const options: GenerateOptions = {};
  let yamlPath = '';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--use-filename') {
      options.useFilename = true;
    } else if (arg === '--prefix' && args[i + 1]) {
      options.prefix = args[++i];
    } else if (arg === '--form-id' && args[i + 1]) {
      options.formId = args[++i];
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--save-responses') {
      options.saveResponses = true;
    } else if (arg === '--test') {
      options.prefix = 'Test: ';
    } else if (!arg.startsWith('--')) {
      yamlPath = arg;
    }
  }

  if (!yamlPath) {
    console.error('Error: No YAML file specified');
    process.exit(1);
  }

  if (!fs.existsSync(yamlPath)) {
    console.error(`File not found: ${yamlPath}`);
    process.exit(1);
  }

  try {
    const formId = await yamlToForm(yamlPath, options);
    const action = options.formId ? 'updated' : 'created';
    console.log(`\n✓ Form ${action} successfully!`);
    console.log(`\nEdit URL: https://docs.google.com/forms/d/${formId}/edit`);
    console.log(`View URL: https://docs.google.com/forms/d/${formId}/viewform`);
  } catch (error) {
    console.error('Error creating form:', error);
    process.exit(1);
  }
}

main();
