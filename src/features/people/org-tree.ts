// Who reports to whom — a line-for-line port of the web's buildOrgTree (dash.html:9374), so the
// app draws exactly the chart the website draws. The reasoning, briefly (the web has the long
// version):
//   - reportingTo holds a user id on some records and reportingManager a NAME on most; the id wins,
//     the name is the fallback, and a name shared by two people is treated as no answer.
//   - A manager named but unknown is first matched as a spelling variant of someone in the roster
//     (words contained in each other, ≥2 shared, one-letter slips allowed on long words); only a
//     name that matches nobody becomes a placeholder ("ghost") card.
//   - Cycles (A → B → A) are cut so nothing recurses forever.
//   - Small loose branches with no line above them hang under the head of the company (marked
//     `assumed`); the CEO/COO lead the chart.

import type { DirectoryPerson } from '@/api/people';

export type OrgNode = DirectoryPerson & { ghost?: boolean };

/** The fields that say who someone reports to (a directory row, or my own record from GET /users/:id). */
export type ReportingFields = Pick<OrgNode, 'id' | 'name' | 'reportingTo' | 'reportingManager' | 'reportingToName'>;

export type OrgTree = {
  roots: OrgNode[];
  kids: Map<string, OrgNode[]>;
  assumed: Set<string>;
  size: number;
  parent: Map<string, OrgNode>; // derived: who each node hangs under on the chart
  byId: Map<string, OrgNode>; // every node, placeholders included
  /**
   * Who `u` reports to, by the chart's own rules (reportingTo id, then the exact unique name, then a
   * close spelling, then a placeholder). Works for records that are not on the chart (console roles,
   * my own record); never changes the tree — a placeholder nobody else names comes back detached.
   */
  managerOf: (u: ReportingFields | null | undefined) => OrgNode | null;
};

