// Builds src/data/words.json, the word-of-the-day list (DESIGN §10), from the
// HSK 1–3 lists in github.com/drkameleon/complete-hsk-vocabulary (MIT), whose
// definitions come from CC-CEDICT (CC BY-SA 4.0). Run: node scripts/build-words.js
import fs from 'node:fs';

const SOURCE = 'https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/wordlists/exclusive/old';

// Many characters list a surname or rare reading first ("Gāo: surname Gao").
// Take the lowercase reading with the most real meanings, and its first
// meaning that isn't a surname, abbreviation or variant spelling. The data
// doesn't mark which reading HSK means, so the words where this still picks a
// rare reading or sense were checked by hand and are set here.
const ignored = meaning => /surname|variant of|abbr\. for|^used in|^\(onom\.\)/i.test(meaning);
const CHECKED = {
    年: ['nián', 'year'],
    告诉: ['gào su', 'to tell; to inform'],
    着: ['zhe', 'particle for an action in progress'],
    啊: ['a', 'particle of affirmation or surprise'],
    长: ['cháng', 'long'],
    妻子: ['qī zi', 'wife'],
    云: ['yún', 'cloud'],
    胖: ['pàng', 'fat; plump'],
    吗: ['ma', 'question particle for yes-no questions'],
    冬: ['dōng', 'winter'],
    没: ['méi', 'have not; not'],
    故事: ['gù shi', 'story; tale'],
    教: ['jiāo', 'to teach'],
    里: ['lǐ', 'inside; in'],
    关: ['guān', 'to close; to shut'],
    张: ['zhāng', 'classifier for flat things (paper, tables, tickets)'],
    得: ['de', 'particle linking a verb to its result'],
    祝: ['zhù', 'to wish (someone well)'],
    多少: ['duō shao', 'how many; how much'],
    别: ['bié', "don't"],
    哪: ['nǎ', 'which'],
};
function everyday(entry) {
    if (CHECKED[entry.s]) {
        const [pinyin, definition] = CHECKED[entry.s];
        return { pinyin, definition };
    }
    const score = form => (/^[A-Z]/.test(form.i.y) ? 0 : 100) + form.m.filter(m => !ignored(m)).length;
    const form = [...entry.f].sort((a, b) => score(b) - score(a))[0];
    return { pinyin: form.i.y, definition: form.m.find(m => !ignored(m)) ?? form.m[0] };
}

const words = [];
for (const level of [1, 2, 3]) {
    const res = await fetch(`${SOURCE}/${level}.min.json`);
    if (!res.ok) throw new Error(`HSK ${level}: ${res.status}`);
    for (const entry of await res.json()) {
        words.push({ hanzi: entry.s, ...everyday(entry), level });
    }
}

// a fixed shuffle, so consecutive days don't bring alphabetically neighbouring
// words, and rebuilding gives the same order
let seed = 20260930;
const random = () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
};
for (let i = words.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [words[i], words[j]] = [words[j], words[i]];
}

fs.writeFileSync(new URL('../src/data/words.json', import.meta.url), JSON.stringify(words, null, 1) + '\n');
console.log(`Wrote ${words.length} words.`);
