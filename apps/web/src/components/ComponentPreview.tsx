import React from "react";
import type { CatalogItem, CatalogComponent } from "../api";
import type { Locale } from "../lib/types";

export function getCatalogComponents(item: CatalogItem): CatalogComponent[] {
  if (Array.isArray(item.components) && item.components.length) {
    return item.components;
  }

  return item.assets.map((asset) => ({
    type: item.kind === "software" ? "software" : asset.includes("alias") || asset.includes("registry") || asset.includes("profile") ? "system-config" : "system-command",
    label: asset,
    labelEn: asset,
    detail: item.category
  }));
}

export function ComponentPreview({
  components,
  labels,
  locale,
  compact
}: {
  components: CatalogComponent[];
  labels: Record<CatalogComponent["type"], string>;
  locale: Locale;
  compact: boolean;
}) {
  const grouped = components.reduce<Record<CatalogComponent["type"], CatalogComponent[]>>(
    (acc, component) => {
      acc[component.type].push(component);
      return acc;
    },
    { software: [], "system-command": [], "system-config": [] }
  );

  if (compact) {
    return (
      <div className="asset-chips">
        {components.slice(0, 4).map((component) => (
          <span key={`${component.type}-${component.label}`}>{locale === "zh" ? component.label : component.labelEn}</span>
        ))}
        {components.length > 4 ? <span>+{components.length - 4}</span> : null}
      </div>
    );
  }

  return (
    <div className="bundle-preview">
      {(Object.keys(grouped) as Array<CatalogComponent["type"]>).map((type) => (
        grouped[type].length ? (
          <div className={`bundle-group ${type}`} key={type}>
            <strong>{labels[type]}</strong>
            <div>
              {grouped[type].slice(0, 4).map((component) => (
                <span key={`${type}-${component.label}`}>{locale === "zh" ? component.label : component.labelEn}</span>
              ))}
              {grouped[type].length > 4 ? <span>+{grouped[type].length - 4}</span> : null}
            </div>
          </div>
        ) : null
      ))}
    </div>
  );
}
