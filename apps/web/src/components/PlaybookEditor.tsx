import React, { useState, useRef } from "react";
import type { Locale } from "../lib/types";

export interface PlaybookEditorProps {
  yaml: string;
  onChange: (yaml: string) => void;
  onRunDryRun?: () => void;
  locale: Locale;
  readOnly?: boolean;
}

/** Basic YAML syntax check — no external dependency needed */
function validateYaml(content: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const lines = content.split("\n");

  let inBlockScalar = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Detect block scalars (| or >) — skip indentation checks inside them
    if (/:\s*[|>]/.test(line)) {
      inBlockScalar = true;
      continue;
    }
    if (inBlockScalar && (line.startsWith(" ") || line.startsWith("\t") || line.trim() === "")) {
      continue;
    }
    inBlockScalar = false;

    // Tab characters are not allowed in YAML
    if (line.includes("\t")) {
      errors.push(`Line ${lineNum}: Tab characters are not allowed in YAML`);
    }

    // Detect unmatched quotes (simple heuristic)
    const singleQuotes = (line.match(/'/g) ?? []).length;
    const doubleQuotes = (line.match(/"/g) ?? []).length;
    if (singleQuotes % 2 !== 0) {
      errors.push(`Line ${lineNum}: Possible unmatched single quote`);
    }
    if (doubleQuotes % 2 !== 0) {
      errors.push(`Line ${lineNum}: Possible unmatched double quote`);
    }

    // Detect duplicate keys at the same indentation (simple check)
    const keyMatch = line.match(/^(\s*)(\w[\w-]*):/);
    if (keyMatch) {
      const indent = keyMatch[1].length;
      const key = keyMatch[2];
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j];
        if (nextLine.trim() === "") continue;
        const nextIndent = nextLine.match(/^(\s*)/)?.[1].length ?? 0;
        if (nextIndent < indent) break;
        if (nextIndent === indent) {
          const nextKey = nextLine.match(/^(\s*)(\w[\w-]*):/)?.[2];
          if (nextKey === key) {
            errors.push(`Line ${j + 1}: Duplicate key "${key}" (first seen at line ${lineNum})`);
          }
          break;
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function PlaybookEditor({
  yaml,
  onChange,
  onRunDryRun,
  locale,
  readOnly = false
}: PlaybookEditorProps) {
  const [validation, setValidation] = useState<{ valid: boolean; errors: string[] } | null>(null);
  const [validating, setValidating] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const lineCount = yaml.split("\n").length;

  function handleValidate() {
    setValidating(true);
    // Small timeout so the UI updates before the (synchronous) check
    setTimeout(() => {
      const result = validateYaml(yaml);
      setValidation(result);
      setValidating(false);
    }, 50);
  }

  function handleDownload() {
    const blob = new Blob([yaml], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `playbook-${new Date().toISOString().slice(0, 10)}.yaml`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Insert 2 spaces on Tab key
    if (e.key === "Tab") {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const newValue = yaml.slice(0, start) + "  " + yaml.slice(end);
      onChange(newValue);
      // Restore cursor position after React re-render
      requestAnimationFrame(() => {
        el.selectionStart = start + 2;
        el.selectionEnd = start + 2;
      });
    }
  }

  return (
    <div className="playbook-editor">
      <div className="playbook-editor-toolbar">
        <button
          className="secondary-action"
          type="button"
          onClick={handleValidate}
          disabled={validating || !yaml.trim()}
        >
          {validating ? <span className="spinning">↻</span> : "✓"}
          {locale === "zh" ? "验证语法" : "Validate"}
        </button>
        <button
          className="secondary-action"
          type="button"
          onClick={handleDownload}
          disabled={!yaml.trim()}
        >
          ⬇ {locale === "zh" ? "下载" : "Download"}
        </button>
        {onRunDryRun ? (
          <button
            className="primary-action"
            type="button"
            onClick={onRunDryRun}
            disabled={!yaml.trim()}
          >
            ⚡ {locale === "zh" ? "预演（dry-run）" : "Run dry-run"}
          </button>
        ) : null}
        <span className="playbook-editor-meta">
          {lineCount} {locale === "zh" ? "行" : "lines"}
        </span>
      </div>

      {validation ? (
        <div className={`playbook-validation ${validation.valid ? "valid" : "invalid"}`}>
          {validation.valid ? (
            <span>✓ {locale === "zh" ? "YAML 语法正确" : "YAML syntax is valid"}</span>
          ) : (
            <ul>
              {validation.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="playbook-editor-body">
        <div className="playbook-line-numbers" aria-hidden="true">
          {Array.from({ length: lineCount }, (_, i) => (
            <span key={i + 1}>{i + 1}</span>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          className="playbook-textarea"
          value={yaml}
          onChange={(e) => { onChange(e.target.value); setValidation(null); }}
          onKeyDown={handleKeyDown}
          readOnly={readOnly}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          aria-label={locale === "zh" ? "Playbook YAML 编辑器" : "Playbook YAML editor"}
        />
      </div>
    </div>
  );
}
