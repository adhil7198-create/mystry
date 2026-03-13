import { QUESTIONS, MCQBank, MatchBank, AssertionReasonBank, SuperfinalBank } from './src/js/data/questions.js';

console.log('--- COUNTS ---');
console.log('Total:', QUESTIONS.length);
console.log('MCQBank:', MCQBank.length);
console.log('MatchBank:', MatchBank.length);
console.log('ARBank:', AssertionReasonBank.length);
console.log('SuperfinalBank:', SuperfinalBank.length);

console.log('--- MODULES ---');
const modules = {};
QUESTIONS.forEach(q => { modules[q.module] = (modules[q.module] || 0) + 1; });
Object.keys(modules).forEach(m => console.log(`${m}: ${modules[m]}`));
