/**
 * Unit Tests: PluginTargetsService
 *
 * Spec 012, T012-36 (ADR-027, ADR-030).
 *
 * Strategy: mock `fs.promises` and `db` so the service never touches
 * the real filesystem or database.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoist mocks
// ---------------------------------------------------------------------------

const { mockWriteFile, mockRename, mockMkdir, mockDbFindMany } = vi.hoisted(() => {
  return {
    mockWriteFile: vi.fn().mockResolvedValue(undefined),
    mockRename: vi.fn().mockResolvedValue(undefined),
    mockMkdir: vi.fn().mockResolvedValue(undefined),
    mockDbFindMany: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('fs', () => ({
  promises: {
    writeFile: mockWriteFile,
    rename: mockRename,
    mkdir: mockMkdir,
  },
}));

vi.mock('../../../lib/db.js', () => ({
  db: {
    plugin: {
      findMany: mockDbFindMany,
    },
  },
}));

vi.mock('../../../lib/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  PluginTargetsService,
  pluginTargetsService,
} from '../../../services/plugin-targets.service.js';

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

describe('PluginTargetsService — singleton', () => {
  it('should return the same instance on repeated calls', () => {
    const a = PluginTargetsService.getInstance();
    const b = PluginTargetsService.getInstance();
    expect(a).toBe(b);
  });

  it('exported singleton matches getInstance()', () => {
    expect(pluginTargetsService).toBe(PluginTargetsService.getInstance());
  });
});

// ---------------------------------------------------------------------------
// rebuildTargetsFile
// ---------------------------------------------------------------------------

describe('PluginTargetsService.rebuildTargetsFile()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should call db.plugin.findMany with lifecycleStatus ACTIVE', async () => {
    mockDbFindMany.mockResolvedValue([]);
    await pluginTargetsService.rebuildTargetsFile();
    expect(mockDbFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ lifecycleStatus: expect.any(String) }),
      })
    );
  });

  it('should write an empty JSON array when no active plugins exist', async () => {
    mockDbFindMany.mockResolvedValue([]);
    await pluginTargetsService.rebuildTargetsFile();
    const written = mockWriteFile.mock.calls[0][1] as string;
    expect(JSON.parse(written)).toEqual([]);
  });

  it('should write one entry per active plugin', async () => {
    mockDbFindMany.mockResolvedValue([
      { id: 'plugin-aaa', name: 'Plugin AAA' },
      { id: 'plugin-bbb', name: 'Plugin BBB' },
    ]);
    await pluginTargetsService.rebuildTargetsFile();
    const written = mockWriteFile.mock.calls[0][1] as string;
    const targets = JSON.parse(written) as Array<{
      targets: string[];
      labels: Record<string, string>;
    }>;
    expect(targets).toHaveLength(2);
  });

  it('should use the plugin-<id>:8080 target host convention', async () => {
    mockDbFindMany.mockResolvedValue([{ id: 'plugin-xyz', name: 'XYZ' }]);
    await pluginTargetsService.rebuildTargetsFile();
    const written = mockWriteFile.mock.calls[0][1] as string;
    const targets = JSON.parse(written) as Array<{ targets: string[] }>;
    expect(targets[0].targets[0]).toBe('plugin-plugin-xyz:8080');
  });

  it('should set job label to "plugins" for each target', async () => {
    mockDbFindMany.mockResolvedValue([{ id: 'plugin-xyz', name: 'XYZ' }]);
    await pluginTargetsService.rebuildTargetsFile();
    const written = mockWriteFile.mock.calls[0][1] as string;
    const targets = JSON.parse(written) as Array<{ labels: Record<string, string> }>;
    expect(targets[0].labels.job).toBe('plugins');
  });

  it('should write atomically (write tmp then rename)', async () => {
    mockDbFindMany.mockResolvedValue([]);
    await pluginTargetsService.rebuildTargetsFile();
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    expect(mockRename).toHaveBeenCalledTimes(1);
    // Temp path ends with .tmp
    const tmpPath = mockWriteFile.mock.calls[0][0] as string;
    expect(tmpPath).toMatch(/\.tmp$/);
  });

  it('should ensure the target directory exists before writing', async () => {
    mockDbFindMany.mockResolvedValue([]);
    await pluginTargetsService.rebuildTargetsFile();
    expect(mockMkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true });
  });
});

// ---------------------------------------------------------------------------
// addTarget / removeTarget (delegate to rebuildTargetsFile)
// ---------------------------------------------------------------------------

describe('PluginTargetsService.addTarget()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbFindMany.mockResolvedValue([]);
  });

  it('should call rebuildTargetsFile (writes the JSON file)', async () => {
    await pluginTargetsService.addTarget('plugin-new');
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
  });
});

describe('PluginTargetsService.removeTarget()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbFindMany.mockResolvedValue([]);
  });

  it('should call rebuildTargetsFile (writes the JSON file)', async () => {
    await pluginTargetsService.removeTarget('plugin-old');
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
  });
});
