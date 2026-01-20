import GoogleFormsGenerator from './index';

async function main() {
  const generator = new GoogleFormsGenerator();
  await generator.authenticate();

  console.log('Fetching forms...\n');
  const forms = await generator.listForms();

  if (forms.length === 0) {
    console.log('No forms found.');
    return;
  }

  console.log(`Found ${forms.length} Google Forms:\n`);
  forms.forEach((form, i) => {
    console.log(`${i + 1}. ${form.name}`);
    console.log(`   ID: ${form.id}`);
    console.log(`   Created: ${form.createdTime}\n`);
  });
}

main();
