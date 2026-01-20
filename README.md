# Google Forms Generator

Generate Google Forms programmatically from YAML files or TypeScript using the Google Forms API.

## Features

- Create forms from YAML configuration files
- Multi-page forms with page breaks
- Visual sections for organizing questions
- Grid/matrix questions (native support)
- Form settings (email collection)
- Supported question types: text, paragraph, multiple choice, checkbox, dropdown, scale, date, grid, checkboxGrid

## Setup

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note your project ID

### 2. Enable the Google Forms API

1. Go to [APIs & Services > Library](https://console.cloud.google.com/apis/library)
2. Search for "Google Forms API"
3. Click **Enable**

### 3. Configure OAuth Consent Screen

1. Go to [APIs & Services > OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent)
2. Select **External** (or Internal if using Google Workspace)
3. Fill in the required fields:
   - App name: `Google Forms Generator`
   - User support email: your email
   - Developer contact: your email
4. Click **Save and Continue**
5. On Scopes page, click **Add or Remove Scopes**
6. Add these scopes:
   - `https://www.googleapis.com/auth/forms.body`
   - `https://www.googleapis.com/auth/forms.responses.readonly`
7. Click **Save and Continue**
8. Add your email as a test user
9. Click **Save and Continue**

### 4. Create OAuth 2.0 Credentials

1. Go to [APIs & Services > Credentials](https://console.cloud.google.com/apis/credentials)
2. Click **Create Credentials** > **OAuth client ID**
3. Select **Desktop app** as application type
4. Name it (e.g., `Forms Generator CLI`)
5. Click **Create**
6. Click **Download JSON**
7. Save the file as `credentials.json` in this project's root directory

## Installation

```bash
npm install
```

## Usage

### Generate a form from YAML

```bash
npm run generate -- examples/multi-page-survey.yaml
```

On first run, you'll be prompted to:
1. Visit a URL in your browser
2. Authorize the app
3. Copy the authorization code back to the terminal

After authorization, a `token.json` file is created and you won't need to re-authorize.

### YAML Configuration

#### Basic Structure

```yaml
title: My Survey
description: Please fill out this survey

# Choose one of: pages, sections, or questions

# Option 1: Multi-page form with page breaks
pages:
  - title: Page 1
    questions:
      - type: text
        title: Your name

# Option 2: Visual sections (no page breaks)
sections:
  - title: Section 1
    questions:
      - type: text
        title: Your name

# Option 3: Flat list of questions
questions:
  - type: text
    title: Your name
```

#### Form Settings

```yaml
title: My Survey
settings:
  collectEmail: true           # Collect respondent email (verified or input)
```

Note: `confirmationMessage` is not supported by the Google Forms API.

### Supported Question Types

| Type | Description | Properties |
|------|-------------|------------|
| `text` | Short text answer | `required` |
| `paragraph` | Long text answer | `required` |
| `multipleChoice` | Single selection (radio) | `required`, `options` |
| `checkbox` | Multiple selection | `required`, `options` |
| `dropdown` | Dropdown menu | `required`, `options` |
| `scale` | Linear scale | `required`, `scale.min`, `scale.max`, `scale.minLabel`, `scale.maxLabel` |
| `date` | Date picker | `required`, `includeTime` |
| `grid` | Matrix with radio buttons | `required`, `rows`, `columns` |
| `checkboxGrid` | Matrix with checkboxes | `required`, `rows`, `columns` |
| `fileUpload` | File upload (**not supported - see limitations**) | - |

### Examples

#### Multiple Choice

```yaml
- type: multipleChoice
  title: Favorite color
  required: true
  options:
    - Red
    - Blue
    - Green
    - value: Other
      isOther: true
```

#### Scale

```yaml
- type: scale
  title: Rate your experience
  scale:
    min: 1
    max: 10
    minLabel: Poor
    maxLabel: Excellent
```

#### Grid Question

```yaml
- type: grid
  title: Rate each feature
  rows:
    - Ease of use
    - Performance
    - Documentation
  columns:
    - Poor
    - Fair
    - Good
    - Excellent
```

### Programmatic Usage

```typescript
import GoogleFormsGenerator, { FormConfig } from './src/index';

const generator = new GoogleFormsGenerator();
await generator.authenticate();

const config: FormConfig = {
  title: 'My Survey',
  description: 'Please fill out this survey',
  settings: {
    collectEmail: 'verified',
  },
  items: [
    {
      type: 'text',
      title: 'What is your name?',
      required: true,
    },
    {
      type: 'multipleChoice',
      title: 'Favorite color?',
      options: ['Red', 'Blue', 'Green'],
    },
  ],
};

const formId = await generator.createForm(config);
console.log(`Form URL: https://docs.google.com/forms/d/${formId}/viewform`);
```

## API Reference

### `GoogleFormsGenerator`

#### Methods

- `authenticate()` - Authenticate with Google OAuth
- `createForm(config)` - Create a new form
- `getForm(formId)` - Get form details
- `getResponses(formId)` - Get form responses
- `deleteQuestion(formId, index)` - Delete a question

## Files

- `credentials.json` - OAuth credentials (you create this, gitignored)
- `token.json` - Auth token (auto-generated, gitignored)

## Limitations

The following features are **not available** via the Google Forms API:
- **File upload questions** - cannot be created via API, must be added manually in UI
- **Text validation** (number, length, regex) - must be set manually in UI
- **Confirmation message** - must be set manually in UI
- Progress bar (must be set manually in UI)
- Response limit per user (must be set manually in UI)
- Conditional branching / goToSection (limited API support)

## License

MIT
