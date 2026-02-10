import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
  Modal,
  ModalTrigger,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalTitle,
  ModalDescription,
  ModalClose,
} from './Modal';

describe('Dialog', () => {
  it('renders trigger without crashing', () => {
    render(
      <Dialog>
        <DialogTrigger>Open Dialog</DialogTrigger>
      </Dialog>
    );
    expect(screen.getByText('Open Dialog')).toBeInTheDocument();
  });

  it('renders trigger as a button', () => {
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
      </Dialog>
    );
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
  });

  it('opens content when trigger is clicked', async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogTitle>Dialog Title</DialogTitle>
          <DialogDescription>Description text</DialogDescription>
        </DialogContent>
      </Dialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByText('Dialog Title')).toBeInTheDocument();
    expect(screen.getByText('Description text')).toBeInTheDocument();
  });

  it('renders DialogHeader with children', async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Title</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByText('Title')).toBeInTheDocument();
  });

  it('renders DialogFooter with children', async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
          <DialogFooter>
            <button>Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('applies custom className to DialogHeader', async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogHeader data-testid="header" className="custom-header">
            <DialogTitle>Title</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByTestId('header')).toHaveClass('custom-header');
  });

  it('has a close button inside DialogContent', async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
          <p>Content body</p>
        </DialogContent>
      </Dialog>
    );

    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByText('Close')).toBeInTheDocument();
  });
});

describe('Modal aliases', () => {
  it('Modal is the same as Dialog', () => {
    expect(Modal).toBe(Dialog);
  });

  it('ModalTrigger is the same as DialogTrigger', () => {
    expect(ModalTrigger).toBe(DialogTrigger);
  });

  it('ModalContent is the same as DialogContent', () => {
    expect(ModalContent).toBe(DialogContent);
  });

  it('ModalHeader is the same as DialogHeader', () => {
    expect(ModalHeader).toBe(DialogHeader);
  });

  it('ModalFooter is the same as DialogFooter', () => {
    expect(ModalFooter).toBe(DialogFooter);
  });

  it('ModalTitle is the same as DialogTitle', () => {
    expect(ModalTitle).toBe(DialogTitle);
  });

  it('ModalDescription is the same as DialogDescription', () => {
    expect(ModalDescription).toBe(DialogDescription);
  });

  it('ModalClose is the same as DialogClose', () => {
    expect(ModalClose).toBe(DialogClose);
  });
});

describe('Modal usage', () => {
  it('renders using Modal aliases', async () => {
    const user = userEvent.setup();
    render(
      <Modal>
        <ModalTrigger>Open Modal</ModalTrigger>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Modal Title</ModalTitle>
            <ModalDescription>Modal description</ModalDescription>
          </ModalHeader>
          <ModalFooter>
            <button>Confirm</button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    );

    expect(screen.getByRole('button', { name: 'Open Modal' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open Modal' }));
    expect(screen.getByText('Modal Title')).toBeInTheDocument();
    expect(screen.getByText('Modal description')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
  });
});
