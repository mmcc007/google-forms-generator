import GoogleFormsGenerator from './index';

interface ValidationIssue {
  responseId: string;
  respondentEmail?: string;
  questionTitle: string;
  issue: string;
  submittedAt: string;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: npm run validate -- <form-id>');
    console.log('');
    console.log('Validates form responses and flags empty "Other" selections.');
    console.log('');
    console.log('Example: npm run validate -- 1PgCgSFiejFfQw33UkK8oBmbocxrz00amqNRqEYftbGY');
    process.exit(1);
  }

  const formId = args[0];

  const generator = new GoogleFormsGenerator();
  await generator.authenticate();

  console.log('Fetching form structure...');
  const form = await generator.getForm(formId);

  console.log('Fetching responses...');
  const responsesData = await generator.getResponses(formId);
  const responses = responsesData.responses || [];

  if (responses.length === 0) {
    console.log('\nNo responses found.');
    return;
  }

  console.log(`\nFound ${responses.length} response(s). Validating...\n`);

  // Build a map of questionId -> question title
  const questionMap = new Map<string, string>();
  for (const item of form.items || []) {
    if (item.questionItem?.question?.questionId) {
      questionMap.set(item.questionItem.question.questionId, item.title || 'Unknown');
    }
    if (item.questionGroupItem?.questions) {
      for (const q of item.questionGroupItem.questions) {
        if (q.questionId) {
          questionMap.set(q.questionId, item.title || 'Unknown');
        }
      }
    }
  }

  const issues: ValidationIssue[] = [];

  for (const response of responses) {
    const responseId = response.responseId || 'unknown';
    const respondentEmail = response.respondentEmail ?? undefined;
    const submittedAt = response.lastSubmittedTime || 'unknown';

    for (const [questionId, answer] of Object.entries(response.answers || {})) {
      const questionTitle = questionMap.get(questionId) || 'Unknown question';
      const textAnswers = (answer as any).textAnswers?.answers || [];

      for (const textAnswer of textAnswers) {
        const value = textAnswer.value || '';

        // Check for empty "Other" - Google Forms marks these with a specific pattern
        // When "Other" is selected but empty, the value is empty string
        // When "Other" is selected with text, the value is the custom text
        // We need to check if "Other" was selected by looking at the answer structure

        // For choice questions, if isOther was selected, check if text is empty
        if ((answer as any).textAnswers && value === '') {
          // This could be an empty "Other" field
          // We flag responses where a text answer field is empty
          issues.push({
            responseId,
            respondentEmail,
            questionTitle,
            issue: 'Empty text response (possibly empty "Other" selection)',
            submittedAt,
          });
        }
      }
    }
  }

  if (issues.length === 0) {
    console.log('✓ All responses valid. No empty "Other" selections found.');
  } else {
    console.log(`Found ${issues.length} potential issue(s):\n`);
    for (const issue of issues) {
      console.log(`Response: ${issue.responseId}`);
      if (issue.respondentEmail) {
        console.log(`  Email: ${issue.respondentEmail}`);
      }
      console.log(`  Question: ${issue.questionTitle}`);
      console.log(`  Issue: ${issue.issue}`);
      console.log(`  Submitted: ${issue.submittedAt}`);
      console.log('');
    }
  }
}

main().catch(console.error);
