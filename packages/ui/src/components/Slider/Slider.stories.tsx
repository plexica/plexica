import type { Meta, StoryObj } from '@storybook/react-vite';
import { Slider } from './Slider';
import { Label } from '../Label/Label';
import * as React from 'react';

const meta: Meta<typeof Slider> = {
  title: 'Components/Slider',
  component: Slider,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Slider>;

export const Default: Story = {
  args: {
    defaultValue: [50],
    max: 100,
    step: 1,
  },
};

export const WithLabel: Story = {
  render: () => {
    const [value, setValue] = React.useState([50]);
    return (
      <div className="space-y-4">
        <div className="flex justify-between">
          <Label>Volume</Label>
          <span className="text-sm text-text-secondary">{value[0]}%</span>
        </div>
        <Slider value={value} onValueChange={setValue} max={100} step={1} />
      </div>
    );
  },
};

export const Range: Story = {
  render: () => {
    const [value, setValue] = React.useState([25, 75]);
    return (
      <div className="space-y-4">
        <div className="flex justify-between">
          <Label>Price Range</Label>
          <span className="text-sm text-text-secondary">
            ${value[0]} - ${value[1]}
          </span>
        </div>
        <Slider value={value} onValueChange={setValue} max={100} step={1} />
      </div>
    );
  },
};

export const Steps: Story = {
  render: () => {
    const [value, setValue] = React.useState([5]);
    return (
      <div className="space-y-4">
        <div className="flex justify-between">
          <Label>Rating</Label>
          <span className="text-sm text-text-secondary">{value[0]} stars</span>
        </div>
        <Slider value={value} onValueChange={setValue} max={10} step={1} />
      </div>
    );
  },
};

export const Disabled: Story = {
  args: {
    defaultValue: [50],
    max: 100,
    disabled: true,
  },
};

export const Settings: Story = {
  render: () => {
    const [brightness, setBrightness] = React.useState([70]);
    const [contrast, setContrast] = React.useState([50]);
    const [saturation, setSaturation] = React.useState([60]);

    return (
      <div className="max-w-md space-y-6">
        <h3 className="font-semibold">Display Settings</h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>Brightness</Label>
              <span className="text-sm text-text-secondary">{brightness[0]}%</span>
            </div>
            <Slider value={brightness} onValueChange={setBrightness} max={100} step={1} />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>Contrast</Label>
              <span className="text-sm text-text-secondary">{contrast[0]}%</span>
            </div>
            <Slider value={contrast} onValueChange={setContrast} max={100} step={1} />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>Saturation</Label>
              <span className="text-sm text-text-secondary">{saturation[0]}%</span>
            </div>
            <Slider value={saturation} onValueChange={setSaturation} max={100} step={1} />
          </div>
        </div>
      </div>
    );
  },
};

export const PriceFilter: Story = {
  render: () => {
    const [priceRange, setPriceRange] = React.useState([0, 5000]);

    return (
      <div className="max-w-md space-y-4">
        <div className="flex justify-between">
          <Label>Price Range</Label>
          <span className="text-sm text-text-secondary">
            ${priceRange[0].toLocaleString()} - ${priceRange[1].toLocaleString()}
          </span>
        </div>
        <Slider
          value={priceRange}
          onValueChange={setPriceRange}
          max={10000}
          step={100}
          minStepsBetweenThumbs={1}
        />
        <div className="flex justify-between text-xs text-text-secondary">
          <span>$0</span>
          <span>$10,000</span>
        </div>
      </div>
    );
  },
};

export const TeamSize: Story = {
  render: () => {
    const [size, setSize] = React.useState([10]);
    const sizes = ['1-5', '6-10', '11-20', '21-50', '51-100', '100+'];

    return (
      <div className="max-w-md space-y-4">
        <div className="flex justify-between">
          <Label>Team Size</Label>
          <span className="text-sm text-text-secondary">{sizes[size[0]]} members</span>
        </div>
        <Slider value={size} onValueChange={setSize} max={5} step={1} />
        <div className="flex justify-between text-xs text-text-secondary">
          <span>Small</span>
          <span>Large</span>
        </div>
      </div>
    );
  },
};
