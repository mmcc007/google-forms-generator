import GoogleFormsGenerator from './index';

async function main() {
  const formId = process.argv[2];
  if (!formId) {
    console.error('Usage: ts-node src/dump-responses.ts <form-id>');
    process.exit(1);
  }

  const g = new GoogleFormsGenerator();
  await g.authenticate();
  const form = await g.getForm(formId);
  const responsesData = await g.getResponses(formId);
  const responses = responsesData.responses || [];

  // questionId -> title
  const qmap = new Map<string, string>();
  for (const item of form.items || []) {
    if (item.questionItem?.question?.questionId) {
      qmap.set(item.questionItem.question.questionId, item.title || 'Untitled');
    }
    if (item.questionGroupItem?.questions) {
      for (const q of item.questionGroupItem.questions) {
        if (q.questionId) {
          const row = (q as any).rowQuestion?.title;
          qmap.set(q.questionId, (item.title || 'Untitled') + (row ? ` — ${row}` : ''));
        }
      }
    }
  }

  console.log(`Form: ${form.info?.title || formId}`);
  console.log(`Total responses: ${responses.length}\n`);

  responses.sort((a: any, b: any) =>
    (a.lastSubmittedTime || '').localeCompare(b.lastSubmittedTime || ''));

  for (const r of responses as any[]) {
    console.log('================================================================');
    console.log(`Respondent: ${r.respondentEmail || '(anonymous)'}   Submitted: ${r.lastSubmittedTime || '?'}`);
    for (const [qid, ans] of Object.entries(r.answers || {})) {
      const title = qmap.get(qid) || qid;
      const vals = ((ans as any).textAnswers?.answers || [])
        .map((x: any) => x.value)
        .filter((v: string) => v !== '');
      console.log(`  • ${title}: ${vals.join(' | ') || '(blank)'}`);
    }
    console.log('');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
