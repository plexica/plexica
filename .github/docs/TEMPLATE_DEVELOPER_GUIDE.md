# Documentation Template: Developer Guide

**Purpose**: Use this template when creating developer guides, tutorials, or setup documentation in `docs/`.

---

````markdown
# [Feature/Component Name] Developer Guide

**Last Updated**: YYYY-MM-DD  
**Status**: Draft | Complete | Needs Review  
**Audience**: Backend developers | Frontend developers | DevOps  
**Prerequisites**: Node.js 20+, Docker, PostgreSQL  
**Time to Complete**: 15-30 minutes

## Table of Contents

1. [Quick Start](#quick-start)
2. [How It Works](#how-it-works)
3. [Common Tasks](#common-tasks)
4. [Troubleshooting](#troubleshooting)
5. [Advanced Usage](#advanced-usage)
6. [See Also](#see-also)

## Quick Start

Get up and running in 5 minutes:

```bash
# 1. Clone repository
git clone https://github.com/plexica/plexica.git
cd plexica

# 2. Install dependencies
pnpm install

# 3. Start development environment
pnpm dev

# 4. Run tests
pnpm test
```
````

**Verify it works**:

```bash
# Check that all services are running
curl http://localhost:3000/health  # Should return { status: "ok" }
```

## How It Works

### Architecture Overview

[Explain the system flow, key components, and how they interact]

```
┌─────────────┐          ┌──────────────┐          ┌─────────────┐
│   Request   │ ────────>│   Service    │ ────────>│  Database   │
│   Handler   │          │    Logic     │          │             │
└─────────────┘          └──────────────┘          └─────────────┘
      │                         │                         │
      └─────── Event Stream ────┴─────── Logging ────────┘
```

### Key Concepts

**Concept 1: [Name]**
: [2-3 sentence explanation of what this is and why it matters]

**Concept 2: [Name]**
: [Clear explanation with context]

**Concept 3: [Name]**
: [How it relates to the overall system]

### Data Flow

When a user performs action X:

1. **Step 1**: Description of what happens

   ```
   Input: { param1, param2 }
   ```

2. **Step 2**: Description of next step

   ```
   Processing: [What system does]
   ```

3. **Step 3**: Final result
   ```
   Output: { result1, result2 }
   ```

### File Structure

```
apps/core-api/src/
├── modules/
│   └── feature/
│       ├── feature.service.ts        # Business logic
│       ├── feature.controller.ts      # API endpoints
│       ├── feature.dto.ts             # Data transfer objects
│       └── feature.module.ts          # Module setup
├── __tests__/
│   └── feature/
│       ├── unit/                      # Service tests
│       ├── integration/               # API tests
│       └── e2e/                       # End-to-end tests
└── lib/
    └── db.ts                          # Database connection
```

## Common Tasks

### Task 1: How to [Do Something]

**Scenario**: [When would you need to do this?]

```bash
# Command to do the task
pnpm [command] [options]
```

**Explanation**:
[Detailed explanation of what this command does and why]

**Expected Output**:

```
[Sample output or result]
```

**Verification**:

```bash
# How to verify it worked
[Command to check]
```

### Task 2: How to [Do Something Else]

**Scenario**: [Context]

**Steps**:

1. First, prepare your environment:

   ```bash
   export FEATURE_FLAG=true
   ```

2. Then run the operation:

   ```bash
   pnpm [command]
   ```

3. Verify the result:
   ```bash
   pnpm test [test-path]
   ```

### Task 3: How to Debug Issues

**Enable Debug Logging**:

```bash
DEBUG=plexica:* pnpm dev
```

**Common Debug Patterns**:

```typescript
// File: src/modules/feature/feature.service.ts
import debug from 'debug';

const log = debug('plexica:feature');

export class FeatureService {
  async execute(input: Input) {
    log('Input received:', input);

    const result = await this.process(input);

    log('Processing complete:', result);
    return result;
  }
}
```

## Troubleshooting

### Issue 1: [Description of Problem]

**Symptoms**:

- Error message or behavior description

**Root Cause**:

- What causes this issue

**Solution**:

```bash
# Step-by-step fix
pnpm [command]
```

**Prevention**:

- How to avoid this in the future

### Issue 2: [Common Error]

**Symptoms**:

```
Error: [Exact error message]
```

**Solution**:

Option A (Quick Fix):

```bash
# Fast resolution
pnpm [command]
```

Option B (Deep Fix):

```bash
# Thorough resolution
pnpm [command]
# Then verify:
pnpm test
```

### Still Having Issues?

1. Check [Common Mistakes](#common-mistakes) section
2. Review [FAQ](#faq) section
3. Search [GitHub Issues](https://github.com/plexica/plexica/issues)
4. Ask in [Discussions](https://github.com/plexica/plexica/discussions)

## Advanced Usage

### Advanced Task: [For Experienced Users]

**Prerequisites**: Understand [other guide] first

[Detailed instructions for advanced usage]

```typescript
// File: src/modules/feature/advanced.example.ts
// Advanced pattern demonstration
```

### Configuration Options

| Environment Variable | Default | Description             |
| -------------------- | ------- | ----------------------- |
| `FEATURE_ENABLED`    | `true`  | Enable/disable feature  |
| `FEATURE_TIMEOUT`    | `5000`  | Timeout in milliseconds |
| `DEBUG`              | (unset) | Enable debug logging    |

### Performance Tuning

**For high-load scenarios**:

- Set `FEATURE_TIMEOUT=10000`
- Enable Redis caching: `CACHE_ENABLED=true`
- Use connection pooling: `DB_POOL_SIZE=30`

## Common Mistakes

❌ **Mistake 1**: [What people often do wrong]

- Why this fails: [Explanation]
- ✅ Correct approach: [How to do it right]

❌ **Mistake 2**: [Another common error]

- Problem: [What breaks]
- ✅ Solution: [Correct way]

## FAQ

**Q: How do I [common question]?**
A: [Clear, concise answer with code example if relevant]

**Q: What's the difference between [concept A] and [concept B]?**
A: [Explanation with examples]

**Q: Can I use this feature with [external system]?**
A: [Yes/No with explanation and links to related docs]

## See Also

- [Quick Start Guide](./QUICKSTART_GUIDE.md) - 5-10 minute setup
- [Security Guidelines](./SECURITY.md) - Important security practices
- [Architecture Overview](./ARCHITECTURE.md) - System design
- [Contributing Guide](./CONTRIBUTING.md) - How to contribute
- [API Documentation](../specs/TECHNICAL_SPECIFICATIONS.md) - API reference

## Support

- 📖 [Full Documentation](https://docs.plexica.io)
- 🐛 [Report Issues](https://github.com/plexica/plexica/issues)
- 💬 [Discussions](https://github.com/plexica/plexica/discussions)
- 🔒 [Security Report](./SECURITY.md#reporting)

---

```

## Notes for Using This Template

1. **Audience**: Clearly state who this guide is for at the top
2. **Prerequisites**: Be explicit about what readers need to know/have installed
3. **Quick Start**: Make this section copy-paste ready (people just want it to work)
4. **Code Examples**: All examples must be tested and working
5. **Diagrams**: Use ASCII art or describe in detail if no images
6. **Troubleshooting**: Include actual error messages people will see
7. **Tone**: Be friendly and encouraging; assume the reader is smart but unfamiliar
8. **Updates**: Keep "Last Updated" current; archive old versions
9. **Links**: Always link to related documentation and resources

## Guide Types

Different guide purposes may need adjustments:

**Getting Started Guide**:
- Focus on "before you code" setup
- More troubleshooting (more things can go wrong)
- More verification steps

**Feature Implementation Guide**:
- Focus on "how to build with this"
- More code examples
- More advanced usage section

**Architecture Guide**:
- Focus on "why it works this way"
- More diagrams and system flow
- More concepts and theory

**API Reference**:
- Focus on "what endpoints exist"
- More tables and formal structure
- Less narrative explanation
```
