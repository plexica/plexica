// File: apps/plugin-crm/src/components/ContactsPage.tsx

import React, { useState } from 'react';
import type { PluginProps } from '@plexica/types';

/**
 * Contacts Page - View and manage customer contacts
 */
const ContactsPage: React.FC<PluginProps> = ({ tenantId }) => {
  // Mock contacts data
  const [contacts] = useState([
    {
      id: 1,
      name: 'John Smith',
      email: 'john.smith@acme.com',
      company: 'Acme Corp',
      phone: '+1 (555) 123-4567',
      status: 'Active',
      deals: 3,
      value: '$145K',
    },
    {
      id: 2,
      name: 'Sarah Johnson',
      email: 'sarah.j@techstart.io',
      company: 'TechStart',
      phone: '+1 (555) 234-5678',
      status: 'Active',
      deals: 2,
      value: '$220K',
    },
    {
      id: 3,
      name: 'Mike Davis',
      email: 'mdavis@globalind.com',
      company: 'Global Industries',
      phone: '+1 (555) 345-6789',
      status: 'Active',
      deals: 1,
      value: '$85K',
    },
    {
      id: 4,
      name: 'Emily Chen',
      email: 'emily.chen@innovate.co',
      company: 'Innovate Co',
      phone: '+1 (555) 456-7890',
      status: 'Lead',
      deals: 0,
      value: '$0',
    },
    {
      id: 5,
      name: 'Robert Taylor',
      email: 'rtaylor@megacorp.com',
      company: 'MegaCorp',
      phone: '+1 (555) 567-8901',
      status: 'Active',
      deals: 5,
      value: '$380K',
    },
  ]);

  const [searchTerm, setSearchTerm] = useState('');

  const filteredContacts = contacts.filter(
    (contact) =>
      contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contact.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contact.company.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Contacts</h1>
        <p className="text-gray-600 mt-1">Manage your customer relationships</p>
      </div>

      {/* Search and Actions */}
      <div className="mb-6 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search contacts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium whitespace-nowrap">
          + Add Contact
        </button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <p className="text-sm text-gray-600">Total Contacts</p>
          <p className="text-2xl font-bold text-gray-900">{contacts.length}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <p className="text-sm text-gray-600">Active Customers</p>
          <p className="text-2xl font-bold text-gray-900">
            {contacts.filter((c) => c.status === 'Active').length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <p className="text-sm text-gray-600">Total Pipeline Value</p>
          <p className="text-2xl font-bold text-gray-900">$830K</p>
        </div>
      </div>

      {/* Contacts Table */}
      <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Company
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Contact Info
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Deals
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Value
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredContacts.map((contact) => (
              <tr key={contact.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="h-10 w-10 flex-shrink-0">
                      <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                        <span className="text-blue-600 font-medium">
                          {contact.name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')}
                        </span>
                      </div>
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">{contact.name}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{contact.company}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{contact.email}</div>
                  <div className="text-sm text-gray-500">{contact.phone}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      contact.status === 'Active'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {contact.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {contact.deals}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {contact.value}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button className="text-blue-600 hover:text-blue-900 mr-3">View</button>
                  <button className="text-gray-600 hover:text-gray-900">Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredContacts.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg shadow border border-gray-200 mt-6">
          <p className="text-gray-500">No contacts found matching &quot;{searchTerm}&quot;</p>
        </div>
      )}

      {/* Context Info */}
      <div className="mt-8 p-4 bg-gray-100 rounded text-xs text-gray-600">
        <strong>Plugin Context:</strong> Tenant: {tenantId} | Showing {filteredContacts.length} of{' '}
        {contacts.length} contacts
      </div>
    </div>
  );
};

export default ContactsPage;
