import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Input, Badge, Card } from '@plexica/ui';
import { Search } from 'lucide-react';
import { apiClient } from '../../lib/api-client';
import { UserDetailModal } from '../modals/UserDetailModal';

interface User {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  roles: string[];
  status: string;
  lastLogin: string;
  createdAt: string;
}

export function UsersView() {
  const [searchQuery, setSearchQuery] = useState('');
  const [tenantFilter, setTenantFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // NOTE: Using mock data since backend API endpoint doesn't exist yet
  // In production, this would use: useQuery({ queryKey: ['users'], queryFn: () => apiClient.getUsers() })
  const { data: tenantsData } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => apiClient.getTenants(),
  });

  const tenants = tenantsData?.tenants || [];

  // Mock users data (simulates cross-tenant user list from API)
  const mockUsers: User[] = [
    {
      id: '1',
      email: 'john.doe@acme.com',
      name: 'John Doe',
      tenantId: tenants.find((t: any) => t.slug === 'acme-corp')?.id || '1',
      tenantName: 'ACME Corporation',
      tenantSlug: 'acme-corp',
      roles: ['admin', 'user'],
      status: 'active',
      lastLogin: '2026-01-14T10:30:00Z',
      createdAt: '2026-01-10T08:00:00Z',
    },
    {
      id: '2',
      email: 'jane.smith@globex.com',
      name: 'Jane Smith',
      tenantId: tenants.find((t: any) => t.slug === 'globex-inc')?.id || '2',
      tenantName: 'Globex Inc',
      tenantSlug: 'globex-inc',
      roles: ['user'],
      status: 'active',
      lastLogin: '2026-01-14T09:15:00Z',
      createdAt: '2026-01-11T10:00:00Z',
    },
    {
      id: '3',
      email: 'bob.johnson@acme.com',
      name: 'Bob Johnson',
      tenantId: tenants.find((t: any) => t.slug === 'acme-corp')?.id || '1',
      tenantName: 'ACME Corporation',
      tenantSlug: 'acme-corp',
      roles: ['user'],
      status: 'active',
      lastLogin: '2026-01-13T16:45:00Z',
      createdAt: '2026-01-12T14:00:00Z',
    },
    {
      id: '4',
      email: 'alice.williams@demo.com',
      name: 'Alice Williams',
      tenantId: tenants.find((t: any) => t.slug === 'demo-company')?.id || '3',
      tenantName: 'Demo Company',
      tenantSlug: 'demo-company',
      roles: ['admin', 'user'],
      status: 'active',
      lastLogin: '2026-01-14T11:00:00Z',
      createdAt: '2026-01-09T09:00:00Z',
    },
    {
      id: '5',
      email: 'charlie.brown@globex.com',
      name: 'Charlie Brown',
      tenantId: tenants.find((t: any) => t.slug === 'globex-inc')?.id || '2',
      tenantName: 'Globex Inc',
      tenantSlug: 'globex-inc',
      roles: ['admin', 'user'],
      status: 'active',
      lastLogin: '2026-01-12T14:30:00Z',
      createdAt: '2026-01-08T11:00:00Z',
    },
  ];

  // Filter users
  const allUsers = mockUsers;
  const users = allUsers.filter((user) => {
    const matchesSearch =
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.tenantName.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesTenant = tenantFilter === 'all' || user.tenantSlug === tenantFilter;
    const matchesRole = roleFilter === 'all' || user.roles.includes(roleFilter);

    return matchesSearch && matchesTenant && matchesRole;
  });

  // Get unique roles
  const allRoles = Array.from(new Set(allUsers.flatMap((u) => u.roles)));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-1">Platform Users</h2>
          <p className="text-muted-foreground">View all users across all tenants</p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-4 mb-6">
        {/* Search Input */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search users by name, email, or tenant..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Tenant Filter */}
        <select
          value={tenantFilter}
          onChange={(e) => setTenantFilter(e.target.value)}
          className="px-4 py-2 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="all">All Tenants</option>
          {tenants.map((tenant: any) => (
            <option key={tenant.id} value={tenant.slug}>
              {tenant.name}
            </option>
          ))}
        </select>

        {/* Role Filter */}
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-4 py-2 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="all">All Roles</option>
          {allRoles.map((role) => (
            <option key={role} value={role}>
              {role.charAt(0).toUpperCase() + role.slice(1)}
            </option>
          ))}
        </select>

        {/* Clear Filters */}
        {(searchQuery || tenantFilter !== 'all' || roleFilter !== 'all') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchQuery('');
              setTenantFilter('all');
              setRoleFilter('all');
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="mb-6 flex items-center gap-6 text-sm text-muted-foreground">
        <span>
          <strong className="text-foreground">{allUsers.length}</strong> total users
        </span>
        <span>•</span>
        <span>
          <strong className="text-foreground">{tenants.length}</strong> tenants
        </span>
        <span>•</span>
        <span>
          <strong className="text-foreground">{allRoles.length}</strong> roles
        </span>
        {(searchQuery || tenantFilter !== 'all' || roleFilter !== 'all') && (
          <>
            <span>•</span>
            <span>
              <strong className="text-foreground">{users.length}</strong> results
            </span>
          </>
        )}
      </div>

      {/* Users Table */}
      <Card>
        <table className="w-full">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                Tenant
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                Roles
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                Last Login
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-6 py-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">{user.name}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div>
                    <p className="text-sm text-foreground">{user.tenantName}</p>
                    <p className="text-xs text-muted-foreground">{user.tenantSlug}</p>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-1">
                    {user.roles.map((role) => (
                      <Badge key={role} variant="secondary" className="text-xs">
                        {role}
                      </Badge>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-muted-foreground">
                  {new Date(user.lastLogin).toLocaleString()}
                </td>
                <td className="px-6 py-4 text-right">
                  <Button variant="ghost" size="sm" onClick={() => setSelectedUser(user)}>
                    View
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Empty State - No Users */}
        {allUsers.length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">👥</div>
            <h3 className="text-xl font-semibold text-foreground mb-2">No users yet</h3>
            <p className="text-muted-foreground">Users will appear here once tenants are created</p>
          </div>
        )}

        {/* No Results State - Filtered */}
        {allUsers.length > 0 && users.length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🔍</div>
            <h3 className="text-xl font-semibold text-foreground mb-2">No users found</h3>
            <p className="text-muted-foreground">Try adjusting your search or filters</p>
          </div>
        )}
      </Card>

      {/* User Detail Modal */}
      {selectedUser && (
        <UserDetailModal user={selectedUser} onClose={() => setSelectedUser(null)} />
      )}
    </div>
  );
}
