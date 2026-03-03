/**
 * Parse NEC2 .nec card deck files into ImportResult.
 *
 * Supports cards: CM, SY, CE, GW, GN, EX, LD, TL, FR, EN
 * SY card expression evaluator uses a recursive descent parser
 * supporting +, -, *, /, ** (and ^ as alias), parentheses,
 * unary +/-, numeric literals (including .15, -.15, 1e3),
 * and symbol lookup (case-insensitive).
 */

import type { ImportResult } from "../types";

// ---- Recursive descent expression parser ----

interface TokenStream {
  input: string;
  pos: number;
}

type Token =
  | { type: "number"; value: number }
  | { type: "ident"; value: string }
  | { type: "op"; value: string }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "eof" };

function charAt(s: string, i: number): string {
  return i < s.length ? s[i]! : "";
}

function skipWhitespace(ts: TokenStream): void {
  while (ts.pos < ts.input.length && /\s/.test(charAt(ts.input, ts.pos))) {
    ts.pos++;
  }
}

function nextToken(ts: TokenStream): Token {
  skipWhitespace(ts);
  if (ts.pos >= ts.input.length) return { type: "eof" };

  const ch = charAt(ts.input, ts.pos);

  // Number: digits, optional dot, optional exponent. Also handles leading dot like .15
  if (
    /\d/.test(ch) ||
    (ch === "." && ts.pos + 1 < ts.input.length && /\d/.test(charAt(ts.input, ts.pos + 1)))
  ) {
    const start = ts.pos;
    while (ts.pos < ts.input.length && /\d/.test(charAt(ts.input, ts.pos))) ts.pos++;
    if (ts.pos < ts.input.length && charAt(ts.input, ts.pos) === ".") {
      ts.pos++;
      while (ts.pos < ts.input.length && /\d/.test(charAt(ts.input, ts.pos))) ts.pos++;
    }
    if (ts.pos < ts.input.length && /[eE]/.test(charAt(ts.input, ts.pos))) {
      ts.pos++;
      if (ts.pos < ts.input.length && /[+-]/.test(charAt(ts.input, ts.pos))) ts.pos++;
      while (ts.pos < ts.input.length && /\d/.test(charAt(ts.input, ts.pos))) ts.pos++;
    }
    return { type: "number", value: parseFloat(ts.input.slice(start, ts.pos)) };
  }

  // Identifier (symbol name)
  if (/[a-zA-Z_]/.test(ch)) {
    const start = ts.pos;
    while (ts.pos < ts.input.length && /[a-zA-Z0-9_]/.test(charAt(ts.input, ts.pos))) ts.pos++;
    return { type: "ident", value: ts.input.slice(start, ts.pos) };
  }

  // Two-char operator **
  if (ch === "*" && ts.pos + 1 < ts.input.length && charAt(ts.input, ts.pos + 1) === "*") {
    ts.pos += 2;
    return { type: "op", value: "**" };
  }

  // Single-char operators
  if ("+-*/^".includes(ch)) {
    ts.pos++;
    if (ch === "^") return { type: "op", value: "**" };
    return { type: "op", value: ch };
  }

  if (ch === "(") {
    ts.pos++;
    return { type: "lparen" };
  }
  if (ch === ")") {
    ts.pos++;
    return { type: "rparen" };
  }

  throw new Error(`Unexpected character '${ch}' at position ${ts.pos}`);
}

function peekToken(ts: TokenStream): Token {
  const savedPos = ts.pos;
  const tok = nextToken(ts);
  ts.pos = savedPos;
  return tok;
}

// Grammar:
//   expr       -> additive
//   additive   -> multiplicative (('+' | '-') multiplicative)*
//   multiplicative -> power (('*' | '/') power)*
//   power      -> unary ('**' power)?   (right-associative)
//   unary      -> ('+' | '-') unary | primary
//   primary    -> NUMBER | IDENT | '(' expr ')'

function parseExpr(ts: TokenStream, symbols: Record<string, number>): number {
  return parseAdditive(ts, symbols);
}

function parseAdditive(ts: TokenStream, symbols: Record<string, number>): number {
  let left = parseMultiplicative(ts, symbols);
  for (;;) {
    const tok = peekToken(ts);
    if (tok.type === "op" && (tok.value === "+" || tok.value === "-")) {
      nextToken(ts);
      const right = parseMultiplicative(ts, symbols);
      left = tok.value === "+" ? left + right : left - right;
    } else {
      break;
    }
  }
  return left;
}

