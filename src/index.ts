import { google, forms_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// Types for form creation
export interface TextQuestion {
  type: 'text';
  title: string;
  required?: boolean;
  paragraph?: boolean;
}

export interface MultipleChoiceQuestion {
  type: 'multipleChoice';
  title: string;
  required?: boolean;
  options: string[];
}

export interface CheckboxQuestion {
  type: 'checkbox';
  title: string;
  required?: boolean;
  options: string[];
}

export interface DropdownQuestion {
  type: 'dropdown';
  title: string;
  required?: boolean;
  options: string[];
}

export interface ScaleQuestion {
  type: 'scale';
  title: string;
  required?: boolean;
  low: number;
  high: number;
  lowLabel?: string;
  highLabel?: string;
}

export interface DateQuestion {
  type: 'date';
  title: string;
  required?: boolean;
  includeTime?: boolean;
}

export interface PageBreak {
  type: 'pageBreak';
  title: string;
  description?: string;
}

export type Question =
  | TextQuestion
  | MultipleChoiceQuestion
  | CheckboxQuestion
  | DropdownQuestion
  | ScaleQuestion
  | DateQuestion;

export type FormItem = Question | PageBreak;

export interface FormConfig {
  title: string;
  description?: string;
  questions?: Question[];  // Legacy: flat list of questions
  items?: FormItem[];      // New: supports questions + page breaks
}

const SCOPES = [
  'https://www.googleapis.com/auth/forms.body',
  'https://www.googleapis.com/auth/forms.responses.readonly',
];

const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

export class GoogleFormsGenerator {
  private auth: OAuth2Client | null = null;
  private forms: forms_v1.Forms | null = null;

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
          title: config.title,
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
            description: config.description,
          },
          updateMask: 'description',
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
        title: item.title,
        description: item.description,
        pageBreakItem: {},
      };
    }
    return this.buildQuestionItem(item);
  }

  private buildQuestionItem(question: Question): forms_v1.Schema$Item {
    const baseItem: forms_v1.Schema$Item = {
      title: question.title,
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
                options: question.options.map((opt) => ({ value: opt })),
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
                options: question.options.map((opt) => ({ value: opt })),
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
                options: question.options.map((opt) => ({ value: opt })),
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

      default:
        throw new Error(`Unknown question type: ${(question as Question).type}`);
    }
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
}

export default GoogleFormsGenerator;
