import fs from 'fs';
import path from 'path';

const walkSync = function(dir, filelist) {
  const files = fs.readdirSync(dir);
  filelist = filelist || [];
  files.forEach(function(file) {
    if (fs.statSync(path.join(dir, file)).isDirectory()) {
      filelist = walkSync(path.join(dir, file), filelist);
    }
    else {
      filelist.push(path.join(dir, file));
    }
  });
  return filelist;
};

const srcDir = path.join(process.cwd(), 'src');
const files = walkSync(srcDir, []).filter(f => f.endsWith('.tsx') || f.endsWith('.ts'));

let totalReplacements = 0;
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  if (content.includes('emerald')) {
    const updated = content.replace(/emerald/g, 'maroon');
    fs.writeFileSync(file, updated, 'utf8');
    console.log(`Updated ${file}`);
    totalReplacements++;
  }
});

console.log(`Updated ${totalReplacements} files.`);
