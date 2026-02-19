import { google, forms_v1, drive_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// Types for form creation

export interface TextQuestion {
  type: 'text';
  title: string;
  description?: string;
  required?: boolean;
  paragraph?: boolean;
}

export type OptionItem = string | { value: string; isOther?: boolean };

function buildChoiceOptions(options: OptionItem[]) {
  const mapped = options.map((opt) =>
    typeof opt === 'string'
      ? { value: opt }
      : opt.isOther
        ? { isOther: true as const }
        : { value: opt.value }
  );
  // Google Forms API requires "Other" option to be last
  const regular = mapped.filter((o) => !('isOther' in o));
  const other = mapped.filter((o) => 'isOther' in o);
  return [...regular, ...other];
}

export interface MultipleChoiceQuestion {
  type: 'multipleChoice';
  title: string;
  description?: string;
  required?: boolean;
  options: OptionItem[];
}

export interface CheckboxQuestion {
  type: 'checkbox';
  title: string;
  description?: string;
  required?: boolean;
  options: OptionItem[];
}

export interface DropdownQuestion {
  type: 'dropdown';
  title: string;
  description?: string;
  required?: boolean;
  options: OptionItem[];
}

export interface ScaleQuestion {
  type: 'scale';
  title: string;
  description?: string;
  required?: boolean;
  low: number;
  high: number;
  lowLabel?: string;
  highLabel?: string;
}

export interface DateQuestion {
  type: 'date';
  title: string;
  description?: string;
  required?: boolean;
  includeTime?: boolean;
}

export interface TimeQuestion {
  type: 'time';
  title: string;
  description?: string;
  required?: boolean;
  duration?: boolean;
}

export interface RatingQuestion {
  type: 'rating';
  title: string;
  description?: string;
  required?: boolean;
  ratingScale: number;
  icon: 'star' | 'heart' | 'thumbUp';
}

export interface PageBreak {
  type: 'pageBreak';
  title: string;
  description?: string;
}

export interface SectionHeader {
  type: 'title';
  title: string;
  description?: string;
}

export interface GridQuestion {
  type: 'grid';
  title: string;
  description?: string;
  required?: boolean;
  rows: string[];
  columns: string[];
}

export interface CheckboxGridQuestion {
  type: 'checkboxGrid';
  title: string;
  description?: string;
  required?: boolean;
  rows: string[];
  columns: string[];
}

export type Question =
  | TextQuestion
  | MultipleChoiceQuestion
  | CheckboxQuestion
  | DropdownQuestion
  | ScaleQuestion
  | DateQuestion
  | TimeQuestion
  | RatingQuestion
  | GridQuestion
  | CheckboxGridQuestion;

export type FormItem = Question | PageBreak | SectionHeader;

export interface FormSettings {
  collectEmail?: 'none' | 'verified' | 'input';
}

export interface FormConfig {
  title: string;
  description?: string;
  settings?: FormSettings;
  questions?: Question[];  // Legacy: flat list of questions
  items?: FormItem[];      // New: supports questions + page breaks
}

const SCOPES = [
  'https://www.googleapis.com/auth/forms.body',
  'https://www.googleapis.com/auth/forms.responses.readonly',
  'https://www.googleapis.com/auth/drive.file',
];

const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

/**
 * Clean up text that may contain unwanted newlines from YAML parsing.
 * Single newlines (line-wrap artifacts) become spaces.
 * Double newlines (intentional paragraph breaks) are preserved.
 */
function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n\n+/g, '\0')
    .replace(/\n/g, ' ')
    .replace(/\0/g, '\n\n')
    .replace(/ {2,}/g, ' ')
    .trim();
}

export class GoogleFormsGenerator {
  private auth: OAuth2Client | null = null;
  private forms: forms_v1.Forms | null = null;
  private drive: drive_v3.Drive | null = null;

