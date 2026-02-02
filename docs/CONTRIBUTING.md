# Contributing to Plexica

Thank you for your interest in contributing to Plexica! This document provides guidelines and instructions for contributing.

## Code of Conduct

- Be respectful and inclusive
- Welcome newcomers
- Focus on constructive feedback
- Prioritize the project's goals

## Development Setup

See [Getting Started Guide](./GETTING_STARTED.md) for detailed setup instructions.

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported
2. Create a detailed bug report including:
   - Steps to reproduce
   - Expected behavior
   - Actual behavior
   - Environment details (OS, Node version, etc.)
   - Relevant logs

### Suggesting Features

1. Check if the feature has already been suggested
2. Create a feature request including:
   - Clear description of the feature
   - Use cases
   - Potential implementation approach
   - Any relevant examples

### Submitting Changes

1. **Fork the repository**

2. **Create a feature branch**

   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/bug-description
   ```

3. **Make your changes**
   - Follow the coding standards (see below)
   - Write tests for new features
   - Update documentation as needed

4. **Commit your changes**

   ```bash
   git commit -m "feat: add new feature"
   # or
   git commit -m "fix: resolve issue with X"
   ```

   Follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` New feature
   - `fix:` Bug fix
   - `docs:` Documentation changes
   - `style:` Code style changes (formatting, etc.)
   - `refactor:` Code refactoring
   - `test:` Adding or updating tests
   - `chore:` Maintenance tasks

5. **Push to your fork**

   ```bash
   git push origin feature/your-feature-name
   ```

6. **Create a Pull Request**
   - Provide a clear title and description
   - Link related issues
   - Request review from maintainers

## Coding Standards

### TypeScript Style

- Use TypeScript strict mode
- Prefer `interface` over `type` for object types
- Use meaningful variable names
- Add JSDoc comments for public APIs
- Avoid `any` type (use `unknown` if needed)

### Code Organization

```typescript
// 1. Imports (grouped and sorted)
import { something } from 'external-package';
import { localThing } from './local';

// 2. Types/Interfaces
interface MyInterface {
  // ...
}

// 3. Constants
const CONSTANT_VALUE = 'value';

// 4. Main code
export class MyClass {
  // ...
}
```

### Naming Conventions

- **Files**: kebab-case (`my-service.ts`)
- **Classes**: PascalCase (`TenantService`)
- **Functions**: camelCase (`getUserById`)
- **Constants**: SCREAMING_SNAKE_CASE (`MAX_RETRIES`)
- **Interfaces**: PascalCase with descriptive names (`UserProfile`, not `IUser`)

### Fastify Routes

```typescript
import { FastifyPluginAsync } from 'fastify';

export const myRoutes: FastifyPluginAsync = async (server) => {
  server.get(
    '/',
    {
      schema: {
        tags: ['tag-name'],
        summary: 'Short description',
        description: 'Longer description',
      },
    },
    async (request, reply) => {
      // Handler implementation
    }
  );
};
```

### Error Handling

```typescript
// Use Fastify's built-in error handling
import { FastifyError } from 'fastify';

// Create errors
throw server.httpErrors.badRequest('Invalid input');
throw server.httpErrors.notFound('Resource not found');

// Custom errors
class TenantNotFoundError extends Error {
  constructor(tenantId: string) {
    super(`Tenant ${tenantId} not found`);
    this.name = 'TenantNotFoundError';
  }
}
```

## Testing

### Writing Tests

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('TenantService', () => {
  beforeAll(async () => {
    // Setup
  });

  afterAll(async () => {
    // Cleanup
  });

  it('should create a new tenant', async () => {
    // Test implementation
    expect(result).toBeDefined();
  });
});
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test -- --watch

# Run tests with coverage
pnpm test -- --coverage

# Run specific test file
pnpm test -- path/to/test.spec.ts
```

## Database Migrations

### Creating Migrations

1. Edit `packages/database/prisma/schema.prisma`
2. Run: `pnpm db:migrate --name descriptive_name`
3. Review generated SQL
4. Test migration on clean database

### Migration Guidelines

- Keep migrations small and focused
- Never edit existing migrations
- Test both up and down migrations
- Document breaking changes

## Documentation

### Code Documentation

- Add JSDoc comments to all exported functions/classes
- Document parameters and return types
- Include usage examples for complex APIs

````typescript
/**
 * Creates a new tenant with the provided configuration.
 *
 * @param data - Tenant creation data
 * @param options - Optional configuration
 * @returns Promise resolving to created tenant
 * @throws TenantAlreadyExistsError if slug is taken
 *
 * @example
 * ```typescript
 * const tenant = await tenantService.create({
 *   name: 'ACME Corp',
 *   slug: 'acme-corp'
 * });
 * ```
 */
async create(data: CreateTenantDto, options?: CreateOptions): Promise<Tenant> {
  // Implementation
}
````

### README Updates

- Update README.md if adding new features
- Keep installation instructions current
- Update examples when APIs change

## Pull Request Process

1. **Before submitting**:
   - [ ] Code builds without errors
   - [ ] All tests pass
   - [ ] Code follows style guidelines
   - [ ] Documentation is updated
   - [ ] Commits follow conventional commits

2. **PR Description**:
   - Clear title following conventional commits
   - Description of changes
   - Related issue numbers
   - Screenshots/videos if UI changes
   - Breaking changes highlighted

3. **Review Process**:
   - Maintainers will review within 2-3 days
   - Address feedback in new commits
   - Don't force-push after review starts
   - Mark resolved conversations

4. **After Approval**:
   - Maintainer will merge (squash merge)
   - Delete your branch after merge

## Release Process

Releases are managed by maintainers:

1. Update version in package.json
2. Update CHANGELOG.md
3. Create git tag: `git tag -a v1.0.0 -m "Release v1.0.0"`
4. Push tag: `git push origin v1.0.0`
5. GitHub Actions will build and deploy

## Questions?

- Check [Getting Started](./GETTING_STARTED.md)
- Review existing issues/PRs
- Ask in team chat
- Create a discussion on GitHub

---

Thank you for contributing to Plexica! 🎉
