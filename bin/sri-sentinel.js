#!/usr/bin/env node
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const dist = new URL('../dist/cli.mjs', import.meta.url);
const entry = fs.existsSync(dist) ? dist : new URL('../src/cli.js', import.meta.url);
await import(pathToFileURL(entry.pathname).href);
