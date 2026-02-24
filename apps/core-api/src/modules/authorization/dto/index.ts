// apps/core-api/src/modules/authorization/dto/index.ts
//
// Barrel export for all authorization DTOs

export { CreateRoleSchema } from './create-role.dto.js';
export type { CreateRoleDto } from './create-role.dto.js';

export { UpdateRoleSchema } from './update-role.dto.js';
export type { UpdateRoleDto } from './update-role.dto.js';

export { AssignRoleSchema } from './assign-role.dto.js';
export type { AssignRoleDto } from './assign-role.dto.js';

export {
  ConditionNodeSchema,
  ConditionTreeSchema,
  LeafConditionSchema,
} from './condition-tree.dto.js';
export type { ConditionNodeDto, ConditionTreeDto, LeafConditionDto } from './condition-tree.dto.js';

export { CreatePolicySchema } from './create-policy.dto.js';
export type { CreatePolicyDto } from './create-policy.dto.js';

export { UpdatePolicySchema } from './update-policy.dto.js';
export type { UpdatePolicyDto } from './update-policy.dto.js';
