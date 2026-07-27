"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, Edit2, Trash2, Circle } from "lucide-react";

export interface TreeItem {
  _id: string;
  name: string;
  parentId?: string | null;
  isActive?: boolean;
}

/**
 * Collapsible/expandable tree for any flat parentId-linked master list
 * (Brands, Product Categories, Material Categories) -- multiple root nodes
 * are supported (any item with no parentId, or whose parent no longer
 * exists, becomes its own root). Replaces the old flat-card-with-↳-prefix
 * rendering, per explicit direction ("branching should be there ... tree
 * like structure ... collapsing is required").
 */
export function CategoryTree<T extends TreeItem>({
  items,
  onEdit,
  onDelete,
  renderExtra,
  renderIcon,
  renderActions,
  defaultOpenDepth = 0,
}: {
  items: T[];
  onEdit: (item: T) => void;
  onDelete: (item: T) => void;
  renderExtra?: (item: T) => React.ReactNode;
  // Per-row leading icon (e.g. to visually distinguish Category/Brand/
  // Series/Model rows in a mixed-kind tree). Falls back to the default
  // expand/collapse chevron + dot when omitted.
  renderIcon?: (item: T) => React.ReactNode;
  // Overrides the default fixed Edit/Delete icon buttons -- needed once a
  // tree mixes multiple document kinds (e.g. Brand/Series/Model) where
  // each kind edits/deletes through a different API and some kinds (e.g.
  // a synthetic Category row) have no actions at all.
  renderActions?: (item: T) => React.ReactNode;
  // How many levels deep start expanded (0 = only roots expanded).
  defaultOpenDepth?: number;
}) {
  const byParent = new Map<string, T[]>();
  const ids = new Set(items.map((i) => i._id));
  for (const item of items) {
    const parentKey = item.parentId && ids.has(item.parentId) ? item.parentId : "__root__";
    if (!byParent.has(parentKey)) byParent.set(parentKey, []);
    byParent.get(parentKey)!.push(item);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.name.localeCompare(b.name));

  const roots = byParent.get("__root__") || [];

  return (
    <div className="bg-white border border-gray-200 rounded-2xl divide-y divide-gray-100">
      {roots.map((root) => (
        <TreeNode
          key={root._id}
          item={root}
          depth={0}
          byParent={byParent}
          onEdit={onEdit}
          onDelete={onDelete}
          renderExtra={renderExtra}
          renderIcon={renderIcon}
          renderActions={renderActions}
          defaultOpenDepth={defaultOpenDepth}
        />
      ))}
    </div>
  );
}

function TreeNode<T extends TreeItem>({
  item,
  depth,
  byParent,
  onEdit,
  onDelete,
  renderExtra,
  renderIcon,
  renderActions,
  defaultOpenDepth,
}: {
  item: T;
  depth: number;
  byParent: Map<string, T[]>;
  onEdit: (item: T) => void;
  onDelete: (item: T) => void;
  renderExtra?: (item: T) => React.ReactNode;
  renderIcon?: (item: T) => React.ReactNode;
  renderActions?: (item: T) => React.ReactNode;
  defaultOpenDepth: number;
}) {
  const children = byParent.get(item._id) || [];
  const [open, setOpen] = useState(depth <= defaultOpenDepth);

  return (
    <div>
      <div
        className="flex items-center gap-2 py-2.5 px-4 hover:bg-gray-50 transition"
        style={{ paddingLeft: `${16 + depth * 24}px` }}
      >
        {children.length > 0 ? (
          <button onClick={() => setOpen((v) => !v)} className="text-gray-400 hover:text-gray-600 shrink-0">
            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        ) : (
          <Circle className="w-1.5 h-1.5 text-gray-300 shrink-0 mx-1.5" fill="currentColor" />
        )}
        {renderIcon?.(item)}
        <span className={`text-sm flex-1 ${item.isActive === false ? "text-gray-400 line-through" : "text-gray-800"}`}>
          {item.name}
        </span>
        {children.length > 0 && (
          <span className="text-[11px] text-gray-400">{children.length}</span>
        )}
        {renderExtra?.(item)}
        {renderActions ? (
          renderActions(item)
        ) : (
          <>
            <button onClick={() => onEdit(item)} className="text-gray-400 hover:text-gray-700 shrink-0">
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onDelete(item)} className="text-gray-400 hover:text-red-500 shrink-0">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
      {open &&
        children.map((child) => (
          <TreeNode
            key={child._id}
            item={child}
            depth={depth + 1}
            byParent={byParent}
            onEdit={onEdit}
            onDelete={onDelete}
            renderExtra={renderExtra}
            renderIcon={renderIcon}
            renderActions={renderActions}
            defaultOpenDepth={defaultOpenDepth}
          />
        ))}
    </div>
  );
}
