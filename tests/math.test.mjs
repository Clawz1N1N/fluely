import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import React from 'react';
import { renderToPipeableStream } from 'react-dom/server';
import { Markdown } from '../src/components/Markdown/index.tsx';

// Exercise the product renderer, including Streamdown's lazy code renderer.
// Streamdown's streaming mode fills blocks in browser effects, which do not
// run during SSR. The pure Markdown component supplies the real content and
// plugin options; only the downstream lifecycle mode is changed to static.
// Waiting for all Suspense work avoids mistaking a code-loading placeholder
// for literal code successfully preserved by the Markdown component.
async function renderMarkdown(markdown) {
  return new Promise((resolve, reject) => {
    const output = new PassThrough();
    let html = '';
    let renderer;
    const timeout = setTimeout(() => {
      renderer.abort();
      reject(new Error('Markdown server rendering timed out'));
    }, 10000);
    output.setEncoding('utf8');
    output.on('data', chunk => { html += chunk; });
    output.on('end', () => { clearTimeout(timeout); resolve(html); });
    output.on('error', error => { clearTimeout(timeout); reject(error); });
    const element = Markdown({ children: markdown });
    renderer = renderToPipeableStream(React.cloneElement(element, { mode: 'static' }), {
      onAllReady() { renderer.pipe(output); },
      onError(error) { clearTimeout(timeout); reject(error); },
    });
  });
}

for (const [name, markdown] of [
  ['single dollar inline', 'Розв’язок: $x^2$'],
  ['double dollar display', 'Розв’язок:\n\n$$\nx^2\n$$'],
  ['backslash parentheses inline', String.raw`Розв’язок: \(x^2\)`],
  ['backslash brackets display', String.raw`Розв’язок:

\[x^2\]`],
]) {
  test(`Markdown renders ${name} through KaTeX`, async () => {
    const html = await renderMarkdown(markdown);
    assert.match(html, /class="katex"/, 'formula must render through KaTeX');
    assert.match(html, /<annotation encoding="application\/x-tex">x\^2<\/annotation>/,
      'rendered formula must contain the original expression');
    assert.doesNotMatch(html, /class="katex-error"/);
    if (name.includes('display')) assert.match(html, /class="katex-display"/,
      'display delimiters must retain display math layout');
  });
}

const codeMath = String.raw`$x^2$ $$x^2$$ \(x^2\) \[x^2\]`;

test('Markdown preserves all math delimiters inside inline code', async () => {
  const html = await renderMarkdown(`Приклад: \`${codeMath}\``);
  assert.doesNotMatch(html, /class="katex"/);
  const code = html.match(/<code\b[^>]*>([\s\S]*?)<\/code>/)?.[1];
  assert.ok(code, 'inline code must remain a code element');
  assert.equal(code.replace(/<[^>]*>/g, ''), codeMath);
});

test('Markdown preserves all math delimiters inside fenced code', async () => {
  const html = await renderMarkdown(`\`\`\`\n${codeMath}\n\`\`\``);
  assert.doesNotMatch(html, /class="katex"/);
  assert.match(html, /data-streamdown="code-block"/,
    'fenced code renderer must finish loading');
  const text = html.replace(/<[^>]*>/g, '');
  assert.ok(text.includes(codeMath), 'fenced code contents must remain literal');
});

test('Markdown preserves math inside tilde fences and multi-backtick inline spans', async () => {
  const html = await renderMarkdown(`Приклад: \`\`${codeMath} \` код\`\`\n\n~~~~\n${codeMath}\n~~~~`);
  assert.doesNotMatch(html, /class="katex"/);
  assert.ok(html.replace(/<[^>]*>/g, '').includes(codeMath));
});

test('model HTML stays sanitized before trusted math rendering',async()=>{
  const html=await renderMarkdown('<script>alert(1)</script><img src="x" onerror="alert(2)"><a href="javascript:alert(3)">link</a>\n\n$x^2$');
  assert.doesNotMatch(html,/<script|onerror=|javascript:/);
  assert.match(html,/class="katex"/);
});
