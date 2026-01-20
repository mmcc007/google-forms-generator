import GoogleFormsGenerator, { FormConfig } from './index';

async function main() {
  const generator = new GoogleFormsGenerator();

  try {
    // Authenticate with Google
    await generator.authenticate();

    // Define your form configuration
    const formConfig: FormConfig = {
      title: 'Customer Feedback Survey',
      description: 'Please take a moment to share your feedback with us.',
      questions: [
        {
          type: 'text',
          title: 'What is your name?',
          required: true,
        },
        {
          type: 'text',
          title: 'Email address',
          required: true,
        },
        {
          type: 'multipleChoice',
          title: 'How did you hear about us?',
          required: true,
          options: [
            'Search Engine',
            'Social Media',
            'Friend/Family',
            'Advertisement',
            'Other',
          ],
        },
        {
          type: 'scale',
          title: 'How satisfied are you with our service?',
          required: true,
          low: 1,
          high: 5,
          lowLabel: 'Very Unsatisfied',
          highLabel: 'Very Satisfied',
        },
        {
          type: 'checkbox',
          title: 'Which features do you use most?',
          required: false,
          options: [
            'Dashboard',
            'Reports',
            'Analytics',
            'Integrations',
            'API Access',
          ],
        },
        {
          type: 'dropdown',
          title: 'How often do you use our product?',
          required: true,
          options: ['Daily', 'Weekly', 'Monthly', 'Rarely'],
        },
        {
          type: 'text',
          title: 'Any additional comments or suggestions?',
          required: false,
          paragraph: true,
        },
      ],
    };

    // Create the form
    const formId = await generator.createForm(formConfig);
    console.log(`\nSuccess! Form created with ID: ${formId}`);
    console.log(`Edit URL: https://docs.google.com/forms/d/${formId}/edit`);
    console.log(`View URL: https://docs.google.com/forms/d/${formId}/viewform`);

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