export function buildOrgTree(people: OrgNode[], pending: OrgNode[]): OrgTree {
  // Whatever arrives (an old cached payload, a partial row) the chart must not crash on it.
  const base = (Array.isArray(people) ? people : []).filter((p) => p && p.id != null);
  const extra = (Array.isArray(pending) ? pending : []).filter((p) => p && p.id != null && p.name);
  const roster = extra.length ? base.concat(extra) : base;
  const byId = new Map<string, OrgNode>();
  const byName = new Map<string, OrgNode | null>();
  for (const u of roster) {
    byId.set(String(u.id), u);
    const n = String(u.name || '').trim().toLowerCase();
    if (!n) continue;
    if (byName.has(n)) byName.set(n, null); // null marks "more than one person has this name"
    else byName.set(n, u);
  }

  const words = (x: unknown) =>
    String(x || '')
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
  const FUZZ = 6;
  const near = (a: string, b: string) => {
    if (a === b) return true;
    const la = a.length;
    const lb = b.length;
    if (Math.abs(la - lb) > 1 || Math.min(la, lb) < FUZZ) return false;
    let i = 0;
    let j = 0;
    let diff = 0;
    while (i < la && j < lb) {
      if (a[i] === b[j]) {
        i++;
        j++;
        continue;
      }
      if (++diff > 1) return false;
      if (la > lb) i++;
      else if (lb > la) j++;
      else {
        i++;
        j++;
      }
    }
    return diff + (la - i) + (lb - j) <= 1;
  };
  const wordIndex = roster.map((p) => ({ p, w: new Set(words(p.name)) }));
  const variantOf = (raw: string): OrgNode | null => {
    const w = new Set(words(raw));
    if (w.size < 2) return null;
    const hits = wordIndex.filter(({ w: pw }) => {
      let shared = 0;
      for (const t of w) {
        for (const x of pw) {
          if (near(t, x)) {
            shared++;
            break;
          }
        }
      }
      if (shared < 2) return false;
      return shared === w.size || shared === pw.size; // one set contained in the other
    });
    return hits.length === 1 ? hits[0]!.p : null;
  };

  const ghosts = new Map<string, OrgNode>();
  // `keep` = false (after the tree is built): reuse a placeholder the chart already has, or hand back a
  // detached one, so asking never adds a card to the chart.
  const ghostFor = (nm: string, raw: string, keep: boolean): OrgNode => {
    const have = ghosts.get(nm);
    if (have) return have;
    const g: OrgNode = { id: `ghost:${nm}`, name: raw, ghost: true };
    if (keep) ghosts.set(nm, g);
    return g;
  };
  const mgrOf = (u: ReportingFields, keep = true): OrgNode | null => {
    const byRef = u.reportingTo ? byId.get(String(u.reportingTo)) : undefined;
    if (byRef && byRef.id !== u.id) return byRef;
    const raw = String(u.reportingManager || u.reportingToName || '').trim();
    const nm = raw.toLowerCase();
    if (!nm) return null;
    const hit = byName.get(nm);
    if (hit === null) return null; // the name is shared — refuse to guess
    if (hit) return hit.id !== u.id ? hit : null;
    const variant = variantOf(raw);
    if (variant && variant.id !== u.id) return variant;
    return ghostFor(nm, raw, keep);
  };

  const kids = new Map<string, OrgNode[]>();
  const roots: OrgNode[] = [];
  const all = roster.slice();
  for (const u of roster) {
    const m = mgrOf(u);
    if (!m) {
      roots.push(u);
      continue;
    }
    if (!kids.has(m.id)) kids.set(m.id, []);
    kids.get(m.id)!.push(u);
  }
  // Every placeholder is a root: by definition nothing above it is known.
  for (const g of ghosts.values()) {
    all.push(g);
    roots.push(g);
  }

  // Cut cycles: the deeper of a pair that reports to each other is cut loose to the top.
  const seen = new Set<string>();
  let safeRoots: OrgNode[] = [];
  const walk = (u: OrgNode, chain: Set<string>): boolean => {
    if (chain.has(u.id)) return false;
    chain.add(u.id);
    seen.add(u.id);
    kids.set(
      u.id,
      (kids.get(u.id) || []).filter((c) => walk(c, chain)),
    );
    chain.delete(u.id);
    return true;
  };
  for (const r of roots) if (walk(r, new Set())) safeRoots.push(r);
  // A pair that reports to each other is in no root's subtree; walking each stranded node promotes
  // it to the top and cuts the back-edge underneath it.
  for (const u of all) {
    if (seen.has(u.id)) continue;
    if (walk(u, new Set())) safeRoots.push(u);
  }

  const sort = (a: OrgNode, b: OrgNode) => String(a.name || '').localeCompare(String(b.name || ''));
  const roleOf = (u?: OrgNode | null) => String((u && u.role) || '').toLowerCase();
  const assumed = new Set<string>();
  // Whole-subtree size, not the number of direct reports.
  const reach = new Map<string, number>();
  const sizeAt = (id: string): number => {
    const known = reach.get(id);
    if (known !== undefined) return known;
    reach.set(id, 1);
    let n = 1;
    for (const k of kids.get(id) || []) n += sizeAt(k.id);
    reach.set(id, n);
    return n;
  };
  const isHead = (u: OrgNode) => roleOf(u) === 'ceo' || roleOf(u) === 'coo';
  // The anchor is a root holding the ceo role, or failing that the root with the largest organisation.
  const anchor =
    safeRoots.find((u) => roleOf(u) === 'ceo') ||
    safeRoots
      .slice()
      .sort(
        (a, b) =>
          sizeAt(b.id) - sizeAt(a.id) ||
          (roleOf(a) === 'coo' ? 0 : 1) - (roleOf(b) === 'coo' ? 0 : 1) ||
          sort(a, b),
      )[0];
  // Only loose branches (under a third of the anchor's size) move; the other head never does.
  const LOOSE = 3;
  if (anchor) {
    const room = sizeAt(anchor.id);
    const branches = safeRoots.filter(
      (u) => u !== anchor && !isHead(u) && (kids.get(u.id) || []).length > 0 && sizeAt(u.id) * LOOSE <= room,
    );
    if (branches.length) {
      const under = kids.get(anchor.id) || [];
      for (const b of branches) {
        assumed.add(b.id);
        under.push(b);
      }
      kids.set(anchor.id, under);
      const moved = new Set(branches.map((b) => b.id));
      safeRoots = safeRoots.filter((u) => !moved.has(u.id));
    }
  }
  // The heads of the company lead: role first, then how many report to them, then name.
  const rank = (u: OrgNode) => (u === anchor ? -1 : roleOf(u) === 'ceo' ? 0 : roleOf(u) === 'coo' ? 1 : 2);
  safeRoots.sort(
    (a, b) => rank(a) - rank(b) || (kids.get(b.id) || []).length - (kids.get(a.id) || []).length || sort(a, b),
  );
  for (const [, v] of kids) v.sort(sort);

  const nodes = new Map<string, OrgNode>(all.map((u) => [u.id, u]));
  const parent = new Map<string, OrgNode>();
  for (const [pid, list] of kids) {
    const p = nodes.get(pid);
    if (p) for (const c of list) parent.set(c.id, p);
  }
  const managerOf = (u: ReportingFields | null | undefined) => (u && u.id != null ? mgrOf(u, false) : null);
  return { roots: safeRoots, kids, assumed, size: roster.length, parent, byId: nodes, managerOf };
}

