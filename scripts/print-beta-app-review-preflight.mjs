#!/usr/bin/env node
/**
 * Print docs/beta-app-review-preflight.md.
 * No network, no EAS, no App Store Connect calls.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const docPath = join(root, 'docs', 'beta-app-review-preflight.md');
const text = readFileSync(docPath, 'utf8');
process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
