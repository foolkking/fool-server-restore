/**
 * template-parser.ts — AST-based Jinja2-lite template parser and renderer
 *
 * Supports:
 *   - {{ var }} and {{ var.prop }}
 *   - Pipe default filter: {{ port | default(80) }}
 *   - Nested conditions: {% if condition %} ... {% endif %} with basic negations (not / !)
 *   - Nested loops: {% for item in list %} ... {% endfor %}
 *   - Comments: {# comment #}
 *
 * Implements a robust recursive stack-based scanning and AST evaluation which is
 * completely immune to regular-expression nested matching bugs.
 */

export interface Token {
  type: "text" | "var" | "if" | "endif" | "for" | "endfor";
  value: string;
}

export interface ASTNode {
  type: "text" | "var" | "if" | "for";
  value: string;
  children?: ASTNode[];
  // For variables
  defaultValue?: string;
  // For loops
  itemVar?: string;
  listExpr?: string;
}

export function tokenize(template: string): Token[] {
  const parts = template.split(/(\{\{.*?\}\}|\{%.*?%\}|\{#.*?#\})/gs);
  const tokens: Token[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith("{{") && part.endsWith("}}")) {
      tokens.push({ type: "var", value: part.slice(2, -2).trim() });
    } else if (part.startsWith("{%") && part.endsWith("%}")) {
      const content = part.slice(2, -2).trim();
      if (content.startsWith("if ")) {
        tokens.push({ type: "if", value: content.slice(3).trim() });
      } else if (content === "endif") {
        tokens.push({ type: "endif", value: "" });
      } else if (content.startsWith("for ")) {
        tokens.push({ type: "for", value: content.slice(4).trim() });
      } else if (content === "endfor") {
        tokens.push({ type: "endfor", value: "" });
      } else {
        throw new Error(`Unsupported template block: ${part}`);
      }
    } else if (part.startsWith("{#") && part.endsWith("#}")) {
      // Ignore comment tokens completely
    } else {
      tokens.push({ type: "text", value: part });
    }
  }
  return tokens;
}

export function parse(tokens: Token[]): ASTNode[] {
  let index = 0;

  function parseNodes(endTag?: "endif" | "endfor"): ASTNode[] {
    const nodes: ASTNode[] = [];
    while (index < tokens.length) {
      const token = tokens[index];
      if (endTag && token.type === endTag) {
        index++; // Consume end tag
        return nodes;
      }

      if (token.type === "endif" || token.type === "endfor") {
        throw new Error(`Mismatched end tag: ${token.type}`);
      }

      index++; // Consume token

      if (token.type === "text") {
        nodes.push({ type: "text", value: token.value });
      } else if (token.type === "var") {
        let expr = token.value;
        let defaultValue: string | undefined;
        if (expr.includes("|")) {
          const parts = expr.split("|");
          expr = parts[0].trim();
          const filterStr = parts[1].trim();
          if (filterStr.startsWith("default(")) {
            const arg = filterStr.slice(8, -1).trim();
            if ((arg.startsWith("'") && arg.endsWith("'")) || (arg.startsWith('"') && arg.endsWith('"'))) {
              defaultValue = arg.slice(1, -1);
            } else {
              defaultValue = arg;
            }
          }
        }
        nodes.push({ type: "var", value: expr, defaultValue });
      } else if (token.type === "if") {
        const body = parseNodes("endif");
        nodes.push({ type: "if", value: token.value, children: body });
      } else if (token.type === "for") {
        const forMatch = token.value.match(/^(\w+)\s+in\s+(.+)$/);
        if (!forMatch) {
          throw new Error(`Invalid for loop format: {% for ${token.value} %}`);
        }
        const itemVar = forMatch[1];
        const listExpr = forMatch[2].trim();
        const body = parseNodes("endfor");
        nodes.push({ type: "for", value: token.value, itemVar, listExpr, children: body });
      }
    }

    if (endTag) {
      throw new Error(`Unclosed block, expected: ${endTag}`);
    }

    return nodes;
  }

  return parseNodes();
}

function resolveVar(expr: string, vars: Record<string, unknown>): unknown {
  const parts = expr.split(".");
  let val: unknown = vars;
  for (const part of parts) {
    if (val == null || typeof val !== "object") return undefined;
    val = (val as Record<string, unknown>)[part];
  }
  return val;
}

function resolveCondition(expr: string, vars: Record<string, unknown>): boolean {
  const negated = expr.startsWith("not ") || expr.startsWith("!");
  const cleanExpr = expr.replace(/^(not |!)/, "").trim();
  const val = resolveVar(cleanExpr, vars);
  const truthy = val !== false && val !== null && val !== undefined && val !== "" && val !== 0;
  return negated ? !truthy : truthy;
}

export function evaluate(nodes: ASTNode[], vars: Record<string, unknown>): string {
  let result = "";
  for (const node of nodes) {
    if (node.type === "text") {
      result += node.value;
    } else if (node.type === "var") {
      const val = resolveVar(node.value, vars);
      if (val == null || val === "") {
        result += node.defaultValue !== undefined ? node.defaultValue : "";
      } else {
        result += String(val);
      }
    } else if (node.type === "if") {
      const truthy = resolveCondition(node.value, vars);
      if (truthy) {
        result += evaluate(node.children ?? [], vars);
      }
    } else if (node.type === "for") {
      const list = resolveVar(node.listExpr!, vars);
      if (Array.isArray(list)) {
        for (const item of list) {
          const loopVars = { ...vars, [node.itemVar!]: item };
          result += evaluate(node.children ?? [], loopVars);
        }
      }
    }
  }
  return result;
}

export function renderTemplate(template: string, vars: Record<string, unknown>): string {
  const tokens = tokenize(template);
  const ast = parse(tokens);
  return evaluate(ast, vars);
}