  async authenticate(): Promise<void> {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
      throw new Error(
        `credentials.json not found at ${CREDENTIALS_PATH}\n` +
          'Please download OAuth 2.0 credentials from Google Cloud Console.\n' +
          'See README.md for setup instructions.'
      );
    }

    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    const { client_secret, client_id, redirect_uris } =
      credentials.installed || credentials.web;

    const oAuth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uris[0]
    );

    // Check if we have a saved token
    if (fs.existsSync(TOKEN_PATH)) {
      const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
      oAuth2Client.setCredentials(token);
    } else {
      await this.getNewToken(oAuth2Client);
    }

    this.auth = oAuth2Client;
    this.forms = google.forms({ version: 'v1', auth: oAuth2Client });
    this.drive = google.drive({ version: 'v3', auth: oAuth2Client });
  }

  private async getNewToken(oAuth2Client: OAuth2Client): Promise<void> {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
    });

    console.log('Authorize this app by visiting this URL:\n');
    console.log(authUrl);
    console.log();

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const code = await new Promise<string>((resolve) => {
      rl.question('Enter the authorization code from the page: ', (answer) => {
        rl.close();
        resolve(answer);
      });
    });

    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    // Save the token for future use
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    console.log('Token stored to', TOKEN_PATH);
  }

  async createForm(config: FormConfig): Promise<string> {
    if (!this.forms) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }

    // Step 1: Create the form with title
    const createResponse = await this.forms.forms.create({
      requestBody: {
        info: {
          title: cleanText(config.title),
        },
      },
    });

    const formId = createResponse.data.formId;
    if (!formId) {
      throw new Error('Failed to create form - no form ID returned');
    }

    console.log(`Form created with ID: ${formId}`);

    // Step 2: Build batch update requests for description and questions
    const requests: forms_v1.Schema$Request[] = [];

    // Add description if provided
    if (config.description) {
      requests.push({
        updateFormInfo: {
          info: {
            description: cleanText(config.description),
          },
          updateMask: 'description',
        },
      });
    }

    // Add settings if provided (only emailCollectionType is supported by the API)
    if (config.settings?.collectEmail && config.settings.collectEmail !== 'none') {
      const emailType = config.settings.collectEmail === 'verified' ? 'VERIFIED' : 'RESPONDER_INPUT';
      requests.push({
        updateSettings: {
          settings: {
            emailCollectionType: emailType,
          } as any,
          updateMask: 'emailCollectionType',
        },
      });
    }

    // Add items (questions and page breaks)
    const items = config.items || config.questions || [];
    items.forEach((item, index) => {
      requests.push({
        createItem: {
          item: this.buildItem(item),
          location: { index },
        },
      });
    });

    // Step 3: Execute batch update
    if (requests.length > 0) {
      await this.forms.forms.batchUpdate({
        formId,
        requestBody: { requests },
      });
    }

    const formUrl = `https://docs.google.com/forms/d/${formId}/edit`;
    console.log(`Form URL: ${formUrl}`);

    return formId;
  }

  private buildItem(item: FormItem): forms_v1.Schema$Item {
    if (item.type === 'pageBreak') {
      return {
        title: cleanText(item.title),
        description: item.description ? cleanText(item.description) : undefined,
        pageBreakItem: {},
      };
    }
    if (item.type === 'title') {
      // textItem creates a title/description without page break
      return {
        title: cleanText(item.title),
        description: item.description ? cleanText(item.description) : undefined,
        textItem: {},
      };
    }
    return this.buildQuestionItem(item);
  }

  private buildQuestionItem(question: Question): forms_v1.Schema$Item {
    const desc = (question as any).description;
    const baseItem: forms_v1.Schema$Item = {
      title: cleanText(question.title),
      description: desc ? cleanText(desc) : undefined,
    };

    switch (question.type) {
      case 'text':
        return {
          ...baseItem,
          questionItem: {
            question: {
              required: question.required ?? false,
              textQuestion: {
                paragraph: question.paragraph ?? false,
              },
            },
          },
        };

      case 'multipleChoice':
        return {
          ...baseItem,
          questionItem: {
            question: {
              required: question.required ?? false,
              choiceQuestion: {
                type: 'RADIO',
                options: buildChoiceOptions(question.options),
              },
            },
          },
        };

      case 'checkbox':
        return {
          ...baseItem,
          questionItem: {
            question: {
              required: question.required ?? false,
              choiceQuestion: {
                type: 'CHECKBOX',
                options: buildChoiceOptions(question.options),
              },
            },
          },
        };

      case 'dropdown':
        return {
          ...baseItem,
          questionItem: {
            question: {
              required: question.required ?? false,
              choiceQuestion: {
                type: 'DROP_DOWN',
                options: buildChoiceOptions(question.options),
              },
            },
          },
        };

      case 'scale':
        return {
          ...baseItem,
          questionItem: {
            question: {
              required: question.required ?? false,
              scaleQuestion: {
                low: question.low,
                high: question.high,
                lowLabel: question.lowLabel,
                highLabel: question.highLabel,
              },
            },
          },
        };

      case 'date':
        return {
          ...baseItem,
          questionItem: {
            question: {
              required: question.required ?? false,
              dateQuestion: {
                includeTime: question.includeTime ?? false,
              },
            },
          },
        };

      case 'time':
        return {
          ...baseItem,
          questionItem: {
            question: {
              required: question.required ?? false,
              timeQuestion: {
                duration: question.duration ?? false,
              },
            } as any,
          },
        };

      case 'rating':
        const iconTypeMap = {
          star: 'STAR',
          heart: 'HEART',
          thumbUp: 'THUMB_UP',
        };
        return {
          ...baseItem,
          questionItem: {
            question: {
              required: question.required ?? false,
              ratingQuestion: {
                ratingScaleLevel: question.ratingScale,
                iconType: iconTypeMap[question.icon] || 'STAR',
              },
            } as any,
          },
        };

      case 'grid':
        return {
          ...baseItem,
          questionGroupItem: {
            grid: {
              columns: {
                type: 'RADIO',
                options: question.columns.map((col) => ({ value: col })),
              },
            },
            questions: question.rows.map((row) => ({
              required: question.required ?? false,
              rowQuestion: { title: row },
            })),
          },
        };

      case 'checkboxGrid':
        return {
          ...baseItem,
          questionGroupItem: {
            grid: {
              columns: {
                type: 'CHECKBOX',
                options: question.columns.map((col) => ({ value: col })),
              },
            },
            questions: question.rows.map((row) => ({
              required: question.required ?? false,
              rowQuestion: { title: row },
            })),
          },
        };

      default:
        throw new Error(`Unknown question type: ${(question as Question).type}`);
    }
  }

  async updateForm(formId: string, config: FormConfig): Promise<string> {
    if (!this.forms) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }

    // Fetch the existing form to get current item count
    const existingForm = await this.getForm(formId);
    const existingItems = existingForm.items || [];

    const requests: forms_v1.Schema$Request[] = [];

    // Delete existing items in reverse order to avoid index shifting
    for (let i = existingItems.length - 1; i >= 0; i--) {
      requests.push({
        deleteItem: {
          location: { index: i },
        },
      });
    }

    // Update form title and description
    requests.push({
      updateFormInfo: {
        info: {
          title: cleanText(config.title),
          description: config.description ? cleanText(config.description) : '',
        },
        updateMask: 'title,description',
      },
    });

    // Always reset email collection setting on update
    const collectEmail = config.settings?.collectEmail;
    let emailType = 'DO_NOT_COLLECT';
    if (collectEmail === 'verified') {
      emailType = 'VERIFIED';
    } else if (collectEmail === 'input') {
      emailType = 'RESPONDER_INPUT';
    }
    requests.push({
      updateSettings: {
        settings: {
          emailCollectionType: emailType,
        } as any,
        updateMask: 'emailCollectionType',
      },
    });

    // Create all new items
    const items = config.items || config.questions || [];
    items.forEach((item, index) => {
      requests.push({
        createItem: {
          item: this.buildItem(item),
          location: { index },
        },
      });
    });

    // Execute as one atomic batchUpdate call
    if (requests.length > 0) {
      await this.forms.forms.batchUpdate({
        formId,
        requestBody: { requests },
      });
    }

    console.log(`Form updated: ${formId}`);
    return formId;
  }

  async getForm(formId: string): Promise<forms_v1.Schema$Form> {
    if (!this.forms) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }

    const response = await this.forms.forms.get({ formId });
    return response.data;
  }

  async getResponses(formId: string): Promise<forms_v1.Schema$ListFormResponsesResponse> {
    if (!this.forms) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }

    const response = await this.forms.forms.responses.list({ formId });
    return response.data;
  }

  async getResponseCount(formId: string): Promise<number> {
    const data = await this.getResponses(formId);
    return data.responses?.length ?? 0;
  }

  async exportResponsesCsv(formId: string, outputPath: string): Promise<number> {
    const form = await this.getForm(formId);
    const responsesData = await this.getResponses(formId);
    const responses = responsesData.responses || [];

    if (responses.length === 0) {
      return 0;
    }

    // Build question ID -> title mapping from form items
    const questionMap = new Map<string, string>();
    for (const item of form.items || []) {
      if (item.questionItem?.question?.questionId) {
        questionMap.set(item.questionItem.question.questionId, item.title || '');
      }
      if (item.questionGroupItem?.questions) {
        for (const q of item.questionGroupItem.questions) {
          if (q.questionId) {
            const rowTitle = q.rowQuestion?.title || '';
            questionMap.set(q.questionId, `${item.title || ''} [${rowTitle}]`);
          }
        }
      }
    }

    // Collect all question IDs across all responses (preserving order)
    const questionIds: string[] = [];
    const seenIds = new Set<string>();
    for (const resp of responses) {
      for (const qId of Object.keys(resp.answers || {})) {
        if (!seenIds.has(qId)) {
          seenIds.add(qId);
          questionIds.push(qId);
        }
      }
    }

    // Build CSV
    const escapeCsv = (value: string): string => {
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    const headers = [
      'Timestamp',
      ...questionIds.map((id) => escapeCsv(questionMap.get(id) || id)),
    ];

    const rows = responses.map((resp) => {
      const timestamp = resp.lastSubmittedTime || resp.createTime || '';
      const values = questionIds.map((qId) => {
        const answer = resp.answers?.[qId];
        if (!answer?.textAnswers?.answers) return '';
        return answer.textAnswers.answers.map((a) => a.value || '').join('; ');
      });
      return [escapeCsv(timestamp), ...values.map(escapeCsv)];
    });

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    fs.writeFileSync(outputPath, csv, 'utf8');

    return responses.length;
  }

  async deleteQuestion(formId: string, questionIndex: number): Promise<void> {
    if (!this.forms) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }

    // First get the form to find the item ID
    const form = await this.getForm(formId);
    const items = form.items || [];

    if (questionIndex >= items.length) {
      throw new Error(`Question index ${questionIndex} out of range`);
    }

    const itemId = items[questionIndex].itemId;
    if (!itemId) {
      throw new Error('Item ID not found');
    }

    await this.forms.forms.batchUpdate({
      formId,
      requestBody: {
        requests: [
          {
            deleteItem: {
              location: { index: questionIndex },
            },
          },
        ],
      },
    });
  }

  async listForms(): Promise<{ id: string; name: string; createdTime: string }[]> {
    if (!this.drive) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }

    const response = await this.drive.files.list({
      q: "mimeType='application/vnd.google-apps.form'",
      fields: 'files(id, name, createdTime)',
      orderBy: 'createdTime desc',
    });

    return (response.data.files || []).map((f) => ({
      id: f.id || '',
      name: f.name || '',
      createdTime: f.createdTime || '',
    }));
  }

  async deleteForm(formId: string): Promise<void> {
    if (!this.drive) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }
    await this.drive.files.delete({ fileId: formId });
  }
}

export default GoogleFormsGenerator;
