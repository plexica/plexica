import type { Workspace, WorkspaceTreeNode } from '../../types/workspace.js';

function compareNodes(left: WorkspaceTreeNode, right: WorkspaceTreeNode): number {
  if (left.name < right.name) return -1;
  if (left.name > right.name) return 1;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export function buildWorkspaceTree(workspaces: Workspace[]): WorkspaceTreeNode[] {
  const nodes = new Map<string, WorkspaceTreeNode>();

  for (const workspace of workspaces) {
    nodes.set(workspace.id, {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      depth: workspace.depth,
      status: workspace.status,
      children: [],
    });
  }

  const roots: WorkspaceTreeNode[] = [];
  for (const workspace of workspaces) {
    const node = nodes.get(workspace.id);
    if (node === undefined) continue;
    const parent = workspace.parentId === null ? undefined : nodes.get(workspace.parentId);
    if (parent === undefined || parent.id === node.id) roots.push(node);
    else parent.children.push(node);
  }

  function sortTree(treeNodes: WorkspaceTreeNode[]): void {
    treeNodes.sort(compareNodes);
    for (const node of treeNodes) sortTree(node.children);
  }

  sortTree(roots);
  return roots;
}

export function filterWorkspaceTree(
  nodes: WorkspaceTreeNode[],
  search: string
): WorkspaceTreeNode[] {
  const query = search.trim().toLocaleLowerCase();
  if (query === '') return nodes;

  return nodes.flatMap((node) => {
    const children = filterWorkspaceTree(node.children, query);
    if (!node.name.toLocaleLowerCase().includes(query) && children.length === 0) return [];
    return [{ ...node, children }];
  });
}

export function countWorkspaceTreeNodes(nodes: WorkspaceTreeNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countWorkspaceTreeNodes(node.children), 0);
}
