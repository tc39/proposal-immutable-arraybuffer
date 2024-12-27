import fs from 'node:fs';
import pathlib from 'node:path';
import { parseArgs } from 'node:util';
import { JSDOM, VirtualConsole } from 'jsdom';

const { positionals: cliArgs, values: cliOpts } = parseArgs({
  allowPositionals: true,
  options: {
    strict: { type: 'boolean' },
  },
});
if (cliArgs.length < 3) {
  const self = pathlib.relative(process.cwd(), process.argv[1]);
  console.error(`Usage: node ${self} [--strict] <template.html> <data.json> <file.html>...

{{identifier}} substrings in template.html are replaced from data.json, then
the result is inserted at the start of the body element in each file.html.`);
  process.exit(64);
}

const main = async (args, options) => {
  const [templateFile, dataFile, ...files] = args;
  const { strict } = options;

  // Evaluate the template and parse it into nodes for inserting.
  // Everything will be prepended to body elements except metadata elements,
  // which will be appended to head elements.
  // https://html.spec.whatwg.org/multipage/dom.html#metadata-content-2
  const metadataNames =
    'base, link, meta, noscript, script, style, template, title'
      .toUpperCase()
      .split(', ');
  const template = fs.readFileSync(templateFile, 'utf8');
  const { default: data } =
    await import(pathlib.resolve(dataFile), { with: { type: 'json' } });
  const namePatt = /[{][{]([\p{ID_Start}$_][\p{ID_Continue}$]*)[}][}]/gu;
  const resolved = template.replaceAll(namePatt, (_, name) => {
    if (Object.hasOwn(data, name)) return data[name];
    if (strict) throw Error(`no data for {{${name}}}`);
    return '';
  });
  const headInserts = [], bodyInserts = [];
  let insertDom = JSDOM.fragment(resolved);
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

main(cliArgs, cliOpts).catch(err => {
  console.error(err);
  process.exit(1);
});
