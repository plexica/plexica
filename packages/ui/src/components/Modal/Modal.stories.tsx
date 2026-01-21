import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Modal,
  ModalTrigger,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalTitle,
  ModalDescription,
  ModalClose,
} from './Modal';
import { Button } from '../Button/Button';
import { Input } from '../Input/Input';
import { Label } from '../Label/Label';

const meta: Meta<typeof Modal> = {
  title: 'Components/Modal',
  component: Modal,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Modal>;

export const Default: Story = {
  render: () => (
    <Modal>
      <ModalTrigger asChild>
        <Button>Open Modal</Button>
      </ModalTrigger>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Modal Title</ModalTitle>
          <ModalDescription>This is a modal description.</ModalDescription>
        </ModalHeader>
        <div className="py-4">
          <p>Modal content goes here.</p>
        </div>
        <ModalFooter>
          <ModalClose asChild>
            <Button variant="secondary">Cancel</Button>
          </ModalClose>
          <Button>Confirm</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  ),
};

export const DeleteConfirmation: Story = {
  render: () => (
    <Modal>
      <ModalTrigger asChild>
        <Button variant="danger">Delete Contact</Button>
      </ModalTrigger>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>⚠️ Delete Contact?</ModalTitle>
          <ModalDescription>
            This will permanently delete John Doe. This cannot be undone.
          </ModalDescription>
        </ModalHeader>
        <ModalFooter>
          <ModalClose asChild>
            <Button variant="secondary">Cancel</Button>
          </ModalClose>
          <Button variant="danger">Delete</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  ),
};

export const WithForm: Story = {
  render: () => (
    <Modal>
      <ModalTrigger asChild>
        <Button>Create New Contact</Button>
      </ModalTrigger>
      <ModalContent className="max-w-md">
        <ModalHeader>
          <ModalTitle>Create Contact</ModalTitle>
          <ModalDescription>Add a new contact to your CRM.</ModalDescription>
        </ModalHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input id="name" placeholder="John Doe" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input id="email" type="email" placeholder="john@example.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" type="tel" placeholder="+1 234 567 8900" />
          </div>
        </div>
        <ModalFooter>
          <ModalClose asChild>
            <Button variant="secondary">Cancel</Button>
          </ModalClose>
          <Button>Create Contact</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  ),
};

export const ShareWorkspace: Story = {
  render: () => (
    <Modal>
      <ModalTrigger asChild>
        <Button variant="secondary">Share Contact</Button>
      </ModalTrigger>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Share Contact</ModalTitle>
          <ModalDescription>Share this contact with other workspaces.</ModalDescription>
        </ModalHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Share with workspace:</Label>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input type="checkbox" id="marketing" />
                <label htmlFor="marketing">Marketing</label>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="engineering" />
                <label htmlFor="engineering">Engineering</label>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Permission:</Label>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input type="radio" id="readonly" name="permission" defaultChecked />
                <label htmlFor="readonly">Read-only</label>
              </div>
              <div className="flex items-center gap-2">
                <input type="radio" id="canedit" name="permission" />
                <label htmlFor="canedit">Can edit</label>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="notify" defaultChecked />
            <label htmlFor="notify">Send notification</label>
          </div>
        </div>
        <ModalFooter>
          <ModalClose asChild>
            <Button variant="secondary">Cancel</Button>
          </ModalClose>
          <Button>Share</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  ),
};
