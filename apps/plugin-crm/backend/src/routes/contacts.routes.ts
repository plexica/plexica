/**
 * Contacts Routes (M2.3 Task 10)
 *
 * REST API endpoints for contact management
 */

import type { FastifyInstance } from 'fastify';
import type { ContactsService } from '../services/contacts.service.js';
import type { CreateContactInput, UpdateContactInput } from '../types/index.js';

export async function contactsRoutes(fastify: FastifyInstance, contactsService: ContactsService) {
  /**
   * GET /contacts
   * List all contacts with optional filtering
   */
  fastify.get('/contacts', async (request, reply) => {
    const { skip, take, search, tags, sortBy, sortOrder } = request.query as any;

    const result = contactsService.list({
      skip: skip ? parseInt(skip) : undefined,
      take: take ? parseInt(take) : undefined,
      search,
      tags: tags ? (Array.isArray(tags) ? tags : [tags]) : undefined,
      sortBy,
      sortOrder,
    });

    return reply.send({
      success: true,
      data: result.contacts,
      total: result.total,
    });
  });

  /**
   * GET /contacts/:id
   * Get a specific contact by ID
   */
  fastify.get<{ Params: { id: string } }>('/contacts/:id', async (request, reply) => {
    const { id } = request.params;
    const contact = contactsService.getById(id);

    if (!contact) {
      return reply.status(404).send({
        success: false,
        error: 'Contact not found',
      });
    }

    return reply.send({
      success: true,
      data: contact,
    });
  });

  /**
   * POST /contacts
   * Create a new contact
   */
  fastify.post<{ Body: CreateContactInput }>('/contacts', async (request, reply) => {
    const input = request.body;

    // Basic validation
    if (!input.firstName || !input.lastName || !input.email) {
      return reply.status(400).send({
        success: false,
        error: 'firstName, lastName, and email are required',
      });
    }

    const contact = contactsService.create(input);

    return reply.status(201).send({
      success: true,
      data: contact,
    });
  });

  /**
   * PUT /contacts/:id
   * Update an existing contact
   */
  fastify.put<{ Params: { id: string }; Body: UpdateContactInput }>(
    '/contacts/:id',
    async (request, reply) => {
      const { id } = request.params;
      const input = request.body;

      const contact = contactsService.update(id, input);

      if (!contact) {
        return reply.status(404).send({
          success: false,
          error: 'Contact not found',
        });
      }

      return reply.send({
        success: true,
        data: contact,
      });
    }
  );

  /**
   * DELETE /contacts/:id
   * Delete a contact
   */
  fastify.delete<{ Params: { id: string } }>('/contacts/:id', async (request, reply) => {
    const { id } = request.params;
    const deleted = contactsService.delete(id);

    if (!deleted) {
      return reply.status(404).send({
        success: false,
        error: 'Contact not found',
      });
    }

    return reply.send({
      success: true,
      message: 'Contact deleted',
    });
  });

  /**
   * GET /contacts/company/:company
   * Get contacts by company
   */
  fastify.get<{ Params: { company: string } }>(
    '/contacts/company/:company',
    async (request, reply) => {
      const { company } = request.params;
      const contacts = contactsService.getByCompany(company);

      return reply.send({
        success: true,
        data: contacts,
        total: contacts.length,
      });
    }
  );

  /**
   * GET /contacts/tag/:tag
   * Get contacts by tag
   */
  fastify.get<{ Params: { tag: string } }>('/contacts/tag/:tag', async (request, reply) => {
    const { tag } = request.params;
    const contacts = contactsService.getByTag(tag);

    return reply.send({
      success: true,
      data: contacts,
      total: contacts.length,
    });
  });
}
