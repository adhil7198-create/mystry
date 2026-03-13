import { QUESTIONS } from './src/js/data/questions.js';

console.log('Total QUESTIONS:', QUESTIONS.length);

const tags = QUESTIONS.reduce((acc, q) => {
    acc[q.tag] = (acc[q.tag] || 0) + 1;
    return acc;
}, {});

console.log('Tags:', tags);

const modules = QUESTIONS.reduce((acc, q) => {
    acc[q.module] = (acc[q.module] || 0) + 1;
    return acc;
}, {});

console.log('Modules:', JSON.stringify(modules, null, 2));

const SuperfinalBank = QUESTIONS.filter(q => q.tag === 'Superfinal');
console.log('SuperfinalBank size:', SuperfinalBank.length);

const MCQBank = QUESTIONS.filter(q => q.tag !== 'Match' && q.tag !== 'Assertion-Reason' && q.tag !== 'Superfinal');
console.log('MCQBank size:', MCQBank.length);

const MatchBank = QUESTIONS.filter(q => q.tag === 'Match');
console.log('MatchBank size:', MatchBank.length);

const AssertionReasonBank = QUESTIONS.filter(q => q.tag === 'Assertion-Reason');
console.log('AssertionReasonBank size:', AssertionReasonBank.length);
