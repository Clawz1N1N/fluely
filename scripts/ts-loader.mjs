import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
function sourceFile(candidate) {
  return [candidate, `${candidate}.ts`, `${candidate}.tsx`, `${candidate}.js`,
    path.join(candidate, 'index.ts'), path.join(candidate, 'index.tsx')]
    .find(file => existsSync(file) && /\.[cm]?[jt]sx?$/.test(file));
}
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const file = sourceFile(path.join(root, 'src', specifier.slice(2)));
    if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
  }
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const file = sourceFile(fileURLToPath(new URL(specifier, context.parentURL)));
    if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && /\.tsx?$/.test(url) && !url.includes('/node_modules/')) {
    const filename = fileURLToPath(url);
    const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, sourceMap: false },
    });
    return { format: 'module', source: outputText, shortCircuit: true };
  }
  return nextLoad(url, context);
}