// The chain from the top of the chart down to `id` (inclusive), or [] when `id` is not on it.
export function chainTo(tree: OrgTree, id: string): OrgNode[] {
  const me = tree.byId.get(id);
  if (!me) return [];
  const chain: OrgNode[] = [me];
  const guard = new Set<string>([me.id]);
  let cur = tree.parent.get(me.id);
  while (cur && !guard.has(cur.id)) {
    chain.unshift(cur);
    guard.add(cur.id);
    cur = tree.parent.get(cur.id);
  }
  return chain;
}

// ── Where someone sits ───────────────────────────────────────────────────────

export type OrgPlace = {
  /** They are a card on the chart (console roles such as HR or Super Admin are not). */
  onChart: boolean;
  /** Their reporting manager (a placeholder when the name matches nobody in the directory), or null. */
  manager: OrgNode | null;
  /** Everyone else under the same manager. */
  peers: OrgNode[];
  /** The people who report to them. */
  reports: OrgNode[];
};

const sortByName = (a: OrgNode, b: OrgNode) => String(a.name || '').localeCompare(String(b.name || ''));

/**
 * My manager, the people beside me and the people under me — also for someone the chart leaves out
 * (HR, Super Admin, Accounts, IT Admin, App Manager and Visitor Manager logins are not in the
 * directory): their own record is matched by the chart's rules (tree.managerOf), and anyone who names
 * them as their manager is found under their id or under the placeholder for their name. A branch the
 * chart only hung under the head of the company (`assumed`) has no manager on file.
 */
export function placeOf(tree: OrgTree, me: ReportingFields | null | undefined): OrgPlace {
  if (!tree || !me || me.id == null || String(me.id) === '') return { onChart: false, manager: null, peers: [], reports: [] };
  const id = String(me.id);
  const kidsOf = (k: string) => {
    const list = tree.kids?.get(k);
    return Array.isArray(list) ? list.filter((p): p is OrgNode => !!p && p.id != null) : [];
  };
  const node = tree.byId?.get(id);
  const onChart = !!node && !node.ghost;
  const manager = onChart ? (tree.assumed?.has(id) ? null : (tree.parent?.get(id) ?? null)) : (tree.managerOf?.(me) ?? null);

  const seen = new Set<string>([id]);
  if (manager) seen.add(manager.id);
  const fresh = (list: OrgNode[]) =>
    list.filter((p) => {
      const k = String(p.id);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  const myName = String(me.name || '').trim().toLowerCase();
  const reports = fresh([...kidsOf(id), ...(myName ? kidsOf(`ghost:${myName}`) : [])]).sort(sortByName);
  const peers = manager ? fresh(kidsOf(manager.id)).sort(sortByName) : [];
  return { onChart, manager, peers, reports };
}