function parseMultiplicative(ts: TokenStream, symbols: Record<string, number>): number {
  let left = parsePower(ts, symbols);
  for (;;) {
    const tok = peekToken(ts);
    if (tok.type === "op" && (tok.value === "*" || tok.value === "/")) {
      nextToken(ts);
      const right = parsePower(ts, symbols);
      left = tok.value === "*" ? left * right : left / right;
    } else {
      break;
    }
  }
  return left;
}

function parsePower(ts: TokenStream, symbols: Record<string, number>): number {
  const base = parseUnary(ts, symbols);
  const tok = peekToken(ts);
  if (tok.type === "op" && tok.value === "**") {
    nextToken(ts);
    const exponent = parsePower(ts, symbols); // right-associative
    const result = Math.pow(base, exponent);
    if (!isFinite(result)) {
      throw new Error("Non-finite result in exponentiation");
    }
    return result;
  }
  return base;
}

function parseUnary(ts: TokenStream, symbols: Record<string, number>): number {
  const tok = peekToken(ts);
  if (tok.type === "op" && (tok.value === "+" || tok.value === "-")) {
    nextToken(ts);
    const val = parseUnary(ts, symbols);
    return tok.value === "+" ? val : -val;
  }
  return parsePrimary(ts, symbols);
}

function parsePrimary(ts: TokenStream, symbols: Record<string, number>): number {
  const tok = nextToken(ts);

  if (tok.type === "number") {
    return tok.value;
  }

  if (tok.type === "ident") {
    const key = tok.value.toUpperCase();
    if (!(key in symbols)) {
      throw new Error(`Unknown symbol '${tok.value}'`);
    }
    return symbols[key]!;
  }

  if (tok.type === "lparen") {
    const val = parseExpr(ts, symbols);
    const closing = nextToken(ts);
    if (closing.type !== "rparen") {
      throw new Error("Expected closing parenthesis");
    }
    return val;
  }

  throw new Error(`Unexpected token: ${tok.type}`);
}

function evalNumericExpression(expr: string, symbols: Record<string, number>): number {
  const ts: TokenStream = { input: expr, pos: 0 };
  const result = parseExpr(ts, symbols);
  skipWhitespace(ts);
  if (ts.pos < ts.input.length) {
    throw new Error(`Unexpected trailing characters at position ${ts.pos} in '${expr}'`);
  }
  return result;
}

// ---- NEC token parsing helpers ----

function parseFloatToken(token: string, symbols: Record<string, number>): number {
  const trimmed = token.trim();
  if (!trimmed) return 0.0;
  const num = Number(trimmed);
  if (!isNaN(num)) return num;
  return evalNumericExpression(trimmed, symbols);
}

function part(parts: string[], i: number): string {
  return i < parts.length ? parts[i]! : "";
}

function parseFloats(
  parts: string[],
  start: number,
  count: number,
  symbols: Record<string, number>,
): number[] {
  const result: number[] = [];
  for (let i = start; i < start + count; i++) {
    try {
      result.push(parseFloatToken(part(parts, i), symbols));
    } catch {
      result.push(0.0);
    }
  }
  return result;
}

// ---- Main parser ----

