import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dirs = ['configs/catalog/software', 'configs/catalog/combos'];
let total = 0, ok4k = 0;
for (const d of dirs) {
    const full = path.join(root, d);
    for (const f of fs.readdirSync(full).filter(f => f.endsWith('.md'))) {
        const c = fs.readFileSync(path.join(full, f), 'utf8');
        total++;
        if (c.length > 4000) ok4k++;
    }
}
console.log(`MD: total=${total}, >4000bytes=${ok4k}`);

const pb = path.join(root, 'configs/catalog/playbooks');
const yamls = fs.readdirSync(pb).filter(f => f.endsWith('.yaml'));
const varsj = fs.readdirSync(pb).filter(f => f.endsWith('.vars.json'));
console.log(`Playbooks: yamls=${yamls.length}, vars=${varsj.length}`);
