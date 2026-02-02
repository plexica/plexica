import type { Meta, StoryObj } from '@storybook/react-vite';
import { Footer, FooterLeft, FooterCenter, FooterRight } from './Footer';
import { Badge } from '../Badge/Badge';

const meta: Meta<typeof Footer> = {
  title: 'Layout/Footer',
  component: Footer,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof Footer>;

export const Default: Story = {
  render: () => (
    <Footer>
      <FooterLeft>
        <span className="text-sm text-text-secondary">
          Status:{' '}
          <Badge variant="success" className="ml-1">
            All systems operational
          </Badge>
        </span>
      </FooterLeft>
      <FooterRight>
        <a href="#" className="text-sm text-text-secondary hover:text-text-primary">
          Privacy
        </a>
        <a href="#" className="text-sm text-text-secondary hover:text-text-primary">
          Support
        </a>
      </FooterRight>
    </Footer>
  ),
};

export const WithLinks: Story = {
  render: () => (
    <Footer>
      <FooterLeft>
        <a href="#" className="text-sm text-text-secondary hover:text-text-primary">
          Privacy Policy
        </a>
        <a href="#" className="text-sm text-text-secondary hover:text-text-primary">
          Terms of Service
        </a>
      </FooterLeft>
      <FooterCenter>
        <span className="text-xs text-text-secondary">© 2025 Plexica. All rights reserved.</span>
      </FooterCenter>
      <FooterRight>
        <a href="#" className="text-sm text-text-secondary hover:text-text-primary">
          Support
        </a>
        <a href="#" className="text-sm text-text-secondary hover:text-text-primary">
          Documentation
        </a>
      </FooterRight>
    </Footer>
  ),
};

export const WithStatus: Story = {
  render: () => (
    <Footer>
      <FooterLeft>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-sm text-text-secondary">All systems operational</span>
        </div>
      </FooterLeft>
      <FooterRight>
        <span className="text-xs text-text-secondary">Last updated: 2 minutes ago</span>
      </FooterRight>
    </Footer>
  ),
};

export const Simple: Story = {
  render: () => (
    <Footer>
      <FooterCenter>
        <span className="text-sm text-text-secondary">© 2025 Plexica. All rights reserved.</span>
      </FooterCenter>
    </Footer>
  ),
};
