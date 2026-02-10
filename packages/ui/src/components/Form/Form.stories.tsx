import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from './Form';

const meta: Meta<typeof Form> = {
  title: 'Components/Form',
  component: Form,
  tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof Form>;

export const Default: Story = {
  render: () => (
    <Form>
      <FormField name="email">
        <FormItem>
          <FormLabel>Email</FormLabel>
          <FormControl>
            <input
              type="email"
              placeholder="you@example.com"
              className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </FormControl>
          <FormDescription>We&apos;ll never share your email.</FormDescription>
        </FormItem>
      </FormField>
    </Form>
  ),
};

export const WithError: Story = {
  render: () => (
    <Form>
      <FormField name="email" error="Email is required">
        <FormItem>
          <FormLabel>Email</FormLabel>
          <FormControl>
            <input
              type="email"
              className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>
    </Form>
  ),
};

export const MultipleFields: Story = {
  render: () => (
    <Form>
      <FormField name="name">
        <FormItem>
          <FormLabel>Name</FormLabel>
          <FormControl>
            <input
              type="text"
              placeholder="John Doe"
              className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </FormControl>
        </FormItem>
      </FormField>
      <FormField name="email" error="Invalid email address">
        <FormItem>
          <FormLabel>Email</FormLabel>
          <FormControl>
            <input
              type="email"
              placeholder="you@example.com"
              className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>
      <FormField name="bio">
        <FormItem>
          <FormLabel>Bio</FormLabel>
          <FormControl>
            <textarea
              placeholder="Tell us about yourself"
              className="flex min-h-[80px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </FormControl>
          <FormDescription>Optional. Max 500 characters.</FormDescription>
        </FormItem>
      </FormField>
    </Form>
  ),
};

export const WithCustomErrorMessage: Story = {
  render: () => (
    <Form>
      <FormField name="password" error="Password must be at least 8 characters">
        <FormItem>
          <FormLabel>Password</FormLabel>
          <FormControl>
            <input
              type="password"
              className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </FormControl>
          <FormMessage error="Custom override error message" />
        </FormItem>
      </FormField>
    </Form>
  ),
};
