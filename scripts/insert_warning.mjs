import fs from 'node:fs';
import pathlib from 'node:path';
import { parseArgs } from 'node:util';
import { JSDOM, VirtualConsole } from 'jsdom';

const { positionals: cliArgs } = parseArgs({
  allowPositionals: true,
  options: {},
});
if (cliArgs.length < 3) {
  const self = pathlib.relative(process.cwd(), process.argv[1]);
  console.error(`Usage: node ${self} <template.html> <data.json> <file.html>...

{{identifier}} substrings in template.html are replaced from data.json, then
the result is inserted at the start of the body element in each file.html.`);
  process.exit(64);
}

const main = async args => {
  const [templateFile, dataFile, ...files] = args;

  // Substitute data into the template.
  const template = fs.readFileSync(templateFile, 'utf8');
  const { default: data } =
    await import(pathlib.resolve(dataFile), { with: { type: 'json' } });
  const formatErrors = [];
  const placeholderPatt = /[{][{](?:([\p{ID_Start}$_][\p{ID_Continue}$]*)[}][}]|.*?(?:[}][}]|(?=[{][{])|$))/gsu;
  const resolved = template.replaceAll(placeholderPatt, (m, name, i) => {
    if (!name) {
      const trunc = m.replace(/([^\n]{29}(?!$)|[^\n]{,29}(?=\n)).*/s, '$1…');
      formatErrors.push(Error(`bad placeholder at index ${i}: ${trunc}`));
    } else if (!Object.hasOwn(data, name)) {
      formatErrors.push(Error(`no data for ${m}`));
    }
    return data[name];
  });
  if (formatErrors.length > 0) throw AggregateError(formatErrors);

  // Parse the template into DOM nodes for appending to page <head>s (metadata
  // such as <style> elements) or prepending to page <body>s (everything else).
  // https://html.spec.whatwg.org/multipage/dom.html#metadata-content-2
  const metadataNames =
    'base, link, meta, noscript, script, style, template, title'
      .toUpperCase()
      .split(', ');
  const insertDom = JSDOM.fragment(resolved);
  const headInserts = [], bodyInserts = [];
  for (const node of insertDom.childNodes) {
    if (metadataNames.includes(node.nodeName)) headInserts.push(node);
    else bodyInserts.push(node);
  }

  // Perform the insertions, suppressing JSDOM warnings from e.g. unsupported
  // CSS features.
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('error', () => {});
  const jsdomOpts = { contentType: 'text/html; charset=utf-8', virtualConsole };
  const getInserts =
    files.length > 1 ? nodes => nodes.map(n => n.cloneNode(true)) : x => x;
  const results = await Promise.allSettled(files.map(async file => {
    let dom = await JSDOM.fromFile(file, jsdomOpts);
    const { head, body } = dom.window.document;
    if (headInserts.length > 0) head.append(...getInserts(headInserts));
    if (bodyInserts.length > 0) body.prepend(...getInserts(bodyInserts));
    fs.writeFileSync(file, dom.serialize(), 'utf8');
  }));

  const failures = results.flatMap(result =>
    result.status === 'fulfilled' ? [] : [result.reason],
  );
  if (failures.length > 0) throw AggregateError(failures);
};

main(cliArgs).catch(err => {
  console.error(err);
  process.exit(1);
});