export function parseNecFile(content: string): ImportResult {
  const lines = content.trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  const comments: string[] = [];
  const sySymbols: Record<string, number> = {};

  const wires: ImportResult["wires"] = [];
  const excitations: ImportResult["excitations"] = [];
  let groundType: string = "free_space";
  let frequencyStartMhz = 14.0;
  let frequencyStopMhz = 14.5;
  let frequencySteps = 11;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const parts = line.split(/\s+/);
    if (!parts.length) continue;

    const card = parts[0]!.toUpperCase();

    if (card === "CM") {
      comments.push(line.length > 2 ? line.slice(2).trim() : "");
    } else if (card === "SY") {
      // Symbol assignment: SY NAME=EXPR, NAME2=EXPR2 'comment
      let body = line.slice(2).trim();
      const quoteIdx = body.indexOf("'");
      if (quoteIdx !== -1) {
        body = body.slice(0, quoteIdx).trim();
      }
      const assignments = body
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const assignment of assignments) {
        if (!assignment.includes("=")) continue;
        const eqIdx = assignment.indexOf("=");
        const name = assignment.slice(0, eqIdx).trim().toUpperCase();
        const expr = assignment.slice(eqIdx + 1).trim();
        if (!name) continue;
        try {
          sySymbols[name] = parseFloatToken(expr, sySymbols);
        } catch {
          // Skip invalid assignments
        }
      }
    } else if (card === "CE") {
      // Comment end — title assembled from CM cards after loop
    } else if (card === "GW") {
      // Wire: GW TAG SEGMENTS X1 Y1 Z1 X2 Y2 Z2 RADIUS
      if (parts.length < 10) continue;
      try {
        const tag = parseInt(part(parts, 1), 10);
        const segments = parseInt(part(parts, 2), 10);
        const vals = parseFloats(parts, 3, 7, sySymbols);
        wires.push({
          tag,
          segments: Math.max(1, Math.min(200, segments)),
          x1: vals[0]!,
          y1: vals[1]!,
          z1: vals[2]!,
          x2: vals[3]!,
          y2: vals[4]!,
          z2: vals[5]!,
          radius: Math.max(0.0001, Math.min(0.1, vals[6]!)),
        });
      } catch {
        // Skip malformed GW cards
      }
    } else if (card === "GN") {
      // Ground: GN TYPE ...
      if (parts.length < 2) continue;
      try {
        const gnType = parseInt(part(parts, 1), 10);
        if (gnType === -1) {
          groundType = "free_space";
        } else if (gnType === 1) {
          groundType = "perfect";
        } else if (gnType === 2) {
          groundType = "custom";
        }
      } catch {
        // ignore
      }
    } else if (card === "EX") {
      // Excitation: EX TYPE TAG SEGMENT 0 V_REAL V_IMAG
      if (parts.length < 4) continue;
      try {
        const exType = parseInt(part(parts, 1), 10);
        if (exType !== 0) continue; // Only voltage sources
        const tag = parseInt(part(parts, 2), 10);
        const segment = parseInt(part(parts, 3), 10);
        const vReal = parts.length > 5 ? parseFloatToken(part(parts, 5), sySymbols) : 1.0;
        const vImag = parts.length > 6 ? parseFloatToken(part(parts, 6), sySymbols) : 0.0;
        excitations.push({
          wire_tag: tag,
          segment,
          voltage_real: vReal,
          voltage_imag: vImag,
        });
      } catch {
        // ignore
      }
    } else if (card === "LD") {
      // Load: LD TYPE TAG SEG_START SEG_END P1 P2 P3
      // Parsed but ImportResult has no loads field — silently skip.
    } else if (card === "TL") {
      // Transmission Line: TL TAG1 SEG1 TAG2 SEG2 Z0 LENGTH ...
      // Parsed but ImportResult has no transmission_lines field — silently skip.
    } else if (card === "FR") {
      // Frequency: FR TYPE NFREQ 0 0 START_MHZ STEP_MHZ
      if (parts.length < 6) continue;
      try {
        const nFreq = parseInt(part(parts, 2), 10);
        const start = parseFloatToken(part(parts, 5), sySymbols);
        const step = parts.length > 6 ? parseFloatToken(part(parts, 6), sySymbols) : 0.0;

        frequencyStartMhz = Math.max(0.1, Math.min(2000.0, start));
        frequencySteps = Math.max(1, Math.min(201, nFreq));
        if (nFreq > 1 && step > 0) {
          frequencyStopMhz = Math.max(
            frequencyStartMhz,
            Math.min(2000.0, start + step * (nFreq - 1)),
          );
        } else {
          frequencyStopMhz = frequencyStartMhz;
        }
      } catch {
        // ignore
      }
    } else if (card === "EN") {
      break; // End of input
    }
  }

  // Validate: at least one wire
  if (wires.length === 0) {
    throw new Error("No GW (wire) cards found in .nec file");
  }

  // Default excitation if none found: center segment of first wire
  if (excitations.length === 0 && wires.length > 0) {
    const firstWire = wires[0]!;
    const centerSeg = Math.floor((firstWire.segments + 1) / 2);
    excitations.push({
      wire_tag: firstWire.tag,
      segment: centerSeg,
      voltage_real: 1.0,
      voltage_imag: 0.0,
    });
  }

  return {
    title: comments.join(" ").trim(),
    wires,
    excitations,
    ground_type: groundType,
    frequency_start_mhz: frequencyStartMhz,
    frequency_stop_mhz: frequencyStopMhz,
    frequency_steps: frequencySteps,
  };
}
