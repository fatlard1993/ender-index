import { writeLists } from './crawl';

const { records, packs } = await writeLists();

console.log(`Listed ${records.length} repositories and ${packs.length} packs for the site`);
