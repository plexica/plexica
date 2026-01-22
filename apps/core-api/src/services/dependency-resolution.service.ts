/**
 * Plugin Dependency Resolution Service
 *
 * Manages plugin dependencies, validates version constraints,
 * and detects circular dependencies (M2.3)
 */

import { PrismaClient } from '@prisma/client';
import { FastifyBaseLogger } from 'fastify';
import semver from 'semver';

// Dependency definition
export interface DependencyDefinition {
  pluginId: string;
  dependsOnPluginId: string;
  version: string; // Semver constraint (e.g., "^1.0.0", ">=2.0.0 <3.0.0")
  required: boolean;
}

// Dependency graph node
interface DependencyNode {
  pluginId: string;
  version: string;
  dependencies: DependencyDefinition[];
}

// Resolution result
export interface DependencyResolutionResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  installOrder?: string[]; // Topologically sorted plugin IDs
}

// Validation result
export interface DependencyValidationResult {
  satisfied: boolean;
  missing: string[];
  versionMismatches: Array<{
    pluginId: string;
    required: string;
    installed: string;
  }>;
}

export class DependencyResolutionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: FastifyBaseLogger
  ) {}

  /**
   * Register plugin dependencies
   */
  async registerDependencies(dependencies: DependencyDefinition[]): Promise<void> {
    this.logger.info({ count: dependencies.length }, 'Registering plugin dependencies');

    try {
      // Delete existing dependencies for these plugins
      const pluginIds = [...new Set(dependencies.map((d) => d.pluginId))];
      await this.prisma.pluginDependency.deleteMany({
        where: {
          pluginId: { in: pluginIds },
        },
      });

      // Create new dependencies
      if (dependencies.length > 0) {
        await this.prisma.pluginDependency.createMany({
          data: dependencies.map((dep) => ({
            pluginId: dep.pluginId,
            dependsOnPluginId: dep.dependsOnPluginId,
            version: dep.version,
            required: dep.required,
          })),
        });
      }

      this.logger.info('Dependencies registered successfully');
    } catch (error) {
      this.logger.error({ error, dependencies }, 'Failed to register dependencies');
      throw new Error(
        `Failed to register dependencies: ${error instanceof Error ? error.message : 'Unknown'}`
      );
    }
  }

  /**
   * Resolve dependencies for a plugin installation
   */
  async resolveDependencies(
    pluginId: string,
    tenantId: string
  ): Promise<DependencyResolutionResult> {
    this.logger.info({ pluginId, tenantId }, 'Resolving plugin dependencies');

    try {
      // Build dependency graph
      const graph = await this.buildDependencyGraph([pluginId]);

      // Check for circular dependencies
      const circularErrors = this.detectCircularDependencies(graph);
      if (circularErrors.length > 0) {
        return {
          valid: false,
          errors: circularErrors,
          warnings: [],
        };
      }

      // Get installed plugins for tenant
      const installedPlugins = await this.getInstalledPlugins(tenantId);

      // Validate all dependencies are satisfied
      const validation = this.validateDependencies(graph, installedPlugins);

      if (!validation.satisfied) {
        const errors = [
          ...validation.missing.map((id) => `Missing required plugin: ${id}`),
          ...validation.versionMismatches.map(
            (m) =>
              `Version mismatch for ${m.pluginId}: requires ${m.required}, installed ${m.installed}`
          ),
        ];

        return {
          valid: false,
          errors,
          warnings: [],
        };
      }

      // Generate install order (topological sort)
      const installOrder = this.topologicalSort(graph);

      return {
        valid: true,
        errors: [],
        warnings: [],
        installOrder,
      };
    } catch (error) {
      this.logger.error({ error, pluginId, tenantId }, 'Failed to resolve dependencies');
      throw new Error(
        `Failed to resolve dependencies: ${error instanceof Error ? error.message : 'Unknown'}`
      );
    }
  }

  /**
   * Get all dependencies for a plugin (recursive)
   */
  async getDependencies(
    pluginId: string,
    recursive: boolean = false
  ): Promise<DependencyDefinition[]> {
    const direct = await this.prisma.pluginDependency.findMany({
      where: { pluginId },
    });

    const dependencies: DependencyDefinition[] = direct.map((dep) => ({
      pluginId: dep.pluginId,
      dependsOnPluginId: dep.dependsOnPluginId,
      version: dep.version,
      required: dep.required,
    }));

    if (!recursive) {
      return dependencies;
    }

    // Recursively get dependencies
    const allDeps = new Map<string, DependencyDefinition>();
    dependencies.forEach((dep) => allDeps.set(dep.dependsOnPluginId, dep));

    for (const dep of dependencies) {
      const nested = await this.getDependencies(dep.dependsOnPluginId, true);
      nested.forEach((nestedDep) => {
        if (!allDeps.has(nestedDep.dependsOnPluginId)) {
          allDeps.set(nestedDep.dependsOnPluginId, nestedDep);
        }
      });
    }

    return Array.from(allDeps.values());
  }

  /**
   * Get plugins that depend on a given plugin
   */
  async getDependents(pluginId: string): Promise<string[]> {
    const dependents = await this.prisma.pluginDependency.findMany({
      where: { dependsOnPluginId: pluginId },
      select: { pluginId: true },
      distinct: ['pluginId'],
    });

    return dependents.map((d) => d.pluginId);
  }

  /**
   * Check if plugin can be uninstalled (no dependents)
   */
  async canUninstall(
    pluginId: string,
    tenantId: string
  ): Promise<{
    canUninstall: boolean;
    blockedBy: string[];
  }> {
    const installedPlugins = await this.getInstalledPlugins(tenantId);
    const dependents = await this.getDependents(pluginId);

    // Check which dependents are actually installed
    const installedDependents = dependents.filter((dep) =>
      installedPlugins.some((p) => p.pluginId === dep)
    );

    return {
      canUninstall: installedDependents.length === 0,
      blockedBy: installedDependents,
    };
  }

  // ===== Private Helper Methods =====

  /**
   * Build dependency graph for given plugins
   */
  private async buildDependencyGraph(pluginIds: string[]): Promise<Map<string, DependencyNode>> {
    const graph = new Map<string, DependencyNode>();
    const visited = new Set<string>();
    const queue = [...pluginIds];

    while (queue.length > 0) {
      const pluginId = queue.shift()!;
      if (visited.has(pluginId)) continue;

      visited.add(pluginId);

      // Get plugin info
      const plugin = await this.prisma.plugin.findUnique({
        where: { id: pluginId },
        select: { id: true, version: true },
      });

      if (!plugin) {
        throw new Error(`Plugin not found: ${pluginId}`);
      }

      // Get dependencies
      const dependencies = await this.getDependencies(pluginId, false);

      graph.set(pluginId, {
        pluginId: plugin.id,
        version: plugin.version,
        dependencies,
      });

      // Add dependencies to queue
      dependencies.forEach((dep) => {
        if (!visited.has(dep.dependsOnPluginId)) {
          queue.push(dep.dependsOnPluginId);
        }
      });
    }

    return graph;
  }

  /**
   * Detect circular dependencies using DFS
   */
  private detectCircularDependencies(graph: Map<string, DependencyNode>): string[] {
    const errors: string[] = [];
    const visiting = new Set<string>();
    const visited = new Set<string>();

    const visit = (pluginId: string, path: string[]): void => {
      if (visiting.has(pluginId)) {
        const cycle = [...path, pluginId].join(' -> ');
        errors.push(`Circular dependency detected: ${cycle}`);
        return;
      }

      if (visited.has(pluginId)) {
        return;
      }

      visiting.add(pluginId);
      path.push(pluginId);

      const node = graph.get(pluginId);
      if (node) {
        node.dependencies.forEach((dep) => {
          visit(dep.dependsOnPluginId, [...path]);
        });
      }

      visiting.delete(pluginId);
      visited.add(pluginId);
    };

    graph.forEach((_, pluginId) => {
      if (!visited.has(pluginId)) {
        visit(pluginId, []);
      }
    });

    return errors;
  }

  /**
   * Validate dependencies against installed plugins
   */
  private validateDependencies(
    graph: Map<string, DependencyNode>,
    installedPlugins: Array<{ pluginId: string; version: string }>
  ): DependencyValidationResult {
    const missing: string[] = [];
    const versionMismatches: Array<{
      pluginId: string;
      required: string;
      installed: string;
    }> = [];

    graph.forEach((node) => {
      node.dependencies.forEach((dep) => {
        if (!dep.required) return; // Skip optional dependencies

        const installed = installedPlugins.find((p) => p.pluginId === dep.dependsOnPluginId);

        if (!installed) {
          missing.push(dep.dependsOnPluginId);
        } else if (!semver.satisfies(installed.version, dep.version)) {
          versionMismatches.push({
            pluginId: dep.dependsOnPluginId,
            required: dep.version,
            installed: installed.version,
          });
        }
      });
    });

    return {
      satisfied: missing.length === 0 && versionMismatches.length === 0,
      missing,
      versionMismatches,
    };
  }

  /**
   * Topological sort for install order
   */
  private topologicalSort(graph: Map<string, DependencyNode>): string[] {
    const sorted: string[] = [];
    const visited = new Set<string>();
    const temp = new Set<string>();

    const visit = (pluginId: string): void => {
      if (visited.has(pluginId)) return;
      if (temp.has(pluginId)) return; // Already handled in circular check

      temp.add(pluginId);

      const node = graph.get(pluginId);
      if (node) {
        node.dependencies.forEach((dep) => {
          visit(dep.dependsOnPluginId);
        });
      }

      temp.delete(pluginId);
      visited.add(pluginId);
      sorted.push(pluginId);
    };

    graph.forEach((_, pluginId) => {
      if (!visited.has(pluginId)) {
        visit(pluginId);
      }
    });

    return sorted;
  }

  /**
   * Get installed plugins for a tenant
   */
  private async getInstalledPlugins(
    tenantId: string
  ): Promise<Array<{ pluginId: string; version: string }>> {
    const installations = await this.prisma.tenantPlugin.findMany({
      where: { tenantId },
      include: {
        plugin: {
          select: {
            id: true,
            version: true,
          },
        },
      },
    });

    return installations.map((install) => ({
      pluginId: install.plugin.id,
      version: install.plugin.version,
    }));
  }
}
