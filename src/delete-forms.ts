import GoogleFormsGenerator from './index';
import * as readline from 'readline';

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

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question('Enter form numbers to delete (comma-separated), "all", or press Enter to cancel: ', async (answer) => {
    rl.close();

    if (!answer.trim()) {
      console.log('No forms deleted.');
      return;
    }

    let toDelete: typeof forms = [];
    if (answer.toLowerCase() === 'all') {
      toDelete = forms;
    } else {
      const indices = answer.split(',').map((s) => parseInt(s.trim()) - 1);
      toDelete = indices.filter((i) => i >= 0 && i < forms.length).map((i) => forms[i]);
    }

    if (toDelete.length === 0) {
      console.log('No valid forms selected.');
      return;
    }

    console.log(`\nDeleting ${toDelete.length} form(s)...`);
    for (const form of toDelete) {
      try {
        await generator.deleteForm(form.id);
        console.log(`Deleted: ${form.name}`);
      } catch (err) {
        console.error(`Failed to delete ${form.name}:`, err);
      }
    }
  });
}

main();
