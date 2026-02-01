import { describe, it, expect } from 'vitest';
import { WorkspaceRole } from '@plexica/database';

/**
 * Unit Tests: Workspace Validation
 *
 * Tests validation logic for:
 * - Slug format and uniqueness
 * - Name validation
 * - Settings JSON validation
 * - Member validation
 *
 * These tests verify business rules without database dependencies.
 */

describe('Workspace Validation', () => {
  describe('Slug Validation', () => {
    /**
     * Slug validation rules:
     * - Only lowercase letters, numbers, and hyphens
     * - Min length: 3 characters
     * - Max length: 64 characters
     * - Cannot start or end with hyphen
     * - No consecutive hyphens
     */
    function validateSlug(slug: string): { valid: boolean; error?: string } {
      if (!slug) {
        return { valid: false, error: 'Slug is required' };
      }

      if (slug.length < 3) {
        return { valid: false, error: 'Slug must be at least 3 characters' };
      }

      if (slug.length > 64) {
        return { valid: false, error: 'Slug must not exceed 64 characters' };
      }

      if (!/^[a-z0-9-]+$/.test(slug)) {
        return {
          valid: false,
          error: 'Slug can only contain lowercase letters, numbers, and hyphens',
        };
      }

      if (slug.startsWith('-') || slug.endsWith('-')) {
        return { valid: false, error: 'Slug cannot start or end with a hyphen' };
      }

      if (slug.includes('--')) {
        return { valid: false, error: 'Slug cannot contain consecutive hyphens' };
      }

      return { valid: true };
    }

    it('should accept valid slug formats', () => {
      const validSlugs = [
        'eng-team',
        'marketing-2024',
        'dev',
        'product-design-team',
        'team-alpha-1',
        'abc',
        'a'.repeat(64),
      ];

      validSlugs.forEach((slug) => {
        const result = validateSlug(slug);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });

    it('should reject invalid characters', () => {
      const invalidSlugs = [
        'ENG-TEAM', // uppercase
        'eng_team', // underscore
        'eng.team', // dot
        'eng team', // space
        'eng@team', // special char
        'eng/team', // slash
        'eng\\team', // backslash
      ];

      invalidSlugs.forEach((slug) => {
        const result = validateSlug(slug);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('lowercase letters, numbers, and hyphens');
      });
    });

    it('should enforce minimum length', () => {
      const tooShort = ['a', 'ab', ''];

      tooShort.forEach((slug) => {
        const result = validateSlug(slug);
        expect(result.valid).toBe(false);
        if (slug === '') {
          expect(result.error).toBe('Slug is required');
        } else {
          expect(result.error).toContain('at least 3 characters');
        }
      });
    });

    it('should enforce maximum length', () => {
      const tooLong = 'a'.repeat(65);
      const result = validateSlug(tooLong);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('must not exceed 64 characters');
    });

    it('should reject slugs starting or ending with hyphen', () => {
      const invalidSlugs = ['-eng-team', 'eng-team-', '-eng-'];

      invalidSlugs.forEach((slug) => {
        const result = validateSlug(slug);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('cannot start or end with a hyphen');
      });
    });

    it('should reject slugs with consecutive hyphens', () => {
      const invalidSlugs = ['eng--team', 'team--alpha', 'a--b--c'];

      invalidSlugs.forEach((slug) => {
        const result = validateSlug(slug);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('consecutive hyphens');
      });
    });

    it('should handle edge cases', () => {
      // Valid edge cases
      expect(validateSlug('a-b').valid).toBe(true); // Exactly 3 chars - valid
      expect(validateSlug('a-1').valid).toBe(true); // Exactly 3 chars - valid
      expect(validateSlug('abc').valid).toBe(true); // Min valid length

      // Boundary testing
      expect(validateSlug('a'.repeat(3)).valid).toBe(true);
      expect(validateSlug('a'.repeat(64)).valid).toBe(true);
      expect(validateSlug('a'.repeat(65)).valid).toBe(false);
    });
  });

  describe('Slug Uniqueness', () => {
    /**
     * Slug uniqueness rules:
     * - Must be unique within tenant
     * - Same slug can exist in different tenants
     */
    interface Workspace {
      id: string;
      tenantId: string;
      slug: string;
    }

    function isSlugUnique(
      slug: string,
      tenantId: string,
      existingWorkspaces: Workspace[]
    ): boolean {
      return !existingWorkspaces.some((w) => w.slug === slug && w.tenantId === tenantId);
    }

    it('should enforce uniqueness per tenant', () => {
      const workspaces: Workspace[] = [
        { id: '1', tenantId: 'tenant-a', slug: 'eng-team' },
        { id: '2', tenantId: 'tenant-a', slug: 'marketing' },
        { id: '3', tenantId: 'tenant-b', slug: 'eng-team' }, // Same slug, different tenant
      ];

      // Should reject duplicate in same tenant
      expect(isSlugUnique('eng-team', 'tenant-a', workspaces)).toBe(false);

      // Should allow in different tenant
      expect(isSlugUnique('eng-team', 'tenant-c', workspaces)).toBe(true);

      // Should allow new slug in same tenant
      expect(isSlugUnique('design-team', 'tenant-a', workspaces)).toBe(true);
    });

    it('should allow same slug across different tenants', () => {
      const workspaces: Workspace[] = [{ id: '1', tenantId: 'tenant-a', slug: 'eng-team' }];

      expect(isSlugUnique('eng-team', 'tenant-b', workspaces)).toBe(true);
      expect(isSlugUnique('eng-team', 'tenant-c', workspaces)).toBe(true);
    });
  });

  describe('Name Validation', () => {
    /**
     * Name validation rules:
     * - Required field
     * - Min length: 1 character
     * - Max length: 100 characters
     * - Trim whitespace
     */
    function validateName(name: string): { valid: boolean; error?: string; trimmed?: string } {
      if (!name) {
        return { valid: false, error: 'Name is required' };
      }

      const trimmed = name.trim();

      if (trimmed.length === 0) {
        return { valid: false, error: 'Name cannot be empty' };
      }

      if (trimmed.length > 100) {
        return { valid: false, error: 'Name must not exceed 100 characters' };
      }

      return { valid: true, trimmed };
    }

    it('should accept valid names', () => {
      const validNames = [
        'Engineering',
        'Engineering Team',
        'Product & Design',
        'Team 2024',
        'A',
        'A'.repeat(100),
      ];

      validNames.forEach((name) => {
        const result = validateName(name);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });

    it('should reject empty names', () => {
      const emptyNames = ['', '   ', '\t', '\n'];

      emptyNames.forEach((name) => {
        const result = validateName(name);
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/required|empty/i);
      });
    });

    it('should enforce maximum length', () => {
      const tooLong = 'A'.repeat(101);
      const result = validateName(tooLong);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('must not exceed 100 characters');
    });

    it('should trim whitespace', () => {
      const names = [
        { input: '  Engineering  ', expected: 'Engineering' },
        { input: '\tTeam Alpha\n', expected: 'Team Alpha' },
        { input: '   Design   ', expected: 'Design' },
      ];

      names.forEach(({ input, expected }) => {
        const result = validateName(input);
        expect(result.valid).toBe(true);
        expect(result.trimmed).toBe(expected);
      });
    });

    it('should handle edge cases', () => {
      expect(validateName('A').valid).toBe(true);
      expect(validateName('A'.repeat(100)).valid).toBe(true);
      expect(validateName('A'.repeat(101)).valid).toBe(false);
    });
  });

  describe('Settings Validation', () => {
    /**
     * Settings validation rules:
     * - Must be valid JSON object
     * - Cannot be null
     * - Can be empty object
     */
    function validateSettings(settings: any): { valid: boolean; error?: string } {
      if (settings === null) {
        return { valid: false, error: 'Settings cannot be null' };
      }

      if (typeof settings !== 'object') {
        return { valid: false, error: 'Settings must be an object' };
      }

      if (Array.isArray(settings)) {
        return { valid: false, error: 'Settings must be an object, not an array' };
      }

      return { valid: true };
    }

    it('should accept valid settings objects', () => {
      const validSettings = [
        {},
        { theme: 'dark' },
        { notifications: { email: true, slack: false } },
        { features: ['feature1', 'feature2'] },
        { maxMembers: 100, allowGuests: true },
      ];

      validSettings.forEach((settings) => {
        const result = validateSettings(settings);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });

    it('should reject invalid settings', () => {
      const invalidSettings = [
        { value: null, error: 'cannot be null' },
        { value: 'string', error: 'must be an object' },
        { value: 123, error: 'must be an object' },
        { value: [], error: 'not an array' },
        { value: true, error: 'must be an object' },
      ];

      invalidSettings.forEach(({ value, error }) => {
        const result = validateSettings(value);
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(new RegExp(error, 'i'));
      });
    });

    it('should accept empty settings object', () => {
      const result = validateSettings({});
      expect(result.valid).toBe(true);
    });

    it('should handle nested objects', () => {
      const settings = {
        notifications: {
          email: true,
          channels: {
            slack: true,
            teams: false,
          },
        },
      };

      const result = validateSettings(settings);
      expect(result.valid).toBe(true);
    });
  });

  describe('Member Validation', () => {
    /**
     * Member validation rules:
     * - User ID is required
     * - Role must be valid enum value
     * - Cannot add duplicate members
     */
    function validateMember(
      userId: string,
      role: WorkspaceRole
    ): { valid: boolean; error?: string } {
      if (!userId) {
        return { valid: false, error: 'User ID is required' };
      }

      const validRoles = Object.values(WorkspaceRole);
      if (!validRoles.includes(role)) {
        return { valid: false, error: 'Invalid role' };
      }

      return { valid: true };
    }

    function isDuplicateMember(
      userId: string,
      existingMembers: Array<{ userId: string }>
    ): boolean {
      return existingMembers.some((m) => m.userId === userId);
    }

    it('should validate role enum', () => {
      const userId = 'user-123';

      // Valid roles
      expect(validateMember(userId, WorkspaceRole.ADMIN).valid).toBe(true);
      expect(validateMember(userId, WorkspaceRole.MEMBER).valid).toBe(true);
      expect(validateMember(userId, WorkspaceRole.VIEWER).valid).toBe(true);
    });

    it('should require user ID', () => {
      const result = validateMember('', WorkspaceRole.MEMBER);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('User ID is required');
    });

    it('should prevent duplicate members', () => {
      const existingMembers = [{ userId: 'user-1' }, { userId: 'user-2' }, { userId: 'user-3' }];

      expect(isDuplicateMember('user-1', existingMembers)).toBe(true);
      expect(isDuplicateMember('user-4', existingMembers)).toBe(false);
    });

    it('should validate member before adding', () => {
      const existingMembers = [{ userId: 'user-1' }];
      const newUserId = 'user-2';
      const role = WorkspaceRole.MEMBER;

      const validation = validateMember(newUserId, role);
      const isDuplicate = isDuplicateMember(newUserId, existingMembers);

      expect(validation.valid).toBe(true);
      expect(isDuplicate).toBe(false);
    });
  });

  describe('Description Validation', () => {
    /**
     * Description validation rules:
     * - Optional field
     * - Max length: 500 characters
     * - Trim whitespace
     */
    function validateDescription(description?: string): {
      valid: boolean;
      error?: string;
      trimmed?: string;
    } {
      // Description is optional
      if (description === undefined || description === null) {
        return { valid: true };
      }

      const trimmed = description.trim();

      // Empty after trim is valid (treated as no description)
      if (trimmed.length === 0) {
        return { valid: true, trimmed: undefined };
      }

      if (trimmed.length > 500) {
        return { valid: false, error: 'Description must not exceed 500 characters' };
      }

      return { valid: true, trimmed };
    }

    it('should accept valid descriptions', () => {
      const validDescriptions = [undefined, null, '', 'Short description', 'A'.repeat(500)];

      validDescriptions.forEach((desc) => {
        const result = validateDescription(desc);
        expect(result.valid).toBe(true);
      });
    });

    it('should enforce maximum length', () => {
      const tooLong = 'A'.repeat(501);
      const result = validateDescription(tooLong);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('must not exceed 500 characters');
    });

    it('should trim whitespace', () => {
      const descriptions = [
        { input: '  Short desc  ', expected: 'Short desc' },
        { input: '\tTeam description\n', expected: 'Team description' },
      ];

      descriptions.forEach(({ input, expected }) => {
        const result = validateDescription(input);
        expect(result.valid).toBe(true);
        expect(result.trimmed).toBe(expected);
      });
    });

    it('should treat empty string as no description', () => {
      const result = validateDescription('   ');
      expect(result.valid).toBe(true);
      expect(result.trimmed).toBeUndefined();
    });
  });

  describe('Complete DTO Validation', () => {
    interface CreateWorkspaceDto {
      slug: string;
      name: string;
      description?: string;
      settings?: Record<string, any>;
    }

    function validateCreateWorkspaceDto(dto: CreateWorkspaceDto): {
      valid: boolean;
      errors: string[];
    } {
      const errors: string[] = [];

      // Validate slug
      function validateSlug(slug: string): string | undefined {
        if (!slug) return 'Slug is required';
        if (slug.length < 3) return 'Slug must be at least 3 characters';
        if (slug.length > 64) return 'Slug must not exceed 64 characters';
        if (!/^[a-z0-9-]+$/.test(slug)) {
          return 'Slug can only contain lowercase letters, numbers, and hyphens';
        }
        if (slug.startsWith('-') || slug.endsWith('-')) {
          return 'Slug cannot start or end with a hyphen';
        }
        if (slug.includes('--')) return 'Slug cannot contain consecutive hyphens';
        return undefined;
      }

      const slugError = validateSlug(dto.slug);
      if (slugError) errors.push(slugError);

      // Validate name
      if (!dto.name || dto.name.trim().length === 0) {
        errors.push('Name is required');
      } else if (dto.name.trim().length > 100) {
        errors.push('Name must not exceed 100 characters');
      }

      // Validate description (optional)
      if (dto.description && dto.description.trim().length > 500) {
        errors.push('Description must not exceed 500 characters');
      }

      // Validate settings (optional)
      if (dto.settings !== undefined) {
        if (
          dto.settings === null ||
          typeof dto.settings !== 'object' ||
          Array.isArray(dto.settings)
        ) {
          errors.push('Settings must be a valid object');
        }
      }

      return { valid: errors.length === 0, errors };
    }

    it('should accept valid DTO', () => {
      const validDto: CreateWorkspaceDto = {
        slug: 'eng-team',
        name: 'Engineering Team',
        description: 'Our engineering workspace',
        settings: { theme: 'dark' },
      };

      const result = validateCreateWorkspaceDto(validDto);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept minimal valid DTO', () => {
      const minimalDto: CreateWorkspaceDto = {
        slug: 'eng',
        name: 'Eng',
      };

      const result = validateCreateWorkspaceDto(minimalDto);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should collect multiple validation errors', () => {
      const invalidDto: CreateWorkspaceDto = {
        slug: 'AB', // Too short, uppercase
        name: '', // Empty
        description: 'A'.repeat(501), // Too long
        settings: null as any, // Null
      };

      const result = validateCreateWorkspaceDto(invalidDto);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });

    it('should handle partial invalid DTO', () => {
      const dto: CreateWorkspaceDto = {
        slug: 'valid-slug',
        name: '', // Invalid
      };

      const result = validateCreateWorkspaceDto(dto);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Name is required');
      expect(result.errors.length).toBe(1);
    });
  });
});
